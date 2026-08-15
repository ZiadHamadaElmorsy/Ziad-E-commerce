/**
 * CHECKOUT DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 * Every probe runs inside a transaction that is rolled back.
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

describeOrSkip('Checkout database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('orders UNIQUE (store_id, order_number) rejects a duplicate order number', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-uniq-a', 'CO Uniq A');
        await seedOrder(tx, storeId, 'ORD-2026-000001');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "orders" (
              store_id, order_number, channel, status, currency,
              subtotal, discount_total, shipping_total, tax_total, grand_total,
              shipping_address_snapshot, lookup_token
            ) VALUES (
              ${storeId}::uuid, 'ORD-2026-000001', 'ONLINE_PAYMENT', 'PENDING', 'EGP',
              1000, 0, 0, 0, 1000, '{}'::jsonb, gen_random_uuid()::text
            )`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('orders partial UNIQUE (store_id, idempotency_key) rejects a reused idempotency key', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-key-a', 'CO Key A');
        await seedOrder(tx, storeId, 'ORD-2026-000002', { idempotencyKey: 'key-1' });
        await expectPgState(
          () => seedOrder(tx, storeId, 'ORD-2026-000003', { idempotencyKey: 'key-1' }),
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('orders CHECK rejects an inconsistent grand_total', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-gt-a', 'CO GT A');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "orders" (
              store_id, order_number, channel, status, currency,
              subtotal, discount_total, shipping_total, tax_total, grand_total,
              shipping_address_snapshot, lookup_token
            ) VALUES (
              ${storeId}::uuid, 'ORD-2026-000004', 'ONLINE_PAYMENT', 'PENDING', 'EGP',
              1000, 0, 0, 0, 999, '{}'::jsonb, gen_random_uuid()::text
            )`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('order_items CHECK rejects quantity = 0', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-oi-a', 'CO OI A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'co-oi-p', 'P');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000005');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "order_items" (
              order_id, product_id, variant_id, product_name_snapshot,
              variant_name_snapshot, sku_snapshot, unit_price, quantity, line_total
            ) VALUES (${orderId}::uuid, NULL, ${variantId}::uuid, 'P', 'P', NULL, 1000, 0, 0)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('inventory_reservations CHECK requires cart_id or order_id context', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-res-a', 'CO Res A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'co-res-p', 'P');
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

  it('RLS: a member cannot create an order for another store (parent-tenant boundary)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'co-fk-a', 'CO FK A');
        const storeB = await seedStore(tx, 'co-fk-b', 'CO FK B');
        const customers = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "customers" (store_id, phone, first_name, last_name)
        VALUES (${storeB}::uuid, '01000000000', 'B', 'C') RETURNING id`;
        // orders.customer_id is intentionally NOT a composite tenant FK
        // (customers are store-scoped at the application layer); the tenant
        // boundary the database enforces is the orders.store_id policy.
        await bindTenant(tx, storeA);
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "orders" (
              store_id, order_number, customer_id, channel, status, currency,
              subtotal, discount_total, shipping_total, tax_total, grand_total,
              shipping_address_snapshot, lookup_token
            ) VALUES (
              ${storeB}::uuid, 'ORD-2026-000006', ${customers[0].id}::uuid,
              'ONLINE_PAYMENT', 'PENDING', 'EGP',
              1000, 0, 0, 0, 1000, '{}'::jsonb, gen_random_uuid()::text
            )`,
          '42501',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('rolls back the whole checkout transaction when a later write fails', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'co-tx-a', 'CO TX A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'co-tx-p', 'P');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000007');
        let failed = false;
        try {
          // quantity = 0 violates the order_items CHECK -> whole tx aborts.
          await tx.$queryRaw`INSERT INTO "order_items" (
            order_id, product_id, variant_id, product_name_snapshot,
            variant_name_snapshot, sku_snapshot, unit_price, quantity, line_total
          ) VALUES (${orderId}::uuid, NULL, ${variantId}::uuid, 'P', 'P', NULL, 1000, 0, 0)`;
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        // PostgreSQL aborted the whole transaction — any further statement
        // raises 25P02, proving no partial state can persist (Prisma rolls
        // the transaction back on exit).
        await expectPgState(
          () => tx.$queryRaw`SELECT count(*)::bigint AS count FROM "orders" WHERE id = ${orderId}::uuid`,
          '25P02',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B orders', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'co-rls-a', 'CO RLS A');
        const storeB = await seedStore(tx, 'co-rls-b', 'CO RLS B');
        await seedOrder(tx, storeB, 'ORD-2026-000008');

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "orders" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
