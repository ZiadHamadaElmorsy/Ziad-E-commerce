/**
 * CUSTOMER DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { PrismaClient } from '@prisma/client';
import {
  bindTenant,
  clearTenant,
  createTestClient,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Customer database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('customers UNIQUE (store_id, email) rejects a duplicate email in the same store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cus-uniq-a', 'Cus Uniq A');
        await tx.$queryRaw`INSERT INTO "customers" (store_id, email, phone, first_name, last_name)
        VALUES (${storeId}::uuid, 'a@example.com', '01000000001', 'A', 'B')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "customers" (store_id, email, phone, first_name, last_name)
            VALUES (${storeId}::uuid, 'a@example.com', '01000000002', 'A', 'B')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('allows the same email in a different store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cus-email-a', 'Cus Email A');
        const storeB = await seedStore(tx, 'cus-email-b', 'Cus Email B');
        await tx.$queryRaw`INSERT INTO "customers" (store_id, email, phone, first_name, last_name)
        VALUES (${storeA}::uuid, 'same@example.com', '01000000001', 'A', 'B')`;
        await tx.$queryRaw`INSERT INTO "customers" (store_id, email, phone, first_name, last_name)
        VALUES (${storeB}::uuid, 'same@example.com', '01000000002', 'A', 'B')`;
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('customer_addresses composite FK rejects an address for another store customer', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cus-fk-a', 'Cus FK A');
        const storeB = await seedStore(tx, 'cus-fk-b', 'Cus FK B');
        const customers = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "customers" (store_id, phone, first_name, last_name)
        VALUES (${storeB}::uuid, '01000000001', 'B', 'C') RETURNING id`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "customer_addresses" (store_id, customer_id, first_name, last_name, city, address_line)
            VALUES (${storeA}::uuid, ${customers[0].id}::uuid, 'F', 'L', 'Cairo', 'Street')`,
          '23503',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B customers', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cus-rls-a', 'Cus RLS A');
        const storeB = await seedStore(tx, 'cus-rls-b', 'Cus RLS B');
        await tx.$queryRaw`INSERT INTO "customers" (store_id, phone, first_name, last_name)
        VALUES (${storeB}::uuid, '01000000001', 'B', 'C')`;

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "customers" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
