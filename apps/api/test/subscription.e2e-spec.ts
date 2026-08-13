import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, MembershipStatus, StoreStatus, SubscriptionStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';

/**
 * End-to-end coverage of PHASE 14 — SaaS Subscription (GET /api/v1/subscription,
 * docs/API-SPEC.md §30; lifecycle docs/DOMAIN-MODEL.md §16.1; expiry overlay
 * BR-SUB-003 / US-SUB-002; storefront overlay docs/DOMAIN-MODEL.md §6.3).
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard ->
 * SubscriptionAccessGuard) and the real TenantContextService + Subscription
 * service are exercised end-to-end against a stateful stubbed PrismaService.
 * Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - unauthenticated access (401) on GET /api/v1/subscription
 *   - tenant resolution: multi-store selection via X-Store-Id; cross-store
 *     access fails closed (403); no store selected -> TENANT_CONTEXT_REQUIRED
 *   - GET returns the TRIAL / ACTIVE / EXPIRED view (frontend can determine
 *     the status; backend stays authoritative)
 *   - lazy expiry evaluation: an elapsed TRIAL is transitioned to EXPIRED on
 *     access (idempotent — a repeated read performs no second transition)
 *   - merchant write overlay: writes are blocked with 403 FORBIDDEN when the
 *     subscription is EXPIRED (dashboard read-only) while reads still work;
 *     writes pass for TRIAL stores
 *   - NOT_FOUND for a store without a subscription row
 *
 * DB-level guarantees (RLS, unique/FK constraints, transaction rollback) are
 * NOT claimed here — they live in the blocked database suite.
 */
