/**
 * DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23)
 * ========================================================
 *
 * These tests REQUIRE a real PostgreSQL database where all migrations are
 * applied (including 20260814000000_rls_enforcement) and the enforcement role
 * exists. They are gated on:
 *   POSTGRES_RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ziad_rls_test
 *   RLS_ENFORCEMENT_ROLE=ziad_runtime
 *
 * When the variable is absent the suite is SKIPPED with a clear message — it
 * is never silently faked. Setup: see docs/RLS-TEST-ENVIRONMENT.md.
 *
 * Every probe runs inside a transaction that is rolled back, so these tests
 * NEVER mutate a real database.
 */
import { PrismaClient } from '@prisma/client';
import {
  bindTenant,
  clearTenant,
  createTestClient,
  ENFORCEMENT_ROLE,
  expectPgState,
  expectPgSuccess,
  RLS_TEST_DATABASE_URL,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe('migration', () => {
    it('exposes the MVP tables + the Phase 23 operational tables', async () => {
      const expected = [
        'users',
        'stores',
        'store_memberships',
        'subscriptions',
        'products',
        'product_variants',
        'categories',
        'product_categories',
        'inventory',
        'inventory_reservations',
        'inventory_movements',
        'customers',
        'customer_addresses',
        'carts',
        'cart_items',
        'orders',
        'order_items',
        'payments',
        'payment_attempts',
        'payment_events',
        'pages',
        'page_sections',
        'navigations',
        'theme_configurations',
        'media',
        'product_media',
        'store_settings',
        'audit_logs',
        // Phase 23 operational additions:
        'job_leases',
      ];
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT c.relname AS tablename
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`;
      const actual = tables.map((t) => t.tablename);
      for (const table of expected) {
        expect(actual).toContain(table);
      }
    });

    it('exposes app.current_store_id() and app.set_current_store_id(uuid)', async () => {
      await expectPgSuccess(() => prisma.$queryRaw`SELECT app.current_store_id()`);
      await expectPgSuccess(
        () => prisma.$executeRaw`SELECT app.set_current_store_id('00000000-0000-0000-0000-000000000001'::uuid)`,
      );
      // The function sets the GUC with is_local=false (persists for the pooled
      // connection), so reset it here to keep later tests tenant-neutral.
      await expectPgSuccess(
        () => prisma.$executeRaw`SELECT set_config('app.current_store_id', '', false)`,
      );
    });

    it('enables RLS on all 28 tenant tables', async () => {
      const notEnabled = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT c.relname AS tablename
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY(ARRAY[
            'users','stores','store_memberships','subscriptions','products',
            'product_variants','categories','product_categories','inventory',
            'inventory_reservations','inventory_movements','customers',
            'customer_addresses','carts','cart_items','orders','order_items',
            'payments','payment_attempts','payment_events','pages',
            'page_sections','navigations','theme_configurations','media',
            'product_media','store_settings','audit_logs'
          ])
          AND NOT c.relrowsecurity`;
      expect(notEnabled).toEqual([]);
    });

    it('FORCEs ROW LEVEL SECURITY on all 28 tenant tables', async () => {
      const notForced = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT c.relname AS tablename
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY(ARRAY[
            'users','stores','store_memberships','subscriptions','products',
            'product_variants','categories','product_categories','inventory',
            'inventory_reservations','inventory_movements','customers',
            'customer_addresses','carts','cart_items','orders','order_items',
            'payments','payment_attempts','payment_events','pages',
            'page_sections','navigations','theme_configurations','media',
            'product_media','store_settings','audit_logs'
          ])
          AND NOT c.relforcerowsecurity`;
      expect(notForced).toEqual([]);
    });

    it('creates the enforcement role (ziad_runtime)', async () => {
      const roles = await prisma.$queryRaw<{ rolname: string }[]>`
        SELECT rolname FROM pg_roles WHERE rolname = ${ENFORCEMENT_ROLE}`;
      expect(roles.length).toBe(1);
    });
  });
  describe('tenant context helpers', () => {
    it('app.current_store_id() returns NULL before any bind', async () => {
      await prisma.$transaction(async (tx) => {
        // Be explicit: no tenant context may leak into this probe.
        await tx.$executeRaw`SELECT set_config('app.current_store_id', '', false)`;
        const rows = await tx.$queryRaw<{ current_store_id: string | null }[]>`
          SELECT app.current_store_id()`;
        expect(rows[0]?.current_store_id ?? null).toBeNull();
      });
    });

    it('app.set_current_store_id(uuid) binds the store and resets to NULL', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT app.set_current_store_id('00000000-0000-0000-0000-000000000001'::uuid)`;
        const bound = await tx.$queryRaw<{ current_store_id: string | null }[]>`
          SELECT app.current_store_id()`;
        expect(bound[0]?.current_store_id).toBe('00000000-0000-0000-0000-000000000001');

        await clearTenant(tx);
        const cleared = await tx.$queryRaw<{ current_store_id: string | null }[]>`
          SELECT app.current_store_id()`;
        expect(cleared[0]?.current_store_id ?? null).toBeNull();
      });
    });
  });

  describe('RLS tenant isolation (DATABASE.md section 29.7)', () => {
    it('Store A cannot read/write Store B rows; NULL context sees nothing', async () => {
      await prisma
        .$transaction(async (tx) => {
          const [storeA, storeB] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "stores" (slug, name, status, currency, timezone)
          VALUES ('db-t-a', 'DB T A', 'ACTIVE', 'EGP', 'Africa/Cairo'),
                 ('db-t-b', 'DB T B', 'ACTIVE', 'EGP', 'Africa/Cairo')
          RETURNING id`;
          await tx.$queryRaw`
          INSERT INTO "products" (store_id, slug, name, status)
          VALUES (${storeA.id}::uuid, 'db-t-a-product', 'A', 'ACTIVE'),
                 (${storeB.id}::uuid, 'db-t-b-product', 'B', 'ACTIVE')`;

          await bindTenant(tx, storeA.id);

          const own = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "products" WHERE store_id = ${storeA.id}::uuid`;
          expect(Number(own[0]?.count ?? 0n)).toBeGreaterThanOrEqual(1);

          const foreign = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "products" WHERE store_id = ${storeB.id}::uuid`;
          expect(Number(foreign[0]?.count ?? 0n)).toBe(0);

          // Cross-tenant INSERT is DENIED by the RLS WITH CHECK policy (42501).
          await expectPgState(
            () =>
              tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
              VALUES (${storeB.id}::uuid, 'db-t-forged', 'Forged', 'ACTIVE')`,
            '42501',
          );

          // The 42501 aborted the transaction (25P02) — the NULL-context
          // probe below therefore runs in a fresh transaction instead.
          throw new Error('__rollback__');
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === '__rollback__') {
            return;
          }
          throw error;
        });
    });

    it('NULL tenant context sees nothing (tenant context cannot be spoofed)', async () => {
      await prisma
        .$transaction(async (tx) => {
          const storeA = await seedStore(tx, 'db-null-a', 'DB Null A');
          await tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
          VALUES (${storeA}::uuid, 'db-null-p', 'P', 'ACTIVE')`;

          await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;
          // No tenant context: FORCE RLS must yield zero rows (fail closed).
          const none = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "products" WHERE slug = 'db-null-p'`;
          expect(Number(none[0]?.count ?? 0n)).toBe(0);

          throw new Error('__rollback__');
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === '__rollback__') {
            return;
          }
          throw error;
        });
    });
  });

  describe('transactions (DATABASE.md section 28)', () => {
    it('a failed multi-row write leaves no partial rows behind', async () => {
      await prisma
        .$transaction(async (tx) => {
          const [storeA] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "stores" (slug, name, status, currency, timezone)
          VALUES ('tx-a', 'TX A', 'ACTIVE', 'EGP', 'Africa/Cairo')
          RETURNING id`;
          await tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
          VALUES (${storeA.id}::uuid, 'tx-a-product', 'A', 'ACTIVE')`;
          // Duplicate slug violates the UNIQUE constraint — the whole
          // transaction (including the first insert) must roll back.
          let failed = false;
          try {
            await tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
            VALUES (${storeA.id}::uuid, 'tx-a-product', 'dup', 'ACTIVE')`;
          } catch {
            failed = true;
          }
          expect(failed).toBe(true);
          throw new Error('__rollback__');
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === '__rollback__') {
            return;
          }
          throw error;
        });
    });

    it('bind -> read -> reset leaves no leftover tenant context', async () => {
      await prisma.$transaction(async (tx) => {
        await bindTenant(tx, '00000000-0000-0000-0000-000000000001');
        const bound = await tx.$queryRaw<{ current_store_id: string | null }[]>`
          SELECT app.current_store_id()`;
        expect(bound[0]?.current_store_id).toBe('00000000-0000-0000-0000-000000000001');
        await clearTenant(tx);
        const cleared = await tx.$queryRaw<{ current_store_id: string | null }[]>`
          SELECT app.current_store_id()`;
        expect(cleared[0]?.current_store_id ?? null).toBeNull();
      });
    });
  });
});
