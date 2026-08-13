import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 5 — Customers.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard) and the
 * real TenantContextService are exercised end-to-end against a stubbed
 * PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution for every group
 *   - GET /customers (list, page/limit/search, pagination envelope)
 *   - GET /customers/:customerId (get, missing -> 404)
 *   - GET /customers/:customerId/orders (customer order history, read-only)
 *   - validation (400 VALIDATION_ERROR) incl. forbidNonWhitelisted
 *   - cross-tenant behavior: client-supplied X-Store-Id for another store
 *     fails 403; foreign customer ids fail 404 (no existence leak)
 *   - documentation that NO CustomerAddress HTTP endpoints exist (404), since
 *     API-SPEC §20 documents none
 */
describe('Customers (e2e)', () => {
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

  const customerRow = {
    id: 'customer-1',
    storeId: 'store-1',
    email: 'ahmed@example.com',
    phone: '01000000000',
    firstName: 'Ahmed',
    lastName: 'Ali',
    authUserId: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'customer-1',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 50n,
    taxTotal: 140n,
    grandTotal: 1190n,
    customerEmail: 'ahmed@example.com',
    customerPhone: null,
    shippingAddressSnapshot: {},
    billingAddressSnapshot: null,
    idempotencyKey: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn(),
    storeMembership: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    customer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    order: {
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
    prismaServiceStub.customer.findUnique.mockReset();
    prismaServiceStub.customer.findMany.mockReset();
    prismaServiceStub.customer.count.mockReset();
    prismaServiceStub.order.findMany.mockReset();
    prismaServiceStub.order.count.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/customers', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/customers').expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns a store-scoped paginated list with the data/meta envelope', async () => {
      prismaServiceStub.customer.findMany.mockResolvedValue([customerRow]);
      prismaServiceStub.customer.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual([
        {
          id: 'customer-1',
          email: 'ahmed@example.com',
          phone: '01000000000',
          firstName: 'Ahmed',
          lastName: 'Ali',
        },
      ]);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });

      // The list query must be scoped to the trusted store.
      expect(prismaServiceStub.customer.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('passes the search parameter through to the store-scoped query', async () => {
      prismaServiceStub.customer.findMany.mockResolvedValue([]);
      prismaServiceStub.customer.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?search=ahmed')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(prismaServiceStub.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            storeId: 'store-1',
            OR: expect.arrayContaining([
              { firstName: { contains: 'ahmed', mode: 'insensitive' } },
              { lastName: { contains: 'ahmed', mode: 'insensitive' } },
            ]),
          },
        }),
      );
    });

    it('rejects a client-supplied store_id for another store (403, never an authorization source)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(prismaServiceStub.customer.findMany).not.toHaveBeenCalled();
    });

    it('rejects invalid pagination (limit above the maximum) with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?limit=101')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects undocumented query parameters (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?status=ACTIVE')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/customers/:customerId', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/customer-1')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns the customer when it belongs to the current store', async () => {
      prismaServiceStub.customer.findUnique.mockResolvedValue(customerRow);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/customer-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual({
        id: 'customer-1',
        email: 'ahmed@example.com',
        phone: '01000000000',
        firstName: 'Ahmed',
        lastName: 'Ali',
      });
      expect(prismaServiceStub.customer.findUnique).toHaveBeenCalledWith({
        where: { storeId_id: { storeId: 'store-1', id: 'customer-1' } },
      });
    });

    it('returns 404 NOT_FOUND for a missing or foreign customer (no existence leak)', async () => {
      prismaServiceStub.customer.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/store-b-customer')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/customers/:customerId/orders', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/customer-1/orders')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 when the customer does not exist in the store (before any order access)', async () => {
      prismaServiceStub.customer.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/store-b-customer/orders')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(prismaServiceStub.order.findMany).not.toHaveBeenCalled();
    });

    it('returns a store-scoped paginated order-history projection', async () => {
      prismaServiceStub.customer.findUnique.mockResolvedValue(customerRow);
      prismaServiceStub.order.findMany.mockResolvedValue([orderRow]);
      prismaServiceStub.order.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/customer-1/orders')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual([
        {
          id: 'order-1',
          orderNumber: 'ORD-2026-000001',
          status: 'PENDING',
          currency: 'EGP',
          grandTotal: 1190,
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ]);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(prismaServiceStub.order.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1', customerId: 'customer-1' },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('CustomerAddress endpoints', () => {
    it('are NOT exposed: API-SPEC §20 documents no address endpoints (404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers/customer-1/addresses')
        .set('Authorization', 'Bearer valid-token')
        .send({ city: 'Tanta', addressLine: 'El Geish St 12' })
        .expect(404);

      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
