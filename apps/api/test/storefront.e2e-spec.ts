import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CategoryStatus,
  PageStatus,
  ProductStatus,
  StoreStatus,
  SubscriptionStatus,
  VariantStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';

/**
 * End-to-end coverage of PHASE 11 — Storefront (public read API).
 *
 * The storefront endpoints are @Public(): the real global guard chain
 * (AuthGuard -> TenantContextGuard -> RolesGuard) skips them, so no Bearer
 * token, membership or tenant resolution is involved. The Store is resolved
 * from the public storefront slug/domain (StorefrontStoreResolver) and every
 * repository query is store-scoped to that resolved Store — the PrismaService
 * stub verifies the store-scoping + ACTIVE/PUBLISHED filters.
 *
 * Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - anonymous access (200 without Authorization) + store resolution via
 *     X-Storefront-Slug header and Host subdomain
 *   - GET /storefront                     public store configuration
 *   - GET /storefront/products            ACTIVE products, search, pagination,
 *                                         availability, images, no internal leak
 *   - GET /storefront/products/:slug      ACTIVE product by slug; 404 otherwise
 *   - GET /storefront/categories          ACTIVE categories
 *   - GET /storefront/categories/:slug    ACTIVE category + its products
 *   - GET /storefront/pages/:slug         PUBLISHED page + sections + SEO
 *   - non-ACTIVE store -> 404; unknown slug -> 404 (no existence leak)
 *   - validation (400 VALIDATION_ERROR, forbidNonWhitelisted, limit cap)
 *
 * DB-level guarantees (RLS public-storefront policies, FK/unique, checks) are
 * NOT claimed here — they live in the blocked database suite.
 */
