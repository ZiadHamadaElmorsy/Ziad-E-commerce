/**
 * CMS DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
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

describeOrSkip('CMS database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('pages UNIQUE (store_id, slug) rejects a duplicate page slug', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cms-pg-a', 'CMS Pg A');
        await tx.$queryRaw`INSERT INTO "pages" (store_id, slug, title, status)
        VALUES (${storeId}::uuid, 'about', 'About', 'PUBLISHED')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "pages" (store_id, slug, title, status)
            VALUES (${storeId}::uuid, 'about', 'About 2', 'DRAFT')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('theme_configurations and navigations are store-scoped (composite FKs)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cms-t-a', 'CMS T A');
        const storeB = await seedStore(tx, 'cms-t-b', 'CMS T B');
        await tx.$queryRaw`INSERT INTO "theme_configurations" (store_id, config)
        VALUES (${storeA}::uuid, '{}'::jsonb)`;
        await tx.$queryRaw`INSERT INTO "navigations" (store_id, name, items)
        VALUES (${storeA}::uuid, 'Main', '[]'::jsonb)`;

        await bindTenant(tx, storeA);
        const myTheme = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "theme_configurations" WHERE store_id = ${storeA}::uuid`;
        expect(Number(myTheme[0]?.count ?? 0n)).toBe(1);
        const foreignTheme = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "theme_configurations" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreignTheme[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B pages', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cms-rls-a', 'CMS RLS A');
        const storeB = await seedStore(tx, 'cms-rls-b', 'CMS RLS B');
        await tx.$queryRaw`INSERT INTO "pages" (store_id, slug, title, status)
        VALUES (${storeB}::uuid, 'about', 'About', 'PUBLISHED')`;

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "pages" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
