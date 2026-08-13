import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, MembershipStatus, StoreStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { StorageProvider } from '../src/media/storage/storage-provider';

/**
 * End-to-end coverage of PHASE 13 — Media (POST / GET / DELETE
 * /api/v1/media, docs/API-SPEC.md §29).
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard) and the
 * real TenantContextService are exercised end-to-end against a stateful
 * stubbed PrismaService. The StorageProvider is replaced by an in-memory
 * object store so the full upload -> store -> reference -> delete lifecycle is
 * verified through HTTP. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - unauthenticated access (401) on every media route
 *   - tenant resolution from the ACTIVE membership; cross-store access fails
 *   - upload flow: raw-binary direct server upload with Content-Type
 *     classification (IMAGE / VIDEO / FILE), alt text, storage reference
 *   - media metadata retrieval (store-scoped, no existence leak)
 *   - deletion: physical delete of unreferenced media (row + storage object),
 *     product-referenced media refused (409 CONFLICT), theme-logo reference
 *     cleared (ON DELETE SET NULL semantics)
 *   - invalid input: empty body, JSON body, oversized alt text
 *   - error taxonomy through the API envelope; no internal field leaks
 *
 * DB-level guarantees (RLS tenant isolation, FK RESTRICT/SET NULL, CHECK
 * constraints) are NOT claimed here — they live in the blocked database suite.
 */
