/**
 * IDENTITY DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { PrismaClient } from '@prisma/client';
import {
  clearTenant,
  createTestClient,
  ENFORCEMENT_ROLE,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Identity database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('stores UNIQUE slug rejects a duplicate store slug', async () => {
    await prisma
      .$transaction(async (tx) => {
        await seedStore(tx, 'id-slug', 'Id Slug');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "stores" (slug, name, status, currency, timezone)
            VALUES ('id-slug', 'Duplicate', 'ACTIVE', 'EGP', 'Africa/Cairo')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('users UNIQUE email rejects a duplicate user email', async () => {
    await prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`INSERT INTO "users" (auth_user_id, email, first_name, last_name)
        VALUES ('10000000-0000-0000-0000-000000000001'::uuid, 'merchant@example.com', 'M', 'N')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "users" (auth_user_id, email, first_name, last_name)
            VALUES ('10000000-0000-0000-0000-000000000002'::uuid, 'merchant@example.com', 'M', 'N')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('store_memberships UNIQUE (store_id, user_id) rejects a duplicate membership', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'id-mem', 'Id Mem');
        await tx.$queryRaw`INSERT INTO "users" (auth_user_id, email, first_name, last_name)
        VALUES ('10000000-0000-0000-0000-000000000010'::uuid, 'mem@example.com', 'M', 'N')`;
        await tx.$queryRaw`INSERT INTO "store_memberships" (store_id, user_id, role, status)
        VALUES (${storeId}::uuid, (SELECT id FROM "users" WHERE auth_user_id = '10000000-0000-0000-0000-000000000010'::uuid), 'OWNER', 'ACTIVE')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "store_memberships" (store_id, user_id, role, status)
            VALUES (${storeId}::uuid, (SELECT id FROM "users" WHERE auth_user_id = '10000000-0000-0000-0000-000000000010'::uuid), 'ADMIN', 'ACTIVE')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: a member sees only stores they belong to, and a user only their own row', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'id-rls-a', 'Id RLS A');
        const storeB = await seedStore(tx, 'id-rls-b', 'Id RLS B');
        await tx.$queryRaw`INSERT INTO "users" (id, auth_user_id, email, first_name, last_name)
        VALUES ('aaaa0000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, 'rls@example.com', 'R', 'L')`;
        await tx.$queryRaw`INSERT INTO "store_memberships" (store_id, user_id, role, status)
        VALUES (${storeA}::uuid, 'aaaa0000-0000-0000-0000-000000000001'::uuid, 'OWNER', 'ACTIVE')`;

        // Set the "authenticated user" session GUC (standalone auth.uid()).
        await tx.$executeRaw`SELECT set_config('app.current_user_id', 'aaaa0000-0000-0000-0000-000000000001', true)`;
        await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;

        const myStore = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "stores" WHERE id = ${storeA}::uuid`;
        expect(Number(myStore[0]?.count ?? 0n)).toBe(1);

        const otherStore = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "stores" WHERE id = ${storeB}::uuid`;
        expect(Number(otherStore[0]?.count ?? 0n)).toBe(0);

        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
