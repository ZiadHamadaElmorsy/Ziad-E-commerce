/**
 * MEDIA DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 */
import { Prisma, PrismaClient } from '@prisma/client';
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

async function seedMedia(
  tx: Prisma.TransactionClient,
  storeId: string,
  path: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "media" (store_id, storage_path, media_type, mime_type, size_bytes)
    VALUES (${storeId}::uuid, ${path}, 'IMAGE', 'image/png', 5)
    RETURNING id`;
  return rows[0].id;
}

describeOrSkip('Media database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('media CHECK (size_bytes >= 0) rejects a negative size_bytes', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'media-neg-a', 'Media Neg A');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "media" (store_id, storage_path, media_type, size_bytes)
            VALUES (${storeId}::uuid, 'store-a/neg.png', 'IMAGE', -1)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('media_type enum rejects an unknown media type', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'media-enum-a', 'Media Enum A');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "media" (store_id, storage_path, media_type)
            VALUES (${storeId}::uuid, 'store-a/x.png', 'GIF')`,
          '22P02',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('product_media composite FK rejects a link to another store media', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'media-fk-a', 'Media FK A');
        const storeB = await seedStore(tx, 'media-fk-b', 'Media FK B');
        const mediaB = await seedMedia(tx, storeB, 'store-b/p.png');
        const { productId } = await seedProductAndVariant(tx, storeA, 'media-fk-pa', 'PA');
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "product_media" (store_id, product_id, media_id)
            VALUES (${storeA}::uuid, ${productId}::uuid, ${mediaB}::uuid)`,
          '23503',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('media store_id FK RESTRICT blocks deleting a Store that owns media', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'media-del-a', 'Media Del A');
        await seedMedia(tx, storeId, 'store-a/p.png');
        await expectPgState(
          () => tx.$queryRaw`DELETE FROM "stores" WHERE id = ${storeId}::uuid`,
          '23001',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('product_media UNIQUE (product_id, media_id) rejects a duplicate image link', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'media-dup-a', 'Media Dup A');
        const mediaId = await seedMedia(tx, storeId, 'store-a/p.png');
        const { productId } = await seedProductAndVariant(tx, storeId, 'media-dup-p', 'P');
        await tx.$queryRaw`INSERT INTO "product_media" (store_id, product_id, media_id)
        VALUES (${storeId}::uuid, ${productId}::uuid, ${mediaId}::uuid)`;
        await expectPgState(
          () =>
            tx.$queryRaw`INSERT INTO "product_media" (store_id, product_id, media_id)
            VALUES (${storeId}::uuid, ${productId}::uuid, ${mediaId}::uuid)`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: a merchant sees only their store media rows', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'media-rls-a', 'Media RLS A');
        const storeB = await seedStore(tx, 'media-rls-b', 'Media RLS B');
        await seedMedia(tx, storeB, 'store-b/p.png');

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "media" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);
        await clearTenant(tx);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