describe('Media (e2e)', () => {
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
    role: MembershipRole.OWNER,
    status: MembershipStatus.ACTIVE,
    store: storeRow,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  // -------------------------------------------------------------------------
  // Stateful in-memory database used by the stub.
  // -------------------------------------------------------------------------
  type DbMedia = {
    id: string;
    storeId: string;
    storagePath: string;
    mediaType: string;
    mimeType: string | null;
    sizeBytes: bigint | null;
    altText: string | null;
    createdAt: Date;
    [key: string]: unknown;
  };

  type DbProductMedia = {
    id: string;
    storeId: string;
    productId: string;
    mediaId: string;
    variantId: string | null;
    altText: string | null;
    sortOrder: number;
    createdAt: Date;
  };

  type DbTheme = {
    id: string;
    storeId: string;
    logoMediaId: string | null;
    config: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  };

  const db: {
    media: DbMedia[];
    productMedia: DbProductMedia[];
    themes: DbTheme[];
  } = {
    media: [
      {
        id: 'media-1',
        storeId: 'store-1',
        storagePath: 'store-1/media-1',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 100n,
        altText: 'Referenced image',
        createdAt: new Date('2026-08-12T00:00:00Z'),
      },
      {
        id: 'media-unreferenced',
        storeId: 'store-1',
        storagePath: 'store-1/media-unreferenced',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 50n,
        altText: null,
        createdAt: new Date('2026-08-12T01:00:00Z'),
      },
      {
        id: 'media-foreign',
        storeId: 'store-2',
        storagePath: 'store-2/media-foreign',
        mediaType: 'FILE',
        mimeType: 'application/pdf',
        sizeBytes: 20n,
        altText: null,
        createdAt: new Date('2026-08-12T02:00:00Z'),
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
      },
    ],
    themes: [
      {
        id: 'theme-1',
        storeId: 'store-1',
        logoMediaId: null,
        config: {},
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
    ],
  };

  // -------------------------------------------------------------------------
  // In-memory storage provider: real upload/delete behavior without Supabase.
  // -------------------------------------------------------------------------
  const objects = new Map<string, Buffer>();
  const storageStub = {
    uploadObject: jest.fn().mockImplementation(async (key: string, data: Buffer) => {
      objects.set(key, Buffer.from(data));
    }),
    deleteObject: jest.fn().mockImplementation(async (key: string) => {
      objects.delete(key);
    }),
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { authUserId: 'auth-user-1', email: 'owner@example.com' };
      }
      throw new Error('Invalid or expired authentication token.');
    }),
  };

  // Transaction client shared by every $transaction callback.
  const txClient: Record<string, unknown> = {};

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
    media: { findFirst: jest.fn() },
    themeConfiguration: { findUnique: jest.fn() },
  };

  beforeAll(async () => {
    // ---------------------------------------------------------------------
    // Wire the stateful stub.
    // ---------------------------------------------------------------------

    // Tenant resolution: membership of auth-user-1 in store-1.
    prismaServiceStub.storeMembership.findMany.mockImplementation(
      async ({ where }: { where: { user: { authUserId: string }; status: MembershipStatus } }) => {
        if (where.user.authUserId !== 'auth-user-1') {
          return [];
        }
        return [membershipRow];
      },
    );

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

    // RLS tenant binder runs inside every tenant-bound transaction.
    txClient.$executeRaw = jest.fn().mockResolvedValue(undefined);

    // --- media -----------------------------------------------------------
    prismaServiceStub.media.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; storeId: string } }) =>
        db.media.find((m) => m.id === where.id && m.storeId === where.storeId) ?? null,
    );

    txClient.media = {
      findFirst: prismaServiceStub.media.findFirst,
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          createdAt: new Date(),
          ...data,
        };
        db.media.push(row as DbMedia);
        return row;
      }),
      deleteMany: jest
        .fn()
        .mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          const before = db.media.length;
          const target = db.media.find(
            (m) =>
              (where.id === undefined || m.id === where.id) &&
              (where.storeId === undefined || m.storeId === where.storeId),
          );
          db.media = db.media.filter((m) => !(m.id === where.id && m.storeId === where.storeId));
          // Mirrors the DB FK `theme_configurations.logo_media_id ... ON
          // DELETE SET NULL` (docs/DATABASE.md §9.2/§22.4).
          if (target) {
            for (const theme of db.themes) {
              if (theme.logoMediaId === target.id) {
                theme.logoMediaId = null;
                theme.updatedAt = new Date();
              }
            }
          }
          return { count: before - db.media.length };
        }),
    };

    txClient.productMedia = {
      count: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { storeId: string; mediaId: string } }) =>
            db.productMedia.filter(
              (pm) => pm.storeId === where.storeId && pm.mediaId === where.mediaId,
            ).length,
        ),
    };

    // --- theme (CMS logo reference integration) ----------------------------
    prismaServiceStub.themeConfiguration.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        db.themes.find((t) => t.storeId === where.storeId) ?? null,
    );
    txClient.themeConfiguration = {
      findUnique: prismaServiceStub.themeConfiguration.findUnique,
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'theme-new',
          logoMediaId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        db.themes.push(row as DbTheme);
        return row;
      }),
      updateMany: jest
        .fn()
        .mockImplementation(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            let affected = 0;
            for (const theme of db.themes) {
              const matches =
                (where.id === undefined || theme.id === where.id) &&
                (where.storeId === undefined || theme.storeId === where.storeId);
              if (matches) {
                Object.assign(theme, data, { updatedAt: new Date() });
                affected += 1;
              }
            }
            return { count: affected };
          },
        ),
    };

    // Audit actor resolution + audit write (theme PUT audits the change).
    txClient.user = {
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { authUserId: string } }) => {
          return where.authUserId === 'auth-user-1' ? userRow : null;
        }),
    };
    txClient.auditLog = {
      create: jest.fn().mockResolvedValue({ id: 'audit-new' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(AuthProvider)
      .useValue(authProviderStub)
      .overrideProvider(StorageProvider)
      .useValue(storageStub)
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

  function authRequest(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown) {
    let req = request(app.getHttpServer())[method](`/api/v1${path}`);
    if (body !== undefined) {
      req = req.send(body as string | object);
    }
    return req.set('Authorization', 'Bearer valid-token');
  }

  describe('authentication', () => {
    it('rejects unauthenticated requests with 401 on every media route', async () => {
      await request(app.getHttpServer()).post('/api/v1/media').send(Buffer.from('x')).expect(401);
      await request(app.getHttpServer()).get('/api/v1/media/media-1').expect(401);
      await request(app.getHttpServer()).delete('/api/v1/media/media-1').expect(401);
    });
  });

  describe('tenant resolution', () => {
    it('fails closed (403) when the client selects a store without membership', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/media/media-1')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-2')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('create / upload (POST /media)', () => {
    it('uploads a raw binary image: returns the metadata + storage reference and stores the object', async () => {
      const mediaCount = db.media.length;

      const res = await request(app.getHttpServer())
        .post('/api/v1/media?altText=Front%20view')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('PNGDATA'))
        .expect(201);

      expect(res.body.data).toMatchObject({
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 7,
        altText: 'Front view',
      });
      // Tenant-prefixed storage reference: {store_id}/{media_id}.
      const storagePath = res.body.data.storagePath as string;
      expect(storagePath).toMatch(/^store-1\/[0-9a-f-]{36}$/);

      // The binary is actually stored at the reference path (in-memory provider).
      expect(objects.get(storagePath)?.equals(Buffer.from('PNGDATA'))).toBe(true);

      // The metadata row was created.
      expect(db.media).toHaveLength(mediaCount + 1);
      expect(db.media.some((m) => m.id === res.body.data.id && m.storagePath === storagePath)).toBe(
        true,
      );

      // No internal tenant columns leak into the response.
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('storeId');
      expect(serialized).not.toContain('createdAt');
    });

    it('classifies video/* uploads as VIDEO', async () => {
      const res = await authRequest('post', '/media')
        .set('Content-Type', 'video/mp4')
        .send(Buffer.from('MP4DATA'))
        .expect(201);

      expect(res.body.data.mediaType).toBe('VIDEO');
    });

    it('classifies non-image/video uploads (e.g. application/pdf) as FILE', async () => {
      const res = await authRequest('post', '/media')
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('%PDF-1.4'))
        .expect(201);

      expect(res.body.data.mediaType).toBe('FILE');
    });

    it('rejects an empty binary body (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('post', '/media')
        .set('Content-Type', 'image/png')
        .send(Buffer.alloc(0))
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a JSON body: a parsed JSON payload is not a raw media binary (400)', async () => {
      const res = await authRequest('post', '/media').send({ name: 'not-a-file' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an oversized alt text (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('post', `/media?altText=${'a'.repeat(1001)}`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('x'))
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown query parameters (forbidNonWhitelisted)', async () => {
      const res = await authRequest('post', '/media?forged=purpose')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('x'))
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('get (GET /media/:mediaId)', () => {
    it('returns the stored media metadata and storage reference', async () => {
      const res = await authRequest('get', '/media/media-1').expect(200);

      expect(res.body.data).toMatchObject({
        id: 'media-1',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 100,
        altText: 'Referenced image',
        storagePath: 'store-1/media-1',
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('storeId');
    });

    it('fails closed with 404 for an unknown media id (no existence leak)', async () => {
      const res = await authRequest('get', '/media/media-999').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('never returns another store media: a cross-tenant id resolves to 404', async () => {
      const res = await authRequest('get', '/media/media-foreign').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('delete (DELETE /media/:mediaId)', () => {
    it('physically deletes unreferenced media: row + storage object are removed (204)', async () => {
      objects.set('store-1/media-unreferenced', Buffer.from('PNG'));

      await authRequest('delete', '/media/media-unreferenced').expect(204);

      expect(db.media.some((m) => m.id === 'media-unreferenced')).toBe(false);
      expect(objects.has('store-1/media-unreferenced')).toBe(false);
    });

    it('refuses to delete product-referenced media (409 CONFLICT); row + object retained', async () => {
      objects.set('store-1/media-1', Buffer.from('PNG'));

      const res = await authRequest('delete', '/media/media-1').expect(409);
      expect(res.body.error.code).toBe('CONFLICT');

      expect(db.media.some((m) => m.id === 'media-1')).toBe(true);
      expect(objects.has('store-1/media-1')).toBe(true);
    });

    it('fails closed with 404 for a cross-tenant media id and never touches storage', async () => {
      objects.set('store-2/media-foreign', Buffer.from('PDF'));

      const res = await authRequest('delete', '/media/media-foreign').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      expect(db.media.some((m) => m.id === 'media-foreign')).toBe(true);
      expect(objects.has('store-2/media-foreign')).toBe(true);
    });

    it('fails closed with 404 when deleting an already-deleted media id', async () => {
      const res = await authRequest('delete', '/media/media-unreferenced').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('CMS integration (theme logo reference)', () => {
    it('references an uploaded media as the store logo and clears the logo on media delete (SET NULL)', async () => {
      // Upload a fresh media asset.
      const upload = await request(app.getHttpServer())
        .post('/api/v1/media')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('LOGO'))
        .expect(201);
      const mediaId = upload.body.data.id as string;
      const storagePath = upload.body.data.storagePath as string;

      // Reference it via the theme (Phase 12 integration — store-scoped).
      const theme = await authRequest('put', '/theme', { logoMediaId: mediaId }).expect(200);
      expect(theme.body.data.logoMediaId).toBe(mediaId);

      // Deleting the media is allowed when only the logo references it:
      // the DB FK clears the logo (ON DELETE SET NULL).
      await authRequest('delete', `/media/${mediaId}`).expect(204);
      expect(db.media.some((m) => m.id === mediaId)).toBe(false);
      expect(objects.has(storagePath)).toBe(false);

      const after = await authRequest('get', '/theme').expect(200);
      expect(after.body.data.logoMediaId).toBeNull();
    });
  });
});
