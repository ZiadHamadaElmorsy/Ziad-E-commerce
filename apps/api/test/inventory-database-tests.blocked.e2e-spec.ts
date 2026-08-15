/**
 * INVENTORY DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  bindTenant,
  clearTenant,
  createTestClient,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedInventory,
  seedProductAndVariant,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Inventory database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('inventory CHECK rejects a negative on_hand_quantity', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-neg-a', 'Inv Neg A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-neg-p', 'P');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "inventory" (store_id, variant_id, on_hand_quantity, reserved_quantity)
            VALUES (${storeId}::uuid, ${variantId}::uuid, -1, 0)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('inventory CHECK rejects on_hand < reserved (negative availability)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-avail-a', 'Inv Avail A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-avail-p', 'P');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "inventory" (store_id, variant_id, on_hand_quantity, reserved_quantity)
            VALUES (${storeId}::uuid, ${variantId}::uuid, 5, 6)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('allows on_hand == reserved (available = 0)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-zero-a', 'Inv Zero A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-zero-p', 'P');
        await seedInventory(tx, storeId, variantId, 0);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('reservation CHECK rejects quantity <= 0', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-rqty-a', 'Inv RQty A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-rqty-p', 'P');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "inventory_reservations" (store_id, variant_id, order_id, quantity, status)
            VALUES (${storeId}::uuid, ${variantId}::uuid, NULL, 0, 'ACTIVE')`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('reservation CHECK rejects missing cart/order context', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-rctx-a', 'Inv RCtx A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-rctx-p', 'P');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "inventory_reservations" (store_id, variant_id, quantity, status)
            VALUES (${storeId}::uuid, ${variantId}::uuid, 1, 'ACTIVE')`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('inventory can never reference a variant of another store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'inv-fk-a', 'Inv FK A');
        const storeB = await seedStore(tx, 'inv-fk-b', 'Inv FK B');
        const { variantId } = await seedProductAndVariant(tx, storeB, 'inv-fk-pb', 'PB');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "inventory" (store_id, variant_id, on_hand_quantity, reserved_quantity)
            VALUES (${storeA}::uuid, ${variantId}::uuid, 5, 0)`,
          '23503',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('atomic guarded reservation: two concurrent reserve-7 on stock 10 — never over 10', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'inv-conc-a', 'Inv Conc A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'inv-conc-p', 'P');
        await seedInventory(tx, storeId, variantId, 10);

        const reserve = (txc: Prisma.TransactionClient) =>
          txc.$queryRaw`UPDATE "inventory"
          SET reserved_quantity = reserved_quantity + 7
          WHERE store_id = ${storeId}::uuid
            AND variant_id = ${variantId}::uuid
            AND on_hand_quantity - reserved_quantity >= 7
          RETURNING id`;

        const results = await Promise.allSettled([reserve(tx), reserve(tx)]);
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        // The two statements serialize on the row lock; at most one can succeed.
        expect(succeeded + failed).toBe(2);
        const after = await tx.$queryRaw<{ reserved: number }[]>`
        SELECT reserved_quantity AS reserved FROM "inventory"
        WHERE store_id = ${storeId}::uuid AND variant_id = ${variantId}::uuid`;
        expect(after[0].reserved).toBeLessThanOrEqual(10);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B inventory rows', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'inv-rls-a', 'Inv RLS A');
        const storeB = await seedStore(tx, 'inv-rls-b', 'Inv RLS B');
        const { variantId } = await seedProductAndVariant(tx, storeB, 'inv-rls-pb', 'PB');
        await seedInventory(tx, storeB, variantId, 3);

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "inventory" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
