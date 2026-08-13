import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus, SubscriptionStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * PHASE 15 — SYSTEM INTEGRATION (one application, every module, one boot).
 *
 * This suite validates the complete Phase 1–14 system as ONE application —
 * the integration surface that isolated per-module e2e suites cannot observe:
 *
 *   1. The FULL documented endpoint inventory (docs/API-SPEC.md §15–§31) is
 *      mounted behind the global guard chain: every protected merchant route
 *      returns 401 without a token; every public route stays reachable.
 *   2. The guard chain ordering (AuthGuard -> TenantContextGuard -> RolesGuard
 *      -> SubscriptionAccessGuard) works uniformly ACROSS modules — the
 *      subscription access overlay blocks every merchant write (403 FORBIDDEN)
 *      when EXPIRED and lets writes through when TRIAL, while merchant reads
 *      stay available (read-only dashboard).
 *   3. Public paths fail closed through their real integrations: the
 *      storefront resolver applies the subscription overlay (EXPIRED -> 404,
 *      no existence leak) and the Paymob webhook rejects invalid signatures.
 *   4. The error envelope is consistent across modules (401/403/404/400/500).
 *
 * Supabase and PostgreSQL are NOT contacted: AuthProvider is stubbed and
 * PrismaService is a stateful stub (the established Phase 1–14 e2e pattern).
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS/concurrency) are NOT claimed here —
 * they live in the blocked database suites.
 */