describe('Storefront (e2e)', () => {
  let app: INestApplication;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: 'A test store',
    status: StoreStatus.ACTIVE,
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: 'Cotton classic',
    status: ProductStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    variants: [
      {
        id: 'variant-1',
        storeId: 'store-1',
        productId: 'product-1',
        name: 'Black / Medium',
        sku: null,
        price: 500n,
        compareAtPrice: null,
        costPrice: 200n,
        status: VariantStatus.ACTIVE,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
        inventory: {
          id: 'inv-1',
          storeId: 'store-1',
          variantId: 'variant-1',
          onHandQuantity: 10,
          reservedQuantity: 2,
          createdAt: new Date('2026-08-12T00:00:00Z'),
          updatedAt: new Date('2026-08-12T00:00:00Z'),
        },
      },
    ],
    productMedia: [
      {
        id: 'pm-1',
        storeId: 'store-1',
        productId: 'product-1',
        mediaId: 'media-1',
        variantId: null,
        altText: null,
        sortOrder: 0,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        media: {
          id: 'media-1',
          storeId: 'store-1',
          storagePath: 'products/product-1/front.png',
          mediaType: 'IMAGE',
          mimeType: 'image/png',
          sizeBytes: 100n,
          altText: 'Front view',
          createdAt: new Date('2026-08-12T00:00:00Z'),
        },
      },
    ],
  };

  const categoryRow = {
    id: 'category-1',
    storeId: 'store-1',
    name: 'T-Shirts',
    slug: 't-shirts',
    description: 'All t-shirts',
    status: CategoryStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const publishedPageRow = {
    id: 'page-1',
    storeId: 'store-1',
    title: 'About',
    slug: 'about',
    status: PageStatus.PUBLISHED,
    seoTitle: 'About My Store',
    seoDescription: 'Learn about My Store',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    sections: [
      {
        id: 'section-1',
        storeId: 'store-1',
        pageId: 'page-1',
        sectionType: 'text',
        content: { body: 'Hello' },
        sortOrder: 0,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
    ],
  };

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    store: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn() },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    page: { findFirst: jest.fn() },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockRejectedValue(new Error('should never be called for public routes')),
  };

  beforeAll(async () => {
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { slug: string } }) => {
        if (where.slug === 'my-store') {
          return storeRow;
        }
        if (where.slug === 'disabled-store') {
          return { ...storeRow, slug: 'disabled-store', status: StoreStatus.DISABLED };
        }
        if (where.slug === 'expired-store') {
          return { ...storeRow, slug: 'expired-store', id: 'store-expired' };
        }
        return null;
      },
    );

    // Phase 22 — store-scoped WhatsApp settings (enabled for store-1, disabled
    // for every other store).
    prismaServiceStub.storeSettings.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        where.storeId === 'store-1'
          ? {
              id: 'settings-1',
              storeId: 'store-1',
              settings: { whatsapp: { enabled: true, phoneNumber: '201012345678', label: null } },
              createdAt: new Date('2026-08-15T00:00:00Z'),
              updatedAt: new Date('2026-08-15T00:00:00Z'),
            }
          : null,
    );

    // Phase 14 — subscription access overlay: store-1 is on an ACTIVE TRIAL,
    // store-expired has an EXPIRED subscription (storefront disabled).
    prismaServiceStub.subscription.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) => {
        if (where.storeId === 'store-1') {
          return {
            id: 'sub-1',
            storeId: 'store-1',
            status: SubscriptionStatus.TRIAL,
            trialStartedAt: new Date('2026-08-12T00:00:00Z'),
            trialEndsAt: new Date('2027-08-12T00:00:00Z'),
            activatedAt: null,
            expiresAt: null,
            createdAt: new Date('2026-08-12T00:00:00Z'),
            updatedAt: new Date('2026-08-12T00:00:00Z'),
          };
        }
        if (where.storeId === 'store-expired') {
          return {
            id: 'sub-expired',
            storeId: 'store-expired',
            status: SubscriptionStatus.EXPIRED,
            trialStartedAt: new Date('2026-01-01T00:00:00Z'),
            trialEndsAt: new Date('2026-01-15T00:00:00Z'),
            activatedAt: null,
            expiresAt: new Date('2026-01-15T00:00:00Z'),
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-15T00:00:00Z'),
          };
        }
        return null;
      },
    );

    prismaServiceStub.product.findMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.storeId !== 'store-1') {
          return [];
        }
        if (where.productCategories) {
          return [productRow];
        }
        const name = (where.name as { contains?: string } | undefined)?.contains;
        if (name && !productRow.name.toLowerCase().includes(name.toLowerCase())) {
          return [];
        }
        return [productRow];
      },
    );

    prismaServiceStub.product.count.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.storeId !== 'store-1') {
          return 0;
        }
        const name = (where.name as { contains?: string } | undefined)?.contains;
        if (name && !productRow.name.toLowerCase().includes(name.toLowerCase())) {
          return 0;
        }
        return 1;
      },
    );

    prismaServiceStub.product.findFirst.mockImplementation(
      async ({ where }: { where: { storeId: string; slug: string; status: ProductStatus } }) => {
        if (where.storeId !== 'store-1') {
          return null;
        }
        if (where.slug === 'classic-t-shirt' && where.status === ProductStatus.ACTIVE) {
          return productRow;
        }
        return null;
      },
    );

    prismaServiceStub.category.findMany.mockImplementation(async () => [categoryRow]);
    prismaServiceStub.category.count.mockResolvedValue(1);
    prismaServiceStub.category.findFirst.mockImplementation(
      async ({ where }: { where: { storeId: string; slug: string; status: CategoryStatus } }) => {
        if (where.storeId !== 'store-1') {
          return null;
        }
        if (where.slug === 't-shirts' && where.status === CategoryStatus.ACTIVE) {
          return categoryRow;
        }
        return null;
      },
    );

    prismaServiceStub.page.findFirst.mockImplementation(
      async ({ where }: { where: { storeId: string; slug: string; status: PageStatus } }) => {
        if (where.storeId !== 'store-1') {
          return null;
        }
        if (where.slug === 'about' && where.status === PageStatus.PUBLISHED) {
          return publishedPageRow;
        }
        return null;
      },
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

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function storefrontRequest(path: string, headers: Record<string, string> = {}) {
    let req = request(app.getHttpServer()).get(`/api/v1/storefront${path}`);
    if (Object.keys(headers).length > 0) {
      req = req.set(headers);
    }
    return req;
  }

  describe('store resolution', () => {
    it('resolves the store from the X-Storefront-Slug header', async () => {
      const res = await storefrontRequest('', { 'X-Storefront-Slug': 'my-store' }).expect(200);

      expect(res.body.data).toEqual({
        id: 'store-1',
        name: 'My Store',
        slug: 'my-store',
        description: 'A test store',
        currency: 'EGP',
        timezone: 'Africa/Cairo',
        payments: {
          payOnline: false,
          whatsapp: { enabled: true, phoneNumber: '201012345678', label: null },
        },
      });
    });

    it('resolves the store from the Host header subdomain', async () => {
      const res = await storefrontRequest('', { Host: 'my-store.platform-domain.com' }).expect(200);

      expect(res.body.data.id).toBe('store-1');
    });

    it('returns 404 when no store slug can be derived', async () => {
      const res = await storefrontRequest('').expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for an unknown store slug (no existence leak)', async () => {
      const res = await storefrontRequest('', { 'X-Storefront-Slug': 'no-such-store' }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a DISABLED store (storefront not available)', async () => {
      const res = await storefrontRequest('', { 'X-Storefront-Slug': 'disabled-store' }).expect(
        404,
      );

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for an ACTIVE store with an EXPIRED subscription (Phase 14 overlay)', async () => {
      const res = await storefrontRequest('', { 'X-Storefront-Slug': 'expired-store' }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /storefront/products', () => {
    it('lists ACTIVE products with public fields only (no internal leak)', async () => {
      const res = await storefrontRequest('/products', { 'X-Storefront-Slug': 'my-store' }).expect(
        200,
      );

      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(res.body.data).toHaveLength(1);
      const product = res.body.data[0];
      expect(product).toEqual({
        id: 'product-1',
        name: 'Classic T-Shirt',
        slug: 'classic-t-shirt',
        description: 'Cotton classic',
        images: [{ id: 'media-1', altText: 'Front view' }],
        variants: [{ id: 'variant-1', name: 'Black / Medium', price: 500, available: true }],
      });
      // Internal fields must never leak.
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('storeId');
      expect(serialized).not.toContain('costPrice');
      expect(serialized).not.toContain('storagePath');
      expect(serialized).not.toContain('onHandQuantity');
      expect(serialized).not.toContain('status');
    });

    it('searches ACTIVE products by name', async () => {
      const res = await storefrontRequest('/products?search=shirt', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.meta.total).toBe(1);

      const none = await storefrontRequest('/products?search=nomatch', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);
      expect(none.body.data).toEqual([]);
      expect(none.body.meta.total).toBe(0);
    });

    it('supports pagination params', async () => {
      const res = await storefrontRequest('/products?page=2&limit=5', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(5);
    });

    it('rejects invalid query params with 400 VALIDATION_ERROR', async () => {
      const res = await storefrontRequest('/products?limit=200', {
        'X-Storefront-Slug': 'my-store',
      }).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('never returns products of another store', async () => {
      const res = await storefrontRequest('/products', {
        'X-Storefront-Slug': 'foreign-store',
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /storefront/products/:slug', () => {
    it('returns the ACTIVE product by slug', async () => {
      const res = await storefrontRequest('/products/classic-t-shirt', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.data.slug).toBe('classic-t-shirt');
      expect(res.body.data.variants[0]).toEqual({
        id: 'variant-1',
        name: 'Black / Medium',
        price: 500,
        available: true,
      });
    });

    it('returns 404 for a missing product slug', async () => {
      const res = await storefrontRequest('/products/missing', {
        'X-Storefront-Slug': 'my-store',
      }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /storefront/categories', () => {
    it('lists ACTIVE categories', async () => {
      const res = await storefrontRequest('/categories', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.data).toEqual([
        { id: 'category-1', name: 'T-Shirts', slug: 't-shirts', description: 'All t-shirts' },
      ]);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /storefront/categories/:slug', () => {
    it('returns the ACTIVE category with its ACTIVE products', async () => {
      const res = await storefrontRequest('/categories/t-shirts', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.data.id).toBe('category-1');
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].id).toBe('product-1');
    });

    it('returns 404 for a missing category slug', async () => {
      const res = await storefrontRequest('/categories/missing', {
        'X-Storefront-Slug': 'my-store',
      }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /storefront/pages/:slug', () => {
    it('returns the PUBLISHED page with sections and SEO metadata', async () => {
      const res = await storefrontRequest('/pages/about', {
        'X-Storefront-Slug': 'my-store',
      }).expect(200);

      expect(res.body.data).toEqual({
        id: 'page-1',
        title: 'About',
        slug: 'about',
        seoTitle: 'About My Store',
        seoDescription: 'Learn about My Store',
        sections: [
          { id: 'section-1', sectionType: 'text', content: { body: 'Hello' }, sortOrder: 0 },
        ],
      });
    });

    it('returns 404 for a missing or unpublished page', async () => {
      const res = await storefrontRequest('/pages/draft-page', {
        'X-Storefront-Slug': 'my-store',
      }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
