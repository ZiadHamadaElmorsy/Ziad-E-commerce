/**
 * PAYMENTS DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
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
  seedPayment,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Payments database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('payments CHECK (amount > 0) rejects a zero amount', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'pay-amt-a', 'Pay Amt A');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000020');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "payments" (store_id, order_id, status, provider, amount, currency)
            VALUES (${storeId}::uuid, ${orderId}::uuid, 'PENDING', 'paymob', 0, 'EGP')`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('payments partial UNIQUE (provider, provider_reference) rejects a duplicate reference', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'pay-ref-a', 'Pay Ref A');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000021');
        await seedPayment(tx, storeId, orderId, 'ref-1');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "payments" (store_id, order_id, status, provider, amount, currency, provider_reference)
            VALUES (${storeId}::uuid, ${orderId}::uuid, 'PENDING', 'paymob', 1000, 'EGP', 'ref-1')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('payment_events UNIQUE (provider, provider_event_id) dedupes webhook deliveries', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'pay-ev-a', 'Pay Ev A');
        const orderId = await seedOrder(tx, storeId, 'ORD-2026-000022');
        const paymentId = await seedPayment(tx, storeId, orderId);
        await tx.$queryRaw`INSERT INTO "payment_events" (
          store_id, payment_id, provider, provider_event_id, event_type, payload, signature_verified, processing_status
        ) VALUES (${storeId}::uuid, ${paymentId}::uuid, 'paymob', 'ev-1', 'transaction', '{}'::jsonb, true, 'RECEIVED')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "payment_events" (
            store_id, payment_id, provider, provider_event_id, event_type, payload, signature_verified, processing_status
          ) VALUES (${storeId}::uuid, ${paymentId}::uuid, 'paymob', 'ev-1', 'transaction', '{}'::jsonb, true, 'RECEIVED')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('a payment can never reference another store order (composite FK)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'pay-fk-a', 'Pay FK A');
        const storeB = await seedStore(tx, 'pay-fk-b', 'Pay FK B');
        const orderB = await seedOrder(tx, storeB, 'ORD-2026-000023');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "payments" (store_id, order_id, status, provider, amount, currency)
            VALUES (${storeA}::uuid, ${orderB}::uuid, 'PENDING', 'paymob', 1000, 'EGP')`,
          '23503',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B payments', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'pay-rls-a', 'Pay RLS A');
        const storeB = await seedStore(tx, 'pay-rls-b', 'Pay RLS B');
        const orderB = await seedOrder(tx, storeB, 'ORD-2026-000024');
        await seedPayment(tx, storeB, orderB);

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "payments" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
