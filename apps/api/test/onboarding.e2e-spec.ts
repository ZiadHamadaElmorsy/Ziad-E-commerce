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
 * End-to-end coverage of PHASE 17 — Merchant onboarding.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard ->
 * SubscriptionAccessGuard) is exercised against a stubbed PrismaService.
 * Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - POST /onboarding/merchant: atomic User + Store + OWNER membership + trial
 *   - idempotent retry returns the existing store (no duplicates)
 *   - slug conflict -> 409 CONFLICT
 *   - client-supplied role rejected (never an authorization source)
 *   - validation errors -> 400
 *   - GET /onboarding/status: store-less and store-bearing states
 *   - authentication boundary preserved (401 without a token)
 */
describe('Merchant Onboarding (e2e)', () => {
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

  const userRow = {
    id: 'user-1',
    authUserId: 'auth-user-1',
    firstName: 'Ziad',
    lastName: 'Owner',
    email: 'owner@example.com',
    phone: null,
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

  const userCreate = jest.fn();
  const storeCreate = jest.fn();
  const membershipCreate = jest.fn();

  const txClient = {
    user: { findUnique: jest.fn(), create: userCreate },
    store: { create: storeCreate, findUnique: jest.fn() },
    storeMembership: { create: membershipCreate, findMany: jest.fn() },
    subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1', storeId: 'store-1' }) },
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
    user: { findUnique: jest.fn(), create: userCreate },
    store: { findUnique: jest.fn() },
    storeMembership: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    subscription: { findUnique: jest.fn() },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      if (token === 'other-token') {
        return { authUserId: 'auth-user-2', email: 'other@example.com' };
      }
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }),
  };

  beforeAll(async () => {
    // Default stubbed database state for the fresh merchant:
    //   - no application User row yet (onboarding provisions it)
    //   - no memberships, no stores
    prismaServiceStub.user.findUnique.mockResolvedValue(null);
    prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);
    prismaServiceStub.store.findUnique.mockResolvedValue(null);
    txClient.user.findUnique.mockResolvedValue(null);
    txClient.storeMembership.findMany.mockResolvedValue([]);
    txClient.store.findUnique.mockResolvedValue(null);

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
    userCreate.mockReset();
    storeCreate.mockReset();
    membershipCreate.mockReset();
    userCreate.mockResolvedValue(userRow);
    storeCreate.mockResolvedValue(storeRow);
    membershipCreate.mockResolvedValue(membershipRow);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/onboarding/merchant', () => {
    const validBody = {
      firstName: 'Ziad',
      lastName: 'Owner',
      storeName: 'My Store',
      slug: 'my-store',
      currency: 'EGP',
    };

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .send(validBody)
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates the application User + Store + exactly one ACTIVE OWNER membership atomically', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .set('Authorization', 'Bearer valid-token')
        .send(validBody)
        .expect(201);

      expect(res.body.data.store).toMatchObject({
        id: 'store-1',
        name: 'My Store',
        slug: 'my-store',
        status: 'ACTIVE',
        currency: 'EGP',
      });
      expect(res.body.data.membership).toMatchObject({
        storeId: 'store-1',
        role: 'OWNER',
        status: 'ACTIVE',
      });

      // The application User row was provisioned inside the transaction.
      expect(userCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          authUserId: 'auth-user-1',
          firstName: 'Ziad',
          lastName: 'Owner',
          email: 'owner@example.com',
        }),
      });
      expect(storeCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'My Store', slug: 'my-store', currency: 'EGP' }),
      });
      expect(membershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 'store-1',
          userId: 'user-1',
          role: 'OWNER',
          status: 'ACTIVE',
        }),
      });
    });

    it('returns the existing store on retry instead of creating duplicates', async () => {
      // The merchant now exists and owns a store (created by a previous request).
      prismaServiceStub.user.findUnique.mockResolvedValue(userRow);
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([
        { ...membershipRow, store: storeRow },
      ]);
      prismaServiceStub.store.findUnique.mockResolvedValue(storeRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validBody, storeName: 'Another Name' })
        .expect(201);

      expect(res.body.data.store.id).toBe('store-1');
      expect(storeCreate).not.toHaveBeenCalled();
      expect(membershipCreate).not.toHaveBeenCalled();
    });

    it('rejects a slug uniqueness conflict with 409 CONFLICT', async () => {
      prismaServiceStub.user.findUnique.mockResolvedValue(null);
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);
      txClient.user.findUnique.mockResolvedValue(null);
      txClient.storeMembership.findMany.mockResolvedValue([]);
      storeCreate.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['slug'] },
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .set('Authorization', 'Bearer valid-token')
        .send(validBody)
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('slug');
    });

    it('never accepts a client-supplied role (rejected as unknown field)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validBody, role: 'OWNER' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(userCreate).not.toHaveBeenCalled();
    });

    it('rejects an invalid payload with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/merchant')
        .set('Authorization', 'Bearer valid-token')
        .send({ storeName: 'My Store' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('tenant isolation (merchant A vs merchant B)', () => {
    it('prevents merchant B from reading merchant A store via a forged store id', async () => {
      // Merchant B has no ACTIVE membership in store-1.
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/stores/current')
        .set('Authorization', 'Bearer other-token')
        .set('X-Store-Id', 'store-1')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents merchant B from creating products inside merchant A store', async () => {
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', 'Bearer other-token')
        .send({ name: 'Sneaky Product' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents merchant B from listing merchant A orders/customers', async () => {
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);

      const orders = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', 'Bearer other-token')
        .expect(403);
      expect(orders.body.error.code).toBe('FORBIDDEN');

      const customers = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer other-token')
        .expect(403);
      expect(customers.body.error.code).toBe('FORBIDDEN');
    });
  });


  describe('GET /api/v1/onboarding/status', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/onboarding/status').expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns a store-less state for a new merchant who has not created a store', async () => {
      prismaServiceStub.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/onboarding/status')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual({ user: null, store: null, membership: null });
    });

    it('returns the resolved store + membership for an onboarded merchant', async () => {
      prismaServiceStub.user.findUnique.mockResolvedValue(userRow);
      prismaServiceStub.storeMembership.findMany.mockResolvedValue([membershipRow]);
      prismaServiceStub.store.findUnique.mockResolvedValue(storeRow);

      const res = await request(app.getHttpServer())
        .get('/api/v1/onboarding/status')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.user).toMatchObject({
        authUserId: 'auth-user-1',
        firstName: 'Ziad',
        email: 'owner@example.com',
      });
      expect(res.body.data.store.slug).toBe('my-store');
      expect(res.body.data.membership.role).toBe('OWNER');
    });
  });
});

