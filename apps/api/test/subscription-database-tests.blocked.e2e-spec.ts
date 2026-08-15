/**
 * SUBSCRIPTION DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
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

describeOrSkip('Subscription database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('subscriptions UNIQUE (store_id) allows exactly one subscription per store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'sub-uniq-a', 'Sub Uniq A');
        await tx.$queryRaw`INSERT INTO "subscriptions" (
          store_id, status, trial_started_at, trial_ends_at
        ) VALUES (${storeId}::uuid, 'TRIAL', now(), now() + interval '14 days')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "subscriptions" (
            store_id, status, trial_started_at, trial_ends_at
          ) VALUES (${storeId}::uuid, 'TRIAL', now(), now() + interval '14 days')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: a member sees only their own store subscription', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'sub-rls-a', 'Sub RLS A');
        const storeB = await seedStore(tx, 'sub-rls-b', 'Sub RLS B');
        await tx.$queryRaw`INSERT INTO "subscriptions" (store_id, status, trial_started_at, trial_ends_at)
        VALUES (${storeA}::uuid, 'TRIAL', now(), now() + interval '14 days')`;
        await tx.$queryRaw`INSERT INTO "subscriptions" (store_id, status, trial_started_at, trial_ends_at)
        VALUES (${storeB}::uuid, 'TRIAL', now(), now() + interval '14 days')`;
        // The member-scoped policy resolves the user through the membership
        // subquery (auth.uid() fallback = app.current_user_id), so the probe
        // seeds a member of store A and binds that user context.
        await tx.$queryRaw`INSERT INTO "users" (id, auth_user_id, email, first_name, last_name)
        VALUES ('aaaa0000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000201'::uuid, 'sub@example.com', 'S', 'U')`;
        await tx.$queryRaw`INSERT INTO "store_memberships" (store_id, user_id, role, status)
        VALUES (${storeA}::uuid, 'aaaa0000-0000-0000-0000-000000000001'::uuid, 'OWNER', 'ACTIVE')`;

        await bindTenant(tx, storeA);
        await tx.$executeRaw`SELECT set_config('app.current_user_id', 'aaaa0000-0000-0000-0000-000000000001', true)`;
        const mySubs = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "subscriptions" WHERE store_id = ${storeA}::uuid`;
        expect(Number(mySubs[0]?.count ?? 0n)).toBe(1);
        const foreignSubs = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "subscriptions" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreignSubs[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
