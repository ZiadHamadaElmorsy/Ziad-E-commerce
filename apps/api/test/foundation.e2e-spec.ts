import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { ForbiddenError, UnauthorizedError } from '../src/common/errors/domain-exceptions';
import { TenantContextService } from '../src/tenant/tenant-context.service';

/**
 * End-to-end coverage of the Phase 1 foundation:
 *   - request correlation (X-Request-ID)
 *   - authentication boundary (401 for missing/malformed/invalid tokens)
 *   - tenant boundary (resolved store comes from membership)
 *
 * Supabase and PostgreSQL are NOT contacted: AuthProvider and
 * TenantContextService are replaced with stubs.
 */
describe('Foundation (e2e)', () => {
  let app: INestApplication;

  const prismaServiceStub = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }),
  };

  const tenantContextServiceStub = {
    resolveForUser: jest
      .fn()
      .mockImplementation(async (authUserId: string, candidateStoreId?: string) => {
        if (authUserId !== 'auth-user-1') {
          throw new ForbiddenError('No active store membership for this user.');
        }
        if (candidateStoreId && candidateStoreId !== 'store-1') {
          throw new ForbiddenError('You do not have access to the requested store.');
        }
        return {
          membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
          store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
        };
      }),
  };

  beforeAll(async () => {
    // NODE_ENV and DATABASE_URL are set in ./env.e2e.ts (via jest setupFiles).

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(AuthProvider)
      .useValue(authProviderStub)
      .overrideProvider(TenantContextService)
      .useValue(tenantContextServiceStub)
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

  describe('request correlation', () => {
    it('propagates a client-supplied X-Request-ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-ID', 'client-req-123')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('client-req-123');
    });

    it('generates a request ID when the client does not provide one', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps the request ID available in the request lifecycle (auth/me echo)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Request-ID', 'echo-this-id')
        .expect(200);

      expect(res.body.data.requestId).toBe('echo-this-id');
    });
  });

  describe('authentication boundary', () => {
    it('rejects a protected request without a token with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBeDefined();
    });

    it('rejects a malformed Authorization header with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Basic abc123')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an invalid token with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('accepts a valid token and exposes the verified identity + tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data.user).toEqual({
        authUserId: 'auth-user-1',
        email: 'owner@example.com',
      });
      expect(res.body.data.store.id).toBe('store-1');
      expect(res.body.data.membership.role).toBe('OWNER');
    });
  });

  describe('tenant boundary', () => {
    it('rejects a cross-store selection with 403 (never trusts the client store_id)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects an authenticated user without an active membership', async () => {
      authProviderStub.verifyToken.mockResolvedValueOnce({
        authUserId: 'no-membership-user',
        email: 'guest@example.com',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('public endpoints and error envelope', () => {
    it('keeps the health endpoint public', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });

    it('renders unknown routes with the envelope without leaking internals', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(res.text).not.toContain('at ');
      expect(res.text).not.toContain('DATABASE_URL');
    });
  });
});
