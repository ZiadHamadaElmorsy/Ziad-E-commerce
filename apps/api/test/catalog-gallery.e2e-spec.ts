import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of Phase 26 — catalog gallery, variant attributes and
 * storefront gallery.
 *
 * Same harness as catalog.e2e-spec.ts: real guards + real tenant context, a
 * stubbed PrismaService, no external services contacted.
 */
describe('Catalog gallery & variant attributes (e2e)', () => {
  let app: INestApplication;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const membershipRow = {
    id: 'm-1',
    storeId: 'store-1',
    userId: 'user-1',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    nameAr: null,
    nameEn: null,
    slug: 'classic-t-shirt',
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const variantRow = {
    id: 'e7a0e5c2-1e6b-4f1a-9c3d-2b8f0a1c4e5f',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Black / Medium',
    attributes: { color: 'Black', size: 'M' },
    sku: 'TS-BLK-M',
    price: 500n,
    compareAtPrice: null,
    costPrice: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const mediaRow = {
    id: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
    storeId: 'store-1',
    storagePath: 'store-1/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    sizeBytes: 1024n,
    altText: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  const productMediaRow = {
    id: 'pm-1',
    storeId: 'store-1',
    productId: 'product-1',
    mediaId: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
    variantId: null,
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    media: { ...mediaRow, sizeBytes: 1024n },
  };

  /** The merchant detail view reload (product + variants + bounded images). */
  const productDetailRow = {
    ...productRow,
    variants: [variantRow],
    productMedia: [productMediaRow],
  };

  const txProductMediaCreate = jest.fn();
  const txProductMediaUpdate = jest.fn();
  const txProductMediaUpdateMany = jest.fn();
  const txProductMediaDeleteMany = jest.fn();
  const txProductMediaAggregate = jest.fn();
  const txProductMediaFindFirst = jest.fn();
  const txVariantCreate = jest.fn();
  const txVariantUpdate = jest.fn();
  const txVariantFindFirst = jest.fn().mockResolvedValue(null);

  const txClient = {
    product: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    productVariant: {
      create: txVariantCreate,
      update: txVariantUpdate,
      updateMany: jest.fn(),
      findFirst: txVariantFindFirst,
    },
    category: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    productCategory: { create: jest.fn(), deleteMany: jest.fn() },
    productMedia: {
      create: txProductMediaCreate,
      update: txProductMediaUpdate,
      updateMany: txProductMediaUpdateMany,
      deleteMany: txProductMediaDeleteMany,
      aggregate: txProductMediaAggregate,
      findFirst: txProductMediaFindFirst,
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(txClient),
      ),
    store: { findUnique: jest.fn() },
    storeMembership: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    media: { findFirst: jest.fn() },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    category: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    productMedia: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }),
  };

  beforeAll(async () => {
    prismaServiceStub.storeMembership.findMany.mockImplementation(async () => [
      { ...membershipRow, store: storeRow },
    ]);
    prismaServiceStub.subscription.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        where.storeId === 'store-1'
          ? {
              id: 'sub-1',
              storeId: 'store-1',
              status: 'TRIAL',
              trialStartedAt: new Date('2026-08-12T00:00:00Z'),
              trialEndsAt: new Date('2027-08-12T00:00:00Z'),
              activatedAt: null,
              expiresAt: null,
              createdAt: new Date('2026-08-12T00:00:00Z'),
              updatedAt: new Date('2026-08-12T00:00:00Z'),
            }
          : null,
    );
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { slug: string } }) =>
        where.slug === 'my-store' ? storeRow : null,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(AuthProvider)
      .useValue(authProviderStub)
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  beforeEach(() => {
    prismaServiceStub.product.findUnique.mockReset();
    prismaServiceStub.product.findMany.mockReset();
    prismaServiceStub.product.count.mockReset();
    prismaServiceStub.product.findFirst.mockReset();
    prismaServiceStub.productVariant.findUnique.mockReset();
    prismaServiceStub.productVariant.findMany.mockReset();
    prismaServiceStub.productVariant.count.mockReset();
    prismaServiceStub.category.findMany.mockReset();
    prismaServiceStub.category.count.mockReset();
    prismaServiceStub.media.findFirst.mockReset();
    prismaServiceStub.productMedia.findMany.mockReset();
    prismaServiceStub.productMedia.count.mockReset();
    prismaServiceStub.productMedia.findFirst.mockReset();

    txProductMediaCreate.mockReset();
    txProductMediaUpdate.mockReset();
    txProductMediaUpdateMany.mockReset();
    txProductMediaDeleteMany.mockReset();
    txProductMediaAggregate.mockReset();
    txProductMediaFindFirst.mockReset();
    txVariantCreate.mockReset();
    txVariantUpdate.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('variant attributes', () => {
    it('creates a variant with color/size attributes', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      txVariantCreate.mockResolvedValue({
        ...variantRow,
        attributes: { color: 'Black', size: 'M' },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Black / Medium',
          attributes: { color: 'Black', size: 'M' },
          sku: 'TS-BLK-M',
          price: 500,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.attributes).toEqual({ color: 'Black', size: 'M' });
      expect(txVariantCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attributes: { color: 'Black', size: 'M' } }),
        }),
      );
    });

    it('rejects non-string attribute values (validation)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);

      const response = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Broken', attributes: { color: 42 }, price: 500 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('product gallery', () => {
    it('GET /products/:id/media returns paginated gallery metadata', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      prismaServiceStub.productMedia.findMany.mockResolvedValue([productMediaRow]);
      prismaServiceStub.productMedia.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/api/v1/products/product-1/media')
        .set('Authorization', 'Bearer valid-token')
        .query({ page: 1, limit: 24 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toEqual(
        expect.objectContaining({
          mediaId: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d',
          isPrimary: true,
          sortOrder: 0,
          variantId: null,
        }),
      );
      expect(response.body.meta.total).toBe(1);
      expect(prismaServiceStub.productMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: 'store-1', productId: 'product-1' },
          skip: 0,
          take: 24,
        }),
      );
    });

    it('PATCH /products/:id/media/:mediaId sets primary and clears the previous one', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productDetailRow);
      txProductMediaFindFirst.mockResolvedValue(productMediaRow);
      txProductMediaUpdate.mockResolvedValue({ ...productMediaRow, isPrimary: true });

      const response = await request(app.getHttpServer())
        .patch('/api/v1/products/product-1/media/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d')
        .set('Authorization', 'Bearer valid-token')
        .send({ isPrimary: true });

      expect(response.status).toBe(200);
      expect(txProductMediaUpdateMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1', productId: 'product-1', isPrimary: true },
        data: { isPrimary: false },
      });
      expect(txProductMediaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPrimary: true } }),
      );
    });

    it('PUT /products/:id/media/order batch-reorders the gallery', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productDetailRow);
      txProductMediaUpdateMany.mockResolvedValue({ count: 1 });
      const mediaIdA = '11111111-1111-4111-8111-111111111111';
      const mediaIdB = '22222222-2222-4222-8222-222222222222';
      const mediaIdC = '33333333-3333-4333-8333-333333333333';

      const response = await request(app.getHttpServer())
        .put('/api/v1/products/product-1/media/order')
        .set('Authorization', 'Bearer valid-token')
        .send({ order: [mediaIdC, mediaIdA, mediaIdB] });

      expect(response.status).toBe(200);
      expect(txProductMediaUpdateMany).toHaveBeenNthCalledWith(1, {
        where: { storeId: 'store-1', productId: 'product-1', mediaId: mediaIdC },
        data: { sortOrder: 0 },
      });
      expect(txProductMediaUpdateMany).toHaveBeenNthCalledWith(3, {
        where: { storeId: 'store-1', productId: 'product-1', mediaId: mediaIdB },
        data: { sortOrder: 2 },
      });
    });
    it('attach media with a variantId links the image to the variant', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productDetailRow);
      prismaServiceStub.media.findFirst.mockResolvedValue(mediaRow);
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      txProductMediaAggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      txProductMediaCreate.mockResolvedValue({
        ...productMediaRow,
        variantId: variantRow.id,
        isPrimary: true,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/media/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: variantRow.id, isPrimary: true });

      expect(response.status).toBe(201);
      expect(txProductMediaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ variantId: variantRow.id, isPrimary: true }),
        }),
      );
    });

    it('rejects attaching media to a variant of ANOTHER product (404, fail closed)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productDetailRow);
      prismaServiceStub.media.findFirst.mockResolvedValue(mediaRow);
      prismaServiceStub.productVariant.findUnique.mockResolvedValue({
        ...variantRow,
        productId: 'other-product',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/media/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: variantRow.id });

      expect(response.status).toBe(404);
      expect(txProductMediaCreate).not.toHaveBeenCalled();
    });
  });

  describe('storefront gallery', () => {
    it('GET /storefront/products/:slug/media returns the paginated gallery', async () => {
      prismaServiceStub.product.findFirst.mockResolvedValue(productRow);
      prismaServiceStub.productMedia.findMany.mockResolvedValue([
        { mediaId: 'media-1', variantId: null, altText: null, sortOrder: 0, isPrimary: true },
        { mediaId: 'media-2', variantId: 'variant-1', altText: null, sortOrder: 1, isPrimary: false },
      ]);
      prismaServiceStub.productMedia.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/api/v1/storefront/products/classic-t-shirt/media')
        .set('X-Storefront-Slug', 'my-store')
        .query({ page: 1, limit: 12 });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ mediaId: 'media-1', isPrimary: true }),
        expect.objectContaining({ mediaId: 'media-2', variantId: 'variant-1' }),
      ]);
      expect(response.body.meta.total).toBe(2);
    });

    it('storefront product detail exposes categories, attributes and totalImages', async () => {
      prismaServiceStub.product.findFirst.mockResolvedValue({
        ...productRow,
        productCategories: [
          { category: { id: 'category-1', name: 'T-Shirts', slug: 't-shirts', description: null } },
        ],
        variants: [
          {
            id: 'variant-1',
            name: 'Black / Medium',
            attributes: { color: 'Black', size: 'M' },
            price: 500n,
            status: 'ACTIVE',
            inventory: { onHandQuantity: 10, reservedQuantity: 0 },
          },
        ],
        productMedia: [
          { media: { id: 'media-1', altText: null }, variantId: null, isPrimary: true, sortOrder: 0 },
        ],
        _count: { productMedia: 1 },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/storefront/products/classic-t-shirt')
        .set('X-Storefront-Slug', 'my-store');

      expect(response.status).toBe(200);
      expect(response.body.data.categories).toEqual([
        expect.objectContaining({ slug: 't-shirts' }),
      ]);
      expect(response.body.data.variants[0].attributes).toEqual({ color: 'Black', size: 'M' });
      expect(response.body.data.totalImages).toBe(1);
      expect(response.body.data.images[0]).toEqual(
        expect.objectContaining({ id: 'media-1', variantId: null, isPrimary: true }),
      );
    });
  });
});
