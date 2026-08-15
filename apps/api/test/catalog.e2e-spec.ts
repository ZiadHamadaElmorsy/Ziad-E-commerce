import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 3 — Catalog.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard) and the
 * real TenantContextService are exercised end-to-end against a stubbed
 * PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution for every group
 *   - Product endpoints: list/get/create/update/publish/unpublish/archive
 *   - Product creation atomicity (Product + Default ProductVariant)
 *   - Variant endpoints: list/create (nested), update/archive
 *   - Category endpoints: list/get/create/update/archive
 *   - ProductCategory endpoints: assign (201) / remove (204), duplicate ->
 *     CONFLICT, cross-tenant prevention
 *   - validation (400 VALIDATION_ERROR), lifecycle errors (STATE_TRANSITION),
 *     uniqueness errors (CONFLICT), missing resources (NOT_FOUND)
 */
describe('Catalog (e2e)', () => {
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
    slug: 'classic-t-shirt',
    description: null,
    status: 'DRAFT',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Classic T-Shirt',
    sku: null,
    price: 0n,
    compareAtPrice: null,
    costPrice: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const categoryRow = {
    id: 'category-1',
    storeId: 'store-1',
    name: 'T-Shirts',
    slug: 't-shirts',
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const linkRow = {
    id: 'link-1',
    storeId: 'store-1',
    productId: 'product-1',
    categoryId: 'category-1',
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  // Transaction-client writes (used inside TransactionService.runWithTenant).
  const txProductCreate = jest.fn();
  const txProductUpdate = jest.fn();
  const txProductUpdateMany = jest.fn();
  const txProductFindFirst = jest.fn();
  const txVariantCreate = jest.fn();
  const txVariantUpdate = jest.fn();
  const txVariantUpdateMany = jest.fn();
  const txVariantFindFirst = jest.fn().mockResolvedValue(null);
  const txCategoryCreate = jest.fn();
  const txCategoryUpdate = jest.fn();
  const txCategoryUpdateMany = jest.fn();
  const txCategoryFindFirst = jest.fn();
  const txProductCategoryCreate = jest.fn();
  const txProductCategoryDeleteMany = jest.fn();

  const txClient = {
    product: {
      create: txProductCreate,
      update: txProductUpdate,
      updateMany: txProductUpdateMany,
      findFirst: txProductFindFirst,
    },
    productVariant: {
      create: txVariantCreate,
      update: txVariantUpdate,
      updateMany: txVariantUpdateMany,
      findFirst: txVariantFindFirst,
    },
    category: {
      create: txCategoryCreate,
      update: txCategoryUpdate,
      updateMany: txCategoryUpdateMany,
      findFirst: txCategoryFindFirst,
    },
    productCategory: {
      create: txProductCategoryCreate,
      deleteMany: txProductCategoryDeleteMany,
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  // Shared Prisma reads used by repositories + the real TenantContextService.
  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(txClient),
      ),
    storeMembership: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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

    // Phase 14 — the merchant store runs on an ACTIVE TRIAL (guard passes).
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
    prismaServiceStub.productVariant.findUnique.mockReset();
    prismaServiceStub.productVariant.findMany.mockReset();
    prismaServiceStub.productVariant.count.mockReset();
    prismaServiceStub.category.findUnique.mockReset();
    prismaServiceStub.category.findMany.mockReset();
    prismaServiceStub.category.count.mockReset();

    txProductCreate.mockReset();
    txProductUpdate.mockReset();
    txProductUpdateMany.mockReset();
    txProductFindFirst.mockReset();
    txVariantCreate.mockReset();
    txVariantUpdate.mockReset();
    txVariantUpdateMany.mockReset();
    txCategoryCreate.mockReset();
    txCategoryUpdate.mockReset();
    txCategoryUpdateMany.mockReset();
    txCategoryFindFirst.mockReset();
    txProductCategoryCreate.mockReset();
    txProductCategoryDeleteMany.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/products', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .send({ name: 'Classic T-Shirt' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates the Product and its Default ProductVariant atomically (201)', async () => {
      txProductFindFirst.mockResolvedValue(null);
      txProductCreate.mockResolvedValue(productRow);
      txVariantCreate.mockResolvedValue(variantRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Classic T-Shirt' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        id: 'product-1',
        name: 'Classic T-Shirt',
        slug: 'classic-t-shirt',
        status: 'DRAFT',
        variants: [{ id: 'variant-1', price: 0, status: 'ACTIVE' }],
      });

      expect(txProductCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ storeId: 'store-1', slug: 'classic-t-shirt' }),
      });
      expect(txVariantCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ storeId: 'store-1', productId: 'product-1' }),
      });
    });

    it('rejects an invalid payload with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .send({ description: 'missing name' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects creating a product in a non-DRAFT initial status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Classic T-Shirt', status: 'ACTIVE' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a client-supplied store_id (never an authorization source)', async () => {
      txProductFindFirst.mockResolvedValue(null);
      txProductCreate.mockResolvedValue(productRow);
      txVariantCreate.mockResolvedValue(variantRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .send({ name: 'Classic T-Shirt' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(txProductCreate).not.toHaveBeenCalled();
    });

    it('maps a store-scoped slug unique violation to 409 CONFLICT', async () => {
      txProductFindFirst.mockResolvedValue(null);
      txProductCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'slug'] },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Classic T-Shirt' })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('GET /api/v1/products', () => {
    it('returns a paginated list with the data/meta envelope', async () => {
      prismaServiceStub.product.findMany.mockResolvedValue([
        { ...productRow, variants: [variantRow] },
      ]);
      prismaServiceStub.product.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('rejects an unknown status filter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products?status=published')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a limit above the maximum with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products?limit=1000')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/products/:productId', () => {
    it('returns the product with its variants', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue({
        ...productRow,
        variants: [variantRow],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/products/product-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toMatchObject({ id: 'product-1', status: 'DRAFT' });
      expect(res.body.data.variants).toHaveLength(1);
    });

    it('returns 404 for a product outside the current store', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/products/store-b-product')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/products/:productId', () => {
    it('updates editable fields', async () => {
      txProductUpdate.mockResolvedValue({ ...productRow, name: 'Updated T-Shirt' });
      prismaServiceStub.product.findUnique.mockResolvedValue({
        ...productRow,
        name: 'Updated T-Shirt',
        variants: [variantRow],
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/products/product-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated T-Shirt' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated T-Shirt');
    });

    it('rejects unknown fields (e.g. status) with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/products/product-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'ACTIVE' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('product lifecycle endpoints', () => {
    it('publishes a DRAFT product (DRAFT -> ACTIVE)', async () => {
      prismaServiceStub.product.findUnique.mockImplementation((args: { include?: unknown }) => {
        if (args.include) {
          return Promise.resolve({ ...productRow, status: 'ACTIVE', variants: [variantRow] });
        }
        return Promise.resolve(productRow);
      });
      prismaServiceStub.productVariant.count.mockResolvedValue(1);
      txProductUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/publish')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.status).toBe('ACTIVE');
      expect(txProductUpdateMany).toHaveBeenCalledWith({
        where: { id: 'product-1', storeId: 'store-1', status: 'DRAFT' },
        data: { status: 'ACTIVE' },
      });
    });

    it('rejects publishing an ARCHIVED product with 409 STATE_TRANSITION', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue({ ...productRow, status: 'ARCHIVED' });
      prismaServiceStub.productVariant.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/publish')
        .set('Authorization', 'Bearer valid-token')
        .expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txProductUpdateMany).not.toHaveBeenCalled();
    });

    it('unpublishes an ACTIVE product (ACTIVE -> DRAFT)', async () => {
      prismaServiceStub.product.findUnique.mockImplementation((args: { include?: unknown }) => {
        if (args.include) {
          return Promise.resolve({ ...productRow, status: 'DRAFT', variants: [variantRow] });
        }
        return Promise.resolve({ ...productRow, status: 'ACTIVE' });
      });
      txProductUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/unpublish')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.status).toBe('DRAFT');
    });

    it('archives an ACTIVE product (ACTIVE -> ARCHIVED)', async () => {
      prismaServiceStub.product.findUnique.mockImplementation((args: { include?: unknown }) => {
        if (args.include) {
          return Promise.resolve({ ...productRow, status: 'ARCHIVED', variants: [variantRow] });
        }
        return Promise.resolve({ ...productRow, status: 'ACTIVE' });
      });
      txProductUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('returns 404 when the product is not in the current store', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/store-b-product/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // {{CATALOG_VARIANT_CATEGORY_TESTS}}
  describe('variant endpoints', () => {
    it('lists the variants of a product (GET /products/:id/variants)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      prismaServiceStub.productVariant.findMany.mockResolvedValue([variantRow]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: 'variant-1', price: 0 });
    });

    it('creates a variant for a product in the current store (201)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      txVariantCreate.mockResolvedValue({
        ...variantRow,
        name: 'Black / Medium',
        sku: 'TS-BLK-M',
        price: 500n,
        compareAtPrice: 600n,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Black / Medium', sku: 'TS-BLK-M', price: 500, compareAtPrice: 600 })
        .expect(201);

      expect(res.body.data).toMatchObject({ id: 'variant-1', price: 500, compareAtPrice: 600 });
      expect(txVariantCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ storeId: 'store-1', productId: 'product-1', price: 500n }),
      });
    });

    it('rejects a negative price with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Black / Medium', price: -5 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when creating a variant for a product outside the store', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/store-b-product/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Black / Medium', price: 500 })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txVariantCreate).not.toHaveBeenCalled();
    });

    it('maps a duplicate store-scoped SKU to 409 CONFLICT', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      txVariantCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'sku'] },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/variants')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Black / Medium', sku: 'TS-BLK-M', price: 500 })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('updates a variant (PATCH /variants/:variantId)', async () => {
      txVariantUpdate.mockResolvedValue({ ...variantRow, price: 550n });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/variants/variant-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ price: 550 })
        .expect(200);

      expect(res.body.data.price).toBe(550);
    });

    it('archives a variant (POST /variants/:variantId/archive)', async () => {
      let updated = false;
      txVariantUpdateMany.mockImplementation(async () => {
        updated = true;
        return { count: 1 };
      });
      prismaServiceStub.productVariant.findUnique.mockImplementation(() =>
        Promise.resolve({ ...variantRow, status: updated ? 'ARCHIVED' : 'ACTIVE' }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('rejects archiving an already-archived variant with 409 STATE_TRANSITION', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue({
        ...variantRow,
        status: 'ARCHIVED',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
    });
  });

  describe('category endpoints', () => {
    it('creates a category (201)', async () => {
      txCategoryFindFirst.mockResolvedValue(null);
      txCategoryCreate.mockResolvedValue(categoryRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'T-Shirts' })
        .expect(201);

      expect(res.body.data).toMatchObject({ id: 'category-1', slug: 't-shirts', status: 'ACTIVE' });
      expect(txCategoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ storeId: 'store-1', slug: 't-shirts' }),
      });
    });

    it('maps a store-scoped category slug unique violation to 409 CONFLICT', async () => {
      txCategoryFindFirst.mockResolvedValue(null);
      txCategoryCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['store_id', 'slug'] },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'T-Shirts' })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('lists categories with the data/meta envelope', async () => {
      prismaServiceStub.category.findMany.mockResolvedValue([categoryRow]);
      prismaServiceStub.category.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('returns a category (GET /categories/:categoryId)', async () => {
      prismaServiceStub.category.findUnique.mockResolvedValue(categoryRow);

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toMatchObject({ id: 'category-1', status: 'ACTIVE' });
    });

    it('updates a category (PATCH /categories/:categoryId)', async () => {
      txCategoryUpdate.mockResolvedValue({ ...categoryRow, name: 'Updated' });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated');
    });

    it('archives a category (POST /categories/:categoryId/archive)', async () => {
      let updated = false;
      txCategoryUpdateMany.mockImplementation(async () => {
        updated = true;
        return { count: 1 };
      });
      prismaServiceStub.category.findUnique.mockImplementation(() =>
        Promise.resolve({ ...categoryRow, status: updated ? 'ARCHIVED' : 'ACTIVE' }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories/category-1/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('rejects archiving an already-archived category with 409 STATE_TRANSITION', async () => {
      prismaServiceStub.category.findUnique.mockResolvedValue({
        ...categoryRow,
        status: 'ARCHIVED',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories/category-1/archive')
        .set('Authorization', 'Bearer valid-token')
        .expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
    });
  });

  // {{CATALOG_PRODUCTCATEGORY_TESTS}}
  describe('ProductCategory linking', () => {
    it('assigns a product to a category (201)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      prismaServiceStub.category.findUnique.mockResolvedValue(categoryRow);
      txProductCategoryCreate.mockResolvedValue(linkRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(201);

      expect(res.body.data).toEqual({ productId: 'product-1', categoryId: 'category-1' });
      expect(txProductCategoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 'store-1',
          productId: 'product-1',
          categoryId: 'category-1',
        }),
      });
    });

    it('maps a duplicate link to 409 CONFLICT', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      prismaServiceStub.category.findUnique.mockResolvedValue(categoryRow);
      txProductCategoryCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['product_id', 'category_id'] },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('prevents cross-tenant links (product outside the store -> 404)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/store-b-product/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txProductCategoryCreate).not.toHaveBeenCalled();
    });

    it('prevents cross-tenant links (category outside the store -> 404)', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
      prismaServiceStub.category.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products/product-1/categories/store-b-category')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txProductCategoryCreate).not.toHaveBeenCalled();
    });

    it('removes a product from a category with 204', async () => {
      txProductCategoryDeleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/products/product-1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(204);

      expect(res.body).toEqual({});
    });

    it('returns 404 when removing a non-existent link', async () => {
      txProductCategoryDeleteMany.mockResolvedValue({ count: 0 });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/products/product-1/categories/category-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