describe('Phase 15 — System integration (e2e)', () => {
  let app: INestApplication;

  // ---------------------------------------------------------------------------
  // Stub data (trusted tenant context for auth-user-1)
  // ---------------------------------------------------------------------------

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

  // Store resolved through the PUBLIC storefront slug (never a store id).
  const publicStoreRow = {
    id: 'store-public',
    name: 'Public Store',
    slug: 'public-store',
    description: null,
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  /** Mutable subscription status for the merchant store (guard runs on writes). */
  let merchantSubscriptionStatus: SubscriptionStatus = SubscriptionStatus.TRIAL;
  /** Mutable subscription status for the public storefront store. */
  let publicStoreSubscriptionStatus: SubscriptionStatus = SubscriptionStatus.TRIAL;

  const subscriptionRow = {
    id: 'sub-1',
    storeId: 'store-1',
    status: merchantSubscriptionStatus,
    trialStartedAt: new Date('2026-08-01T00:00:00Z'),
    trialEndsAt: new Date('2026-08-30T00:00:00Z'),
    activatedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };

  const txClient: Record<string, unknown> = {
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
    storeMembership: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }),
  };

  const VALID_TOKEN = 'Bearer valid-token';

  /** Typed supertest dispatch for dynamic [method, path] route tables. */
  function http(verb: string, path: string): request.Test {
    const agent = request(app.getHttpServer());
    switch (verb.toUpperCase()) {
      case 'GET':
        return agent.get(path);
      case 'POST':
        return agent.post(path);
      case 'PATCH':
        return agent.patch(path);
      case 'PUT':
        return agent.put(path);
      case 'DELETE':
        return agent.delete(path);
      default:
        throw new Error(`Unsupported HTTP method: ${verb}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Documented endpoint inventory (docs/API-SPEC.md §15–§31) + foundation probe
  // ---------------------------------------------------------------------------

  /** Every protected merchant route: [method, path]. */
  const PROTECTED_ROUTES: Array<[string, string]> = [
    ['GET', '/api/v1/auth/me'],
    ['POST', '/api/v1/stores'],
    ['GET', '/api/v1/stores/current'],
    ['PATCH', '/api/v1/stores/current'],
    ['GET', '/api/v1/products'],
    ['GET', '/api/v1/products/product-1'],
    ['POST', '/api/v1/products'],
    ['PATCH', '/api/v1/products/product-1'],
    ['POST', '/api/v1/products/product-1/publish'],
    ['POST', '/api/v1/products/product-1/unpublish'],
    ['POST', '/api/v1/products/product-1/archive'],
    ['GET', '/api/v1/products/product-1/variants'],
    ['POST', '/api/v1/products/product-1/variants'],
    ['PATCH', '/api/v1/variants/variant-1'],
    ['POST', '/api/v1/variants/variant-1/archive'],
    ['GET', '/api/v1/categories'],
    ['POST', '/api/v1/categories'],
    ['GET', '/api/v1/categories/category-1'],
    ['PATCH', '/api/v1/categories/category-1'],
    ['POST', '/api/v1/categories/category-1/archive'],
    ['POST', '/api/v1/products/product-1/categories/category-1'],
    ['DELETE', '/api/v1/products/product-1/categories/category-1'],
    ['GET', '/api/v1/variants/variant-1/inventory'],
    ['POST', '/api/v1/variants/variant-1/inventory/adjust'],
    ['GET', '/api/v1/variants/variant-1/inventory/movements'],
    ['GET', '/api/v1/customers'],
    ['GET', '/api/v1/customers/customer-1'],
    ['GET', '/api/v1/customers/customer-1/orders'],
    ['GET', '/api/v1/cart'],
    ['POST', '/api/v1/cart/items'],
    ['PATCH', '/api/v1/cart/items/item-1'],
    ['DELETE', '/api/v1/cart/items/item-1'],
    ['DELETE', '/api/v1/cart/items'],
    ['POST', '/api/v1/checkout'],
    ['GET', '/api/v1/orders'],
    ['GET', '/api/v1/orders/order-1'],
    ['PATCH', '/api/v1/orders/order-1/status'],
    ['POST', '/api/v1/orders/order-1/payments'],
    ['GET', '/api/v1/orders/order-1/payment'],
    ['GET', '/api/v1/pages'],
    ['POST', '/api/v1/pages'],
    ['GET', '/api/v1/pages/page-1'],
    ['PATCH', '/api/v1/pages/page-1'],
    ['POST', '/api/v1/pages/page-1/archive'],
    ['POST', '/api/v1/pages/page-1/sections'],
    ['PATCH', '/api/v1/pages/page-1/sections/section-1'],
    ['DELETE', '/api/v1/pages/page-1/sections/section-1'],
    ['POST', '/api/v1/pages/page-1/sections/reorder'],
    ['GET', '/api/v1/navigation'],
    ['PUT', '/api/v1/navigation'],
    ['GET', '/api/v1/theme'],
    ['PUT', '/api/v1/theme'],
    ['POST', '/api/v1/media'],
    ['GET', '/api/v1/media/media-1'],
    ['DELETE', '/api/v1/media/media-1'],
    ['GET', '/api/v1/subscription'],
  ];

  /**
   * Every merchant WRITE endpoint (docs/API-SPEC.md) — the subscription access
   * overlay must block each one (403 FORBIDDEN) when the subscription is
   * EXPIRED. `POST /stores` is excluded by design: it is a platform-level
   * route (`@SkipTenantContext`) with no Store/membership yet, so the overlay
   * does not apply (verified separately below).
   */
  const MERCHANT_WRITES: Array<[string, string]> = [
    ['PATCH', '/api/v1/stores/current'],
    ['POST', '/api/v1/products'],
    ['PATCH', '/api/v1/products/product-1'],
    ['POST', '/api/v1/products/product-1/publish'],
    ['POST', '/api/v1/products/product-1/unpublish'],
    ['POST', '/api/v1/products/product-1/archive'],
    ['POST', '/api/v1/products/product-1/variants'],
    ['PATCH', '/api/v1/variants/variant-1'],
    ['POST', '/api/v1/variants/variant-1/archive'],
    ['POST', '/api/v1/categories'],
    ['PATCH', '/api/v1/categories/category-1'],
    ['POST', '/api/v1/categories/category-1/archive'],
    ['POST', '/api/v1/products/product-1/categories/category-1'],
    ['DELETE', '/api/v1/products/product-1/categories/category-1'],
    ['POST', '/api/v1/variants/variant-1/inventory/adjust'],
    ['POST', '/api/v1/cart/items'],
    ['PATCH', '/api/v1/cart/items/item-1'],
    ['DELETE', '/api/v1/cart/items/item-1'],
    ['DELETE', '/api/v1/cart/items'],
    ['POST', '/api/v1/checkout'],
    ['PATCH', '/api/v1/orders/order-1/status'],
    ['POST', '/api/v1/orders/order-1/payments'],
    ['POST', '/api/v1/pages'],
    ['PATCH', '/api/v1/pages/page-1'],
    ['POST', '/api/v1/pages/page-1/archive'],
    ['POST', '/api/v1/pages/page-1/sections'],
    ['PATCH', '/api/v1/pages/page-1/sections/section-1'],
    ['DELETE', '/api/v1/pages/page-1/sections/section-1'],
    ['POST', '/api/v1/pages/page-1/sections/reorder'],
    ['PUT', '/api/v1/navigation'],
    ['PUT', '/api/v1/theme'],
    ['POST', '/api/v1/media'],
    ['DELETE', '/api/v1/media/media-1'],
  ];

  beforeAll(async () => {
    // Tenant resolution: auth-user-1 is the ACTIVE OWNER of store-1.
    prismaServiceStub.storeMembership.findMany.mockImplementation(
      async ({ where }: { where: { status: MembershipStatus; user: { authUserId: string } } }) => {
        if (where.user.authUserId !== 'auth-user-1' || where.status !== MembershipStatus.ACTIVE) {
          return [];
        }
        return [{ ...membershipRow, store: storeRow }];
      },
    );

    // Subscription reads: the merchant store and the public storefront store.
    prismaServiceStub.subscription.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) => {
        if (where.storeId === 'store-1') {
          return { ...subscriptionRow, status: merchantSubscriptionStatus };
        }
        if (where.storeId === 'store-public') {
          return {
            ...subscriptionRow,
            id: 'sub-public',
            storeId: 'store-public',
            status: publicStoreSubscriptionStatus,
          };
        }
        return null;
      },
    );

    // Public storefront resolution by slug.
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === publicStoreRow.slug) {
          return publicStoreRow;
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

  describe('full endpoint inventory — every documented merchant route is mounted and protected', () => {
    it.each(PROTECTED_ROUTES)('%s %s -> 401 UNAUTHORIZED without a token', async (method, path) => {
      const res = await http(method, path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('public endpoints — reachable without a token', () => {
    it('GET /api/v1/health stays public', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it.each([
      '/api/v1/storefront',
      '/api/v1/storefront/products',
      '/api/v1/storefront/products/any-slug',
      '/api/v1/storefront/categories',
      '/api/v1/storefront/categories/any-slug',
      '/api/v1/storefront/pages/any-slug',
    ])('GET %s fails closed (404) without a resolvable public store', async (path) => {
      const res = await request(app.getHttpServer()).get(path).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.text).not.toContain('at ');
    });

    it('POST /api/v1/webhooks/paymob rejects an unverified signature with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/paymob')
        .send({ obj: { id: 1, success: true } })
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('subscription access overlay — uniform across every merchant write endpoint', () => {
    beforeEach(() => {
      merchantSubscriptionStatus = SubscriptionStatus.EXPIRED;
    });

    it.each(MERCHANT_WRITES)(
      '%s %s -> 403 FORBIDDEN while the subscription is EXPIRED',
      async (method, path) => {
        const res = await http(method, path).set('Authorization', VALID_TOKEN);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      },
    );

    it('POST /api/v1/stores is NOT blocked by the overlay (platform-level, no store yet)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', VALID_TOKEN)
        .send({ name: 'New Store', slug: 'new-store' });
      // The subscription guard must skip this route (SkipTenantContext); any
      // outcome other than the overlay's 403 FORBIDDEN proves the exemption.
      expect(res.status).not.toBe(403);
      expect(res.body.error?.code).not.toBe('FORBIDDEN');
    });

    it('merchant READS stay available while EXPIRED (read-only dashboard)', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', VALID_TOKEN)
        .expect(200);
      expect(me.body.data.store.id).toBe('store-1');

      const sub = await request(app.getHttpServer())
        .get('/api/v1/subscription')
        .set('Authorization', VALID_TOKEN)
        .expect(200);
      expect(sub.body.data.status).toBe(SubscriptionStatus.EXPIRED);
    });
  });

  describe('guard chain — legitimate writes pass when the subscription is TRIAL', () => {
    beforeEach(() => {
      merchantSubscriptionStatus = SubscriptionStatus.TRIAL;
    });

    it.each([
      ['POST', '/api/v1/products'],
      ['PATCH', '/api/v1/products/product-1'],
      ['POST', '/api/v1/variants/variant-1/inventory/adjust'],
      ['POST', '/api/v1/cart/items'],
      ['POST', '/api/v1/checkout'],
      ['POST', '/api/v1/orders/order-1/payments'],
      ['PUT', '/api/v1/theme'],
      ['POST', '/api/v1/pages'],
      ['PUT', '/api/v1/navigation'],
    ] as Array<[string, string]>)(
      '%s %s is not blocked by the subscription overlay (guards pass; service outcome may vary)',
      async (method, path) => {
        const res = await http(method, path).set('Authorization', VALID_TOKEN);
        expect(res.status).not.toBe(403);
        expect(res.body.error?.code).not.toBe('FORBIDDEN');
      },
    );
  });

  describe('storefront + subscription overlay integration (public path)', () => {
    it('an EXPIRED subscription disables the public storefront (404, no existence leak)', async () => {
      publicStoreSubscriptionStatus = SubscriptionStatus.EXPIRED;
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront')
        .set('X-Storefront-Slug', 'public-store')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('a TRIAL subscription keeps the public storefront available', async () => {
      publicStoreSubscriptionStatus = SubscriptionStatus.TRIAL;
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront')
        .set('X-Storefront-Slug', 'public-store')
        .expect(200);
      expect(res.body.data.slug).toBe('public-store');
    });
  });

  describe('error envelope — consistent across modules', () => {
    it('unknown routes -> 404 RESOURCE_NOT_FOUND envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(res.text).not.toContain('DATABASE_URL');
      expect(res.text).not.toContain('at ');
    });

    it('request validation -> 400 VALIDATION_ERROR envelope', async () => {
      merchantSubscriptionStatus = SubscriptionStatus.TRIAL;
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', VALID_TOKEN)
        .send({})
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('missing token -> 401 UNAUTHORIZED envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
