/**
 * CATALOG DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
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
  seedProductAndVariant,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Catalog database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('products UNIQUE (store_id, slug) rejects a duplicate slug in the same store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cat-uniq-a', 'Cat Uniq A');
        await seedProductAndVariant(tx, storeId, 'dup-product', 'Dup');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "products" (store_id, slug, name, status)
            VALUES (${storeId}::uuid, 'dup-product', 'Dup 2', 'ACTIVE')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('allows the same product slug in a different store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cat-slug-a', 'Cat Slug A');
        const storeB = await seedStore(tx, 'cat-slug-b', 'Cat Slug B');
        await seedProductAndVariant(tx, storeA, 'same-slug', 'P1');
        await seedProductAndVariant(tx, storeB, 'same-slug', 'P2');
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('product_variants CHECK (price >= 0) rejects a negative price', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cat-price-a', 'Cat Price A');
        const products = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "products" (store_id, slug, name, status)
        VALUES (${storeId}::uuid, 'cat-price-p', 'P', 'ACTIVE') RETURNING id`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "product_variants" (store_id, product_id, name, price, status)
            VALUES (${storeId}::uuid, ${products[0].id}::uuid, 'V', -100, 'ACTIVE')`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('product_variants composite FK rejects a variant whose product belongs to another store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cat-fk-a', 'Cat FK A');
        const storeB = await seedStore(tx, 'cat-fk-b', 'Cat FK B');
        const { productId } = await seedProductAndVariant(tx, storeB, 'cat-fk-pb', 'PB');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "product_variants" (store_id, product_id, name, price, status)
            VALUES (${storeA}::uuid, ${productId}::uuid, 'forged', 100, 'ACTIVE')`,
          '23503',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('categories UNIQUE (store_id, slug) rejects a duplicate category slug', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cat-cat-a', 'Cat Cat A');
        await tx.$queryRaw`INSERT INTO "categories" (store_id, slug, name, status)
        VALUES (${storeId}::uuid, 'clothes', 'Clothes', 'ACTIVE')`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "categories" (store_id, slug, name, status)
            VALUES (${storeId}::uuid, 'clothes', 'Clothes 2', 'ACTIVE')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read Store B products or categories', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cat-rls-a', 'Cat RLS A');
        const storeB = await seedStore(tx, 'cat-rls-b', 'Cat RLS B');
        await seedProductAndVariant(tx, storeB, 'cat-rls-pb', 'PB');
        await tx.$queryRaw`INSERT INTO "categories" (store_id, slug, name, status)
        VALUES (${storeB}::uuid, 'cat-rls-cb', 'CB', 'ACTIVE')`;

        await bindTenant(tx, storeA);
        const foreignProducts = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "products" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreignProducts[0]?.count ?? 0n)).toBe(0);
        const foreignCats = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "categories" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreignCats[0]?.count ?? 0n)).toBe(0);

        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
