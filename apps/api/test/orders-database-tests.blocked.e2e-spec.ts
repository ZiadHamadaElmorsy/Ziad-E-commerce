/**
 * ORDERS DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { PrismaClient } from '@prisma/client';
import {
  bindTenant,
  clearTenant,
  createTestClient,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedOrder,
  seedProductAndVariant,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Orders database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('order_status enum rejects an unknown status value', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'ord-enum-a', 'Ord Enum A');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "orders" (
              store_id, order_number, channel, status, currency,
              subtotal, discount_total, shipping_total, tax_total, grand_total,
              shipping_address_snapshot, lookup_token
            ) VALUES (
              ${storeId}::uuid, 'ORD-2026-000010', 'ONLINE_PAYMENT', 'BOGUS', 'EGP',
              1000, 0, 0, 0, 1000, '{}'::jsonb, gen_random_uuid()::text
            )`,
          '22P02',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('preserves purchase-time snapshots even after the variant row is gone', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'ord-snap-a', 'Ord Snap A');
        const { variantId } = await seedProductAndVariant(
          tx,
          storeId,
          'ord-snap-p',
          'Snap Product',
        );
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000011');
        await tx.$queryRaw`INSERT INTO "order_items" (
          order_id, product_id, variant_id, product_name_snapshot,
          variant_name_snapshot, sku_snapshot, unit_price, quantity, line_total
        ) VALUES (${orderId}::uuid, NULL, ${variantId}::uuid, 'Snap Product', 'Snap Variant', 'SKU-1', 500, 2, 1000)`;
        // Deleting the variant must NOT affect the snapshot (variant FK SET NULL).
        await tx.$queryRaw`DELETE FROM "product_variants" WHERE id = ${variantId}::uuid`;
        const item = await tx.$queryRaw<{ name: string; sku: string }[]>`
        SELECT product_name_snapshot AS name, sku_snapshot AS sku FROM "order_items"
        WHERE order_id = ${orderId}::uuid`;
        expect(item[0].name).toBe('Snap Product');
        expect(item[0].sku).toBe('SKU-1');
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('guarded status transition: UPDATE WHERE status = PENDING affects exactly one row', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'ord-guard-a', 'Ord Guard A');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000012');
        const first = await tx.$queryRaw<{ count: bigint }[]>`
        UPDATE "orders" SET status = 'CONFIRMED', confirmed_at = now()
        WHERE id = ${orderId}::uuid AND store_id = ${storeId}::uuid AND status = 'PENDING'
        RETURNING 1 AS count`;
        expect(Number(first[0]?.count ?? 0n)).toBe(1);
        // Second attempt: the guarded predicate no longer matches.
        const second = await tx.$queryRaw<{ count: bigint }[]>`
        UPDATE "orders" SET status = 'PROCESSING'
        WHERE id = ${orderId}::uuid AND store_id = ${storeId}::uuid AND status = 'PENDING'
        RETURNING 1 AS count`;
        expect(second.length).toBe(0);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B orders', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'ord-rls-a', 'Ord RLS A');
        const storeB = await seedStore(tx, 'ord-rls-b', 'Ord RLS B');
        await seedOrder(tx, storeB, 'ORD-2026-000013');

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "orders" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);

        // Guarded write to Store B's order must affect zero rows under RLS.
        const forged = await tx.$queryRaw<{ count: bigint }[]>`
        UPDATE "orders" SET status = 'CANCELLED'
        WHERE id = (SELECT id FROM "orders" WHERE store_id = ${storeB}::uuid LIMIT 1)
          AND status = 'PENDING'
        RETURNING 1`;
        expect(Number(forged[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
