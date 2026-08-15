import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 22 — store-scoped WhatsApp settings.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard ->
 * SubscriptionAccessGuard) and the real StoreSettingsService run against a
 * stubbed PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution (403)
 *   - GET/PUT /stores/current/settings/whatsapp
 *   - phone normalization + validation (fail closed on invalid numbers)
 *   - tenant isolation: the store id ALWAYS comes from the trusted context —
 *     a client can never read/modify another store's WhatsApp configuration
 */
describe('Store settings — WhatsApp (e2e)', () => {
  let app: INestApplication;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-15T00:00:00Z'),
    updatedAt: new Date('2026-08-15T00:00:00Z'),
  };

  const userRow = {
    id: 'user-1',
    authUserId: 'auth-user-1',
    firstName: 'Ziad',
    lastName: 'Owner',
    email: 'owner@example.com',
    phone: null,
    createdAt: new Date('2026-08-15T00:00:00Z'),
    updatedAt: new Date('2026-08-15T00:00:00Z'),
  };

  const membershipRow = {
    id: 'm-1',
    storeId: 'store-1',
    userId: 'user-1',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-15T00:00:00Z'),
    updatedAt: new Date('2026-08-15T00:00:00Z'),
  };

  const settingsUpsert = jest.fn();
  const settingsFindUniqueTx = jest.fn();

  const txClient = {
    storeSettings: {
      upsert: settingsUpsert,
      findUnique: settingsFindUniqueTx,
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
    user: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    storeMembership: { findMany: jest.fn(), findFirst: jest.fn() },
    subscription: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn(), upsert: jest.fn() },
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
    prismaServiceStub.user.findUnique.mockResolvedValue(userRow);
    prismaServiceStub.store.findUnique.mockResolvedValue(storeRow);
    prismaServiceStub.storeMembership.findMany.mockResolvedValue([
      { ...membershipRow, store: storeRow },
    ]);
    prismaServiceStub.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      storeId: 'store-1',
      status: 'TRIAL',
      trialStartedAt: new Date('2026-08-15T00:00:00Z'),
      trialEndsAt: new Date('2027-08-15T00:00:00Z'),
      activatedAt: null,
      expiresAt: null,
      createdAt: new Date('2026-08-15T00:00:00Z'),
      updatedAt: new Date('2026-08-15T00:00:00Z'),
    });

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
    prismaServiceStub.storeSettings.findUnique.mockReset();
    settingsUpsert.mockReset();
    settingsFindUniqueTx.mockReset();
    prismaServiceStub.storeSettings.findUnique.mockResolvedValue(null);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function authRequest(method: 'get' | 'put', path: string) {
    return request(app.getHttpServer())
      [method](`/api/v1/stores/current/settings/${path}`)
      .set('Authorization', 'Bearer valid-token');
  }

  describe('GET /stores/current/settings/whatsapp', () => {
    it('returns disabled defaults when no settings row exists (fail closed)', async () => {
      const res = await authRequest('get', 'whatsapp').expect(200);
      expect(res.body.data.whatsapp).toEqual({ enabled: false, phoneNumber: '', label: null });
    });

    it('returns the persisted configuration', async () => {
      prismaServiceStub.storeSettings.findUnique.mockResolvedValue({
        id: 'settings-1',
        storeId: 'store-1',
        settings: { whatsapp: { enabled: true, phoneNumber: '201012345678', label: 'Chat' } },
        createdAt: new Date('2026-08-15T00:00:00Z'),
        updatedAt: new Date('2026-08-15T00:00:00Z'),
      });

      const res = await authRequest('get', 'whatsapp').expect(200);
      expect(res.body.data.whatsapp).toEqual({
        enabled: true,
        phoneNumber: '201012345678',
        label: 'Chat',
      });
      expect(prismaServiceStub.storeSettings.findUnique).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
      });
    });

    it('requires authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stores/current/settings/whatsapp')
        .expect(401);
    });

    it('fails closed with 403 when the user has no store membership (cross-tenant impossible)', async () => {
      prismaServiceStub.storeMembership.findMany.mockResolvedValueOnce([]);
      const res = await authRequest('get', 'whatsapp').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT /stores/current/settings/whatsapp', () => {
    it('normalizes and persists the phone number inside the tenant-bound transaction', async () => {
      settingsFindUniqueTx.mockResolvedValue({
        id: 'settings-1',
        storeId: 'store-1',
        settings: {
          whatsapp: { enabled: true, phoneNumber: '201012345678', label: 'Chat with us' },
        },
        createdAt: new Date('2026-08-15T00:00:00Z'),
        updatedAt: new Date('2026-08-15T00:00:00Z'),
      });

      const res = await authRequest('put', 'whatsapp')
        .send({
          whatsapp: { enabled: true, phoneNumber: '+20 (10) 1234-5678', label: 'Chat with us' },
        })
        .expect(200);

      expect(settingsUpsert).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
        create: expect.objectContaining({
          storeId: 'store-1',
          settings: expect.objectContaining({
            whatsapp: expect.objectContaining({
              enabled: true,
              phoneNumber: '201012345678',
            }),
          }),
        }),
        update: expect.objectContaining({
          settings: expect.objectContaining({
            whatsapp: expect.objectContaining({
              enabled: true,
              phoneNumber: '201012345678',
            }),
          }),
        }),
      });
      expect(res.body.data.whatsapp).toEqual({
        enabled: true,
        phoneNumber: '201012345678',
        label: 'Chat with us',
      });
    });

    it('rejects enabling with an invalid phone number (400)', async () => {
      const res = await authRequest('put', 'whatsapp')
        .send({ whatsapp: { enabled: true, phoneNumber: 'abc', label: undefined } })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(settingsUpsert).not.toHaveBeenCalled();
    });

    it('rejects a malformed body (400) and rejects unknown fields', async () => {
      const res = await authRequest('put', 'whatsapp').send({ enabled: true }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('does not accept a client-supplied storeId (forbidden field)', async () => {
      const res = await authRequest('put', 'whatsapp')
        .send({
          whatsapp: { enabled: true, phoneNumber: '+201012345678' },
          storeId: 'store-b',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
