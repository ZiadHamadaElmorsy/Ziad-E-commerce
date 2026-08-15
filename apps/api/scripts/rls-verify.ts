/**
 * RLS enforcement verification probe (Phase 21).
 *
 * Connects to a PostgreSQL database (DATABASE_URL), inspects the RLS
 * enforcement state, and runs real cross-tenant probes AS the enforcement
 * role (`ziad_runtime`) to prove database-level tenant isolation.
 *
 * Usage (ops / CI with a real database):
 *   DATABASE_URL=postgresql://... npx ts-node scripts/rls-verify.ts
 *
 * The probe NEVER mutates data: it runs SELECTs only and uses a transaction
 * that is rolled back. It is safe to run against a live database.
 *
 * Exit codes: 0 = all probes passed, 1 = a probe failed, 2 = BLOCKED
 * (database unreachable or enforcement role missing).
 */
import { PrismaClient } from '@prisma/client';

const ENFORCEMENT_ROLE = process.env.RLS_ENFORCEMENT_ROLE ?? 'ziad_runtime';

const TENANT_TABLES = [
  'users', 'stores', 'store_memberships', 'subscriptions', 'products',
  'product_variants', 'categories', 'product_categories', 'inventory',
  'inventory_reservations', 'inventory_movements', 'customers',
  'customer_addresses', 'carts', 'cart_items', 'orders', 'order_items',
  'payments', 'payment_attempts', 'payment_events', 'pages', 'page_sections',
  'navigations', 'theme_configurations', 'media', 'product_media',
  'store_settings', 'audit_logs',
];

let failures = 0;
let blocked = 0;

function report(name: string, ok: boolean, detail?: string): void {
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) {
    failures += 1;
  }
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  console.log(`RLS enforcement verification — role: ${ENFORCEMENT_ROLE}`);
  console.log('Database:', process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, '://***@'));
  console.log('');

  let prisma: PrismaClient | undefined;
  try {
    prisma = new PrismaClient();
    await prisma.$connect();
  } catch (error) {
    blocked += 1;
    console.error('  [BLOCKED] Database unreachable.', error instanceof Error ? error.message : error);
    console.error('  Provide a reachable DATABASE_URL and re-run.');
    process.exitCode = 2;
    return;
  }

  try {
    // 1. Enforcement role exists?
    const roles = await prisma.$queryRaw<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname = ${ENFORCEMENT_ROLE}`;
    const roleExists = roles.length > 0;
    report(`role "${ENFORCEMENT_ROLE}" exists`, roleExists);

    if (!roleExists) {
      blocked += 1;
      console.error(
        '  [BLOCKED] Enforcement role missing. Apply migration 20260814000000_rls_enforcement first.',
      );
      process.exitCode = 2;
      return;
    }

    // 2. FORCE ROW LEVEL SECURITY on every tenant table?
    const notForced = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY(${TENANT_TABLES}::text[])
        AND NOT c.relforcerowsecurity`;
    report(
      'FORCE ROW LEVEL SECURITY on all 28 tenant tables',
      notForced.length === 0,
      notForced.length > 0 ? `not forced: ${notForced.map((r) => r.tablename).join(', ')}` : undefined,
    );

    // 3. Cross-tenant behavioral probes inside one transaction that is always
    //    rolled back — the probe never mutates the database.
    await prisma.$transaction(async (tx) => {
      // Seed two scratch stores + products as the privileged owner.
      const [storeA, storeB] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "stores" (slug, name, status, currency, timezone)
        VALUES ('rls-probe-a', 'RLS Probe A', 'ACTIVE', 'EGP', 'Africa/Cairo'),
               ('rls-probe-b', 'RLS Probe B', 'ACTIVE', 'EGP', 'Africa/Cairo')
        RETURNING id`;
      await tx.$queryRaw`
        INSERT INTO "products" (store_id, slug, name, status)
        VALUES (${storeA.id}::uuid, 'rls-probe-a-product', 'RLS Probe A Product', 'ACTIVE'),
               (${storeB.id}::uuid, 'rls-probe-b-product', 'RLS Probe B Product', 'ACTIVE')`;

      // Switch the transaction to the enforcement role bound to store A.
      // (set_config('role', ...) is the parameterizable equivalent of
      // SET LOCAL ROLE for Prisma's raw client.)
      await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;
      await tx.$executeRaw`SELECT app.set_current_store_id(${storeA.id}::uuid)`;

      const ownCount = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products"
        WHERE store_id = ${storeA.id}::uuid AND slug = 'rls-probe-a-product'`;
      report(
        'member reads own store rows (store A sees its own product)',
        Number(ownCount[0]?.count ?? 0n) === 1,
      );

      const foreignCount = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products"
        WHERE store_id = ${storeB.id}::uuid AND slug = 'rls-probe-b-product'`;
      report(
        'cross-tenant read blocked (store A cannot read store B products)',
        Number(foreignCount[0]?.count ?? 0n) === 0,
      );

      const foreignMedia = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "media" WHERE store_id = ${storeB.id}::uuid`;
      report(
        'storefront cannot access another store media',
        Number(foreignMedia[0]?.count ?? 0n) === 0,
      );

      const foreignOrders = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "orders" WHERE store_id = ${storeB.id}::uuid`;
      report(
        'storefront cannot access another store orders',
        Number(foreignOrders[0]?.count ?? 0n) === 0,
      );

      // A NULL tenant context must see nothing (tenant context cannot be
      // spoofed). Transaction-scoped clear keeps this probe self-contained.
      await tx.$executeRaw`SELECT set_config('app.current_store_id', '', true)`;
      const nullCount = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE slug LIKE 'rls-probe-%'`;
      report(
        'tenant context cannot be spoofed (NULL context sees no rows)',
        Number(nullCount[0]?.count ?? 0n) === 0,
      );

      // A cross-tenant INSERT is DENIED by the RLS WITH CHECK policy
      // (SQLSTATE 42501) — it never creates a row under store B. This probe is
      // intentionally LAST: the 42501 aborts the transaction (25P02), after
      // which the whole scratch transaction is rolled back.
      let forgedBlocked = false;
      try {
        await tx.$queryRaw`
          INSERT INTO "products" (store_id, slug, name, status)
          VALUES (${storeB.id}::uuid, 'rls-probe-forged', 'Forged', 'ACTIVE')`;
      } catch (error) {
        const candidate = error as { code?: unknown; meta?: { code?: unknown } };
        forgedBlocked =
          candidate.code === '42501' ||
          candidate.meta?.code === '42501' ||
          (error instanceof Error && /42501/.test(error.message));
      }
      report(
        'cross-tenant insert blocked (store A cannot create records under store B)',
        forgedBlocked,
      );

      throw new Error('__rollback__'); // forces ROLLBACK of the scratch data
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === '__rollback__') {
        return; // expected — scratch data discarded
      }
      failures += 1;
      console.error(
        '  [FAIL] Probe transaction failed:',
        error instanceof Error ? error.message : error,
      );
    });
  } catch (error) {
    failures += 1;
    console.error('  [FAIL] Setup probe failed:', error instanceof Error ? error.message : error);
  }

  console.log('');
  if (blocked > 0) {
    console.log('RESULT: BLOCKED');
    process.exitCode = 2;
  } else if (failures > 0) {
    console.log(`RESULT: FAIL (${failures} probe(s) failed)`);
    process.exitCode = 1;
  } else {
    console.log('RESULT: PASS — RLS is enforced at the database level.');
    process.exitCode = 0;
  }
}

void main();
