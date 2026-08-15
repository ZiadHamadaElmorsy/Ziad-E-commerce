/**
 * STOREFRONT DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { PrismaClient } from '@prisma/client';
import {
  createTestClient,
  ENFORCEMENT_ROLE,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedProductAndVariant,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Storefront database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('the anon role can read ACTIVE products only for the resolved store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'sf-anon-a', 'SF Anon A');
        const storeB = await seedStore(tx, 'sf-anon-b', 'SF Anon B');
        await seedProductAndVariant(tx, storeA, 'sf-anon-pa', 'PA');
        await seedProductAndVariant(tx, storeB, 'sf-anon-pb', 'PB');

        await tx.$executeRaw`SELECT set_config('role', 'anon', true)`;
        await tx.$executeRaw`SELECT app.set_current_store_id(${storeA}::uuid)`;

        const visible = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products"
        WHERE status = 'ACTIVE' AND slug = 'sf-anon-pa'`;
        expect(Number(visible[0]?.count ?? 0n)).toBe(1);

        const hidden = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE slug = 'sf-anon-pb'`;
        expect(Number(hidden[0]?.count ?? 0n)).toBe(0);

        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('the anon role cannot read orders/payments (merchant-only tables)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'sf-anon2-a', 'SF Anon2 A');
        await tx.$executeRaw`SELECT set_config('role', 'anon', true)`;
        await tx.$executeRaw`SELECT app.set_current_store_id(${storeId}::uuid)`;
        // anon has no table privilege on merchant-only tables at all — the
        // query is denied (42501), which also proves orders are not public.
        await expectPgState(
          () => tx.$queryRaw`SELECT count(*)::bigint AS count FROM "orders"`,
          '42501',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('the enforcement role sees rows only after the tenant is bound (fail closed by default)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'sf-force-a', 'SF Force A');
        await seedProductAndVariant(tx, storeId, 'sf-force-p', 'P');

        await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;
        // No tenant context yet: FORCE RLS must yield zero rows (fail closed).
        const none = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE store_id = ${storeId}::uuid`;
        expect(Number(none[0]?.count ?? 0n)).toBe(0);

        await tx.$executeRaw`SELECT app.set_current_store_id(${storeId}::uuid)`;
        const visible = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE store_id = ${storeId}::uuid`;
        expect(Number(visible[0]?.count ?? 0n)).toBe(1);

        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