describe('Subscription (e2e)', () => {
  let app: INestApplication;

  function storeRow(id: string, slug: string) {
    return {
      id,
      name: slug,
      slug,
      description: null,
      status: StoreStatus.ACTIVE,
      currency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    };
  }

  const store1 = storeRow('store-1', 'my-store');
  const storeExpired = storeRow('store-expired', 'expired-store');
  const storeElapsed = storeRow('store-elapsed-trial', 'elapsed-trial-store');
  const storeNosub = storeRow('store-nosub', 'no-sub-store');

  function membership(id: string, storeId: string, store: typeof store1) {
    return {
      id,
      storeId,
      userId: 'user-1',
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
      store,
      createdAt: new Date('2026-08-12T00:00:00Z'),
      updatedAt: new Date('2026-08-12T00:00:00Z'),
    };
  }

  // -------------------------------------------------------------------------
  // Stateful in-memory subscriptions store used by the stub (supports the
  // lazy-expiry transition + idempotency verification).
  // -------------------------------------------------------------------------
  type DbSubscription = {
    id: string;
    storeId: string;
    status: string;
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
    activatedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const db: { subscriptions: DbSubscription[] } = {
    subscriptions: [
      {
        id: 'sub-1',
        storeId: 'store-1',
        status: SubscriptionStatus.TRIAL,
        trialStartedAt: new Date('2026-08-12T00:00:00Z'),
        trialEndsAt: new Date('2027-08-12T00:00:00Z'),
        activatedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
      {
        id: 'sub-active',
        storeId: 'store-2',
        status: SubscriptionStatus.ACTIVE,
        trialStartedAt: new Date('2026-01-01T00:00:00Z'),
        trialEndsAt: new Date('2026-01-15T00:00:00Z'),
        activatedAt: new Date('2026-01-15T00:00:00Z'),
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T00:00:00Z'),
      },
      {
        id: 'sub-active-own',
        storeId: 'store-active-own',
        status: SubscriptionStatus.ACTIVE,
        trialStartedAt: new Date('2026-01-01T00:00:00Z'),
        trialEndsAt: new Date('2026-01-15T00:00:00Z'),
        activatedAt: new Date('2026-01-15T00:00:00Z'),
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T00:00:00Z'),
      },
      {
        id: 'sub-expired',
        storeId: 'store-expired',
        status: SubscriptionStatus.EXPIRED,
        trialStartedAt: new Date('2026-01-01T00:00:00Z'),
        trialEndsAt: new Date('2026-01-15T00:00:00Z'),
        activatedAt: null,
        expiresAt: new Date('2026-01-15T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T00:00:00Z'),
      },
      {
        id: 'sub-elapsed',
        storeId: 'store-elapsed-trial',
        status: SubscriptionStatus.TRIAL,
        trialStartedAt: new Date('2026-01-01T00:00:00Z'),
        trialEndsAt: new Date('2026-01-15T00:00:00Z'),
        activatedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  };

  const subscriptionUpdateMany = jest.fn();
  const storeUpdate = jest.fn();

  const txClient: Record<string, unknown> = {
    store: { update: storeUpdate },
    subscription: {
      updateMany: subscriptionUpdateMany,
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
    storeMembership: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      throw new Error('Invalid or expired authentication token.');
    }),
  };

  beforeAll(async () => {
    // Tenant resolution: auth-user-1 is OWNER of store-1, store-expired,
    // store-elapsed-trial and store-nosub (multi-store merchant).
    prismaServiceStub.storeMembership.findMany.mockImplementation(
      async ({ where }: { where: { user: { authUserId: string }; status: MembershipStatus } }) => {
        if (where.user.authUserId !== 'auth-user-1') {
          return [];
        }
        return [
          membership('m-1', 'store-1', store1),
          membership('m-active', 'store-active-own', storeRow('store-active-own', 'active-store')),
          membership('m-expired', 'store-expired', storeExpired),
          membership('m-elapsed', 'store-elapsed-trial', storeElapsed),
          membership('m-nosub', 'store-nosub', storeNosub),
        ];
      },
    );

    prismaServiceStub.subscription.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        db.subscriptions.find((s) => s.storeId === where.storeId) ?? null,
    );

    // Guarded lazy transition used by the merchant path (TRIAL -> EXPIRED).
    subscriptionUpdateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { storeId: string; status: string };
        data: Record<string, unknown>;
      }) => {
        const sub = db.subscriptions.find(
          (s) => s.storeId === where.storeId && s.status === where.status,
        );
        if (!sub) {
          return { count: 0 };
        }
        Object.assign(sub, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    );

    // Identity store reads/writes used by the write/read overlay tests.
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === 'store-1') {
          return store1;
        }
        if (where.id === 'store-expired') {
          return storeExpired;
        }
        if (where.id === 'store-elapsed-trial') {
          return storeElapsed;
        }
        if (where.id === 'store-nosub') {
          return storeNosub;
        }
        return null;
      },
    );
    storeUpdate.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...storeRow(where.id, 'my-store'),
      name: 'Updated Store',
    }));

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

  beforeEach(() => {
    // Reset call history (implementations set via mockImplementation persist).
    jest.clearAllMocks();
  });

  function authRequest(method: 'get' | 'patch', path: string, storeId?: string) {
    let req = request(app.getHttpServer())[method](`/api/v1${path}`);
    req = req.set('Authorization', 'Bearer valid-token');
    if (storeId) {
      req = req.set('X-Store-Id', storeId);
    }
    return req;
  }

  describe('authentication boundary', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/subscription').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant resolution', () => {
    it('requires a store selection when the user has multiple stores', async () => {
      const res = await authRequest('get', '/subscription').expect(400);
      expect(res.body.error.code).toBe('TENANT_CONTEXT_REQUIRED');
    });

    it('fails closed (403) for a store the user has no membership in', async () => {
      const res = await authRequest('get', '/subscription', 'store-2').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/subscription — current subscription', () => {
    it('returns the TRIAL subscription for a store in trial', async () => {
      const res = await authRequest('get', '/subscription', 'store-1').expect(200);

      expect(res.body.data).toMatchObject({
        id: 'sub-1',
        status: 'TRIAL',
        trialStartedAt: '2026-08-12T00:00:00.000Z',
        trialEndsAt: '2027-08-12T00:00:00.000Z',
        activatedAt: null,
        expiresAt: null,
      });
    });

    it('returns the ACTIVE subscription for an active store', async () => {
      const res = await authRequest('get', '/subscription', 'store-active-own').expect(200);

      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.activatedAt).toBe('2026-01-15T00:00:00.000Z');
    });

    it('returns the EXPIRED subscription for an expired store', async () => {
      const res = await authRequest('get', '/subscription', 'store-expired').expect(200);

      expect(res.body.data).toMatchObject({
        id: 'sub-expired',
        status: 'EXPIRED',
        expiresAt: '2026-01-15T00:00:00.000Z',
      });
    });

    it('lazily transitions an elapsed TRIAL to EXPIRED on access (lazy expiry)', async () => {
      subscriptionUpdateMany.mockClear();

      const res = await authRequest('get', '/subscription', 'store-elapsed-trial').expect(200);

      expect(res.body.data.status).toBe('EXPIRED');
      expect(res.body.data.expiresAt).toBeDefined();
      // The stateful store now holds EXPIRED.
      expect(db.subscriptions.find((s) => s.storeId === 'store-elapsed-trial')?.status).toBe(
        'EXPIRED',
      );
      expect(subscriptionUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: a repeated read performs no second transition', async () => {
      subscriptionUpdateMany.mockClear();

      const res = await authRequest('get', '/subscription', 'store-elapsed-trial').expect(200);

      expect(res.body.data.status).toBe('EXPIRED');
      expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    });

    it('fails with 404 for a store without a subscription row', async () => {
      const res = await authRequest('get', '/subscription', 'store-nosub').expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('merchant access overlay (dashboard read-only when EXPIRED)', () => {
    it('allows writes for a TRIAL store (normal store operation)', async () => {
      const res = await authRequest('patch', '/stores/current', 'store-1')
        .send({ name: 'Updated Store' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Store');
      expect(storeUpdate).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { name: 'Updated Store' },
      });
    });

    it('blocks merchant writes with 403 FORBIDDEN when the subscription is EXPIRED', async () => {
      const res = await authRequest('patch', '/stores/current', 'store-expired')
        .send({ name: 'Updated Store' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      // The write never reaches the controller/repository.
      expect(storeUpdate).not.toHaveBeenCalled();
    });

    it('keeps merchant reads available when the subscription is EXPIRED (read-only dashboard)', async () => {
      const res = await authRequest('get', '/stores/current', 'store-expired').expect(200);

      expect(res.body.data.id).toBe('store-expired');
    });

    it('blocks merchant writes on an elapsed TRIAL after lazy expiry', async () => {
      const res = await authRequest('patch', '/stores/current', 'store-elapsed-trial')
        .send({ name: 'Updated Store' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
