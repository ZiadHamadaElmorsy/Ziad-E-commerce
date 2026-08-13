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
 * End-to-end coverage of PHASE 2 — Identity & Tenancy.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard) and the
 * real TenantContextService are exercised end-to-end against a stubbed
 * PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - store creation (atomic Store + OWNER membership, tenant-skipped route)
 *   - current-store read/update resolved from the trusted tenant context
 *   - cross-store access prevention (client-supplied store_id never trusted)
 *   - client-supplied role rejected (never an authorization source)
 *   - error taxonomy through the API envelope
 *   - GET /auth/me preserved
 */
describe('Identity & Tenancy (e2e)', () => {
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

  const storeCreate = jest.fn();
  const storeUpdate = jest.fn();
  const membershipCreate = jest.fn();

  const txClient = {
    store: { create: storeCreate, update: storeUpdate },
    storeMembership: { create: membershipCreate },
    subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-new', storeId: 'store-1' }) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    // Interactive transaction: run the callback against the shared tx client.
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(txClient),
      ),
    user: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    storeMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    subscription: { findUnique: jest.fn() },
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
    // Default stubbed database state for the authenticated merchant:
    //   - application User row exists (auth-user-1 -> user-1)
    //   - one ACTIVE OWNER membership in store-1
    //   - store-1 exists
    prismaServiceStub.user.findUnique.mockResolvedValue(userRow);
    prismaServiceStub.store.findUnique.mockResolvedValue(storeRow);
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
    storeCreate.mockReset();
    storeUpdate.mockReset();
    membershipCreate.mockReset();
    storeCreate.mockResolvedValue(storeRow);
    storeUpdate.mockResolvedValue({ ...storeRow, name: 'Updated Store' });
    membershipCreate.mockResolvedValue(membershipRow);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/stores', () => {
    const validBody = { name: 'My Store', slug: 'my-store', currency: 'EGP' };

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .send(validBody)
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates the Store and exactly one ACTIVE OWNER membership atomically', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .send(validBody)
        .expect(201);

      expect(res.body.data).toMatchObject({
        id: 'store-1',
        name: 'My Store',
        slug: 'my-store',
        status: 'ACTIVE',
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      });

      // Both writes happened inside the single transaction.
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

    it('ignores a client-supplied X-Store-Id on the tenant-skipped route', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'forged-store')
        .send(validBody)
        .expect(201);

      expect(res.body.data.id).toBe('store-1');
    });

    it('rejects a slug uniqueness conflict with 409 CONFLICT', async () => {
      storeCreate.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validBody, slug: 'taken-slug' })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('slug');
    });

    it('fails with 404 when the authenticated identity has no application User row', async () => {
      prismaServiceStub.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .send(validBody)
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(storeCreate).not.toHaveBeenCalled();
    });

    it('rejects an invalid payload with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({ slug: 'my-store' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('never accepts a client-supplied role (rejected as unknown field)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validBody, role: 'OWNER' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/stores/current', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/stores/current').expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns the store resolved from the trusted tenant context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stores/current')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: 'store-1',
        name: 'My Store',
        slug: 'my-store',
        currency: 'EGP',
      });
    });

    it('rejects a cross-store selection with 403 (client store_id is only a lookup key)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stores/current')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/stores/current', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/stores/current')
        .send({ name: 'Updated' })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('updates the current store from the trusted tenant context', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/stores/current')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Store' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Store');
      expect(storeUpdate).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { name: 'Updated Store' },
      });
    });

    it('rejects unsupported API-SPEC fields (no FINAL database home) with 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/stores/current')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated', contactEmail: 'a@b.com', logoMediaId: 'media-1' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('prevents cross-tenant updates (client store_id never trusted)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/stores/current')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .send({ name: 'Updated' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(storeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/auth/me (preserved from Phase 1)', () => {
    it('still exposes the trusted identity + tenant through the real chain', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.user.authUserId).toBe('auth-user-1');
      expect(res.body.data.store.id).toBe('store-1');
      expect(res.body.data.membership.role).toBe('OWNER');
    });
  });
});
