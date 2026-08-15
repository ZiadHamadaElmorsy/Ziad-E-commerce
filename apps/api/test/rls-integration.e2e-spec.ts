/**
 * RLS ENFORCEMENT INTEGRATION TESTS — Phase 21
 * ==============================================
 *
 * Real PostgreSQL cross-tenant isolation probes (the "database-level RLS"
 * guarantee the audit required). These tests require a dedicated database
 * where the Phase 21 RLS enforcement migration
 * (20260814000000_rls_enforcement) has been applied AND the enforcement role
 * (`ziad_runtime`) exists.
 *
 * Enable by setting:
 *   POSTGRES_RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ziad_rls_test
 *   RLS_ENFORCEMENT_ROLE=ziad_runtime
 *
 * When the environment variable is absent the suite is SKIPPED with a clear
 * message — it is never silently faked. (Phase 20 audit: 262 RLS/database
 * e2e tests remain blocked for lack of a local PostgreSQL.)
 *
 * The probes use a transaction that is rolled back, so they never mutate the
 * database.
 */
import { PrismaClient } from '@prisma/client';
import { expectPgState } from './db-helpers';

const TEST_DATABASE_URL = process.env.POSTGRES_RLS_TEST_DATABASE_URL;
const ENFORCEMENT_ROLE = process.env.RLS_ENFORCEMENT_ROLE ?? 'ziad_runtime';

const describeOrSkip = TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('RLS effective enforcement (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('forbid cross-tenant reads, writes and inserts at the database level', async () => {
    await prisma.$transaction(async (tx) => {
      const [storeA, storeB] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "stores" (slug, name, status, currency, timezone)
        VALUES ('rls-it-a', 'RLS IT A', 'ACTIVE', 'EGP', 'Africa/Cairo'),
               ('rls-it-b', 'RLS IT B', 'ACTIVE', 'EGP', 'Africa/Cairo')
        RETURNING id`;
      await tx.$queryRaw`
        INSERT INTO "products" (store_id, slug, name, status)
        VALUES (${storeA.id}::uuid, 'rls-it-a-product', 'A', 'ACTIVE'),
               (${storeB.id}::uuid, 'rls-it-b-product', 'B', 'ACTIVE')`;

      // set_config('role', ...) is the parameterizable equivalent of
      // SET LOCAL ROLE for Prisma's raw client.
      await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;
      await tx.$executeRaw`SELECT app.set_current_store_id(${storeA.id}::uuid)`;

      const own = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products"
        WHERE store_id = ${storeA.id}::uuid AND slug = 'rls-it-a-product'`;
      expect(Number(own[0]?.count ?? 0n)).toBe(1);

      const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products"
        WHERE store_id = ${storeB.id}::uuid AND slug = 'rls-it-b-product'`;
      expect(Number(foreign[0]?.count ?? 0n)).toBe(0);

      // Tenant context cannot be spoofed (transaction-scoped clear).
      await tx.$executeRaw`SELECT set_config('app.current_store_id', '', true)`;
      const none = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE slug LIKE 'rls-it-%'`;
      expect(Number(none[0]?.count ?? 0n)).toBe(0);

      // Cross-tenant INSERT is DENIED by the RLS WITH CHECK policy (42501).
      // Kept last: the denial aborts the transaction before the rollback.
      await expectPgState(
        () =>
          tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
          VALUES (${storeB.id}::uuid, 'rls-it-forged', 'Forged', 'ACTIVE')`,
        '42501',
      );

      throw new Error('__rollback__');
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === '__rollback__') {
        return;
      }
      throw error;
    });
  });

  it('FORCE ROW LEVEL SECURITY is applied to all 28 tenant tables', async () => {
    const tables = [
      'users', 'stores', 'store_memberships', 'subscriptions', 'products',
      'product_variants', 'categories', 'product_categories', 'inventory',
      'inventory_reservations', 'inventory_movements', 'customers',
      'customer_addresses', 'carts', 'cart_items', 'orders', 'order_items',
      'payments', 'payment_attempts', 'payment_events', 'pages',
      'page_sections', 'navigations', 'theme_configurations', 'media',
      'product_media', 'store_settings', 'audit_logs',
    ];
    const notForced = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY(${tables}::text[])
        AND NOT c.relforcerowsecurity`;
    expect(notForced).toEqual([]);
  });
});
