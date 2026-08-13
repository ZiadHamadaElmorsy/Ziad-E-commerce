import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, MembershipStatus, PageStatus, StoreStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';

/**
 * End-to-end coverage of PHASE 12 — CMS (Pages / Sections / Navigation /
 * Theme).
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard) and the
 * real TenantContextService are exercised end-to-end against a stateful
 * stubbed PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - unauthenticated access (401) on every CMS route
 *   - tenant resolution from the ACTIVE membership; cross-store access fails
 *   - Pages: list/create/get/update/archive + publish/unpublish via PATCH
 *     status + store-scoped slug + lifecycle guards + validation
 *   - Sections: add/update/delete/reorder + defined order + validation
 *   - Navigation: GET/PUT singleton + default materialization + audit
 *   - Theme: GET/PUT + default materialization + logo reference validation
 *     + audit
 *   - error taxonomy through the API envelope; no internal field leaks
 *
 * DB-level guarantees (RLS tenant isolation, FK/unique constraints, guarded
 * transition concurrency) are NOT claimed here — they live in the blocked
 * database suite.
 */
describe('CMS (e2e)', () => {
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
  type DbPage = {
    id: string;
    storeId: string;
    title: string;
    slug: string;
    status: PageStatus;
    seoTitle: string | null;
    seoDescription: string | null;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  };

  type DbSection = {
    id: string;
    storeId: string;
    pageId: string;
    sectionType: string;
    content: Record<string, unknown>;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  };

  type DbNavigation = {
    id: string;
    storeId: string;
    name: string;
    items: unknown[];
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
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

  type DbMedia = {
    id: string;
    storeId: string;
    [key: string]: unknown;
  };

  type DbAudit = {
    id: string;
    storeId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    [key: string]: unknown;
  };

  const db: {
    pages: DbPage[];
    sections: DbSection[];
    navigations: DbNavigation[];
    themes: DbTheme[];
    media: DbMedia[];
    auditLogs: DbAudit[];
  } = {
    pages: [
      {
        id: 'page-1',
        storeId: 'store-1',
        title: 'About',
        slug: 'about',
        status: PageStatus.PUBLISHED,
        seoTitle: 'About My Store',
        seoDescription: 'Learn about My Store',
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
      {
        id: 'page-2',
        storeId: 'store-1',
        title: 'Draft Page',
        slug: 'draft-page',
        status: PageStatus.DRAFT,
        seoTitle: null,
        seoDescription: null,
        createdAt: new Date('2026-08-12T01:00:00Z'),
        updatedAt: new Date('2026-08-12T01:00:00Z'),
      },
      {
        id: 'page-foreign',
        storeId: 'store-2',
        title: 'Foreign',
        slug: 'foreign',
        status: PageStatus.DRAFT,
        seoTitle: null,
        seoDescription: null,
        createdAt: new Date('2026-08-12T02:00:00Z'),
        updatedAt: new Date('2026-08-12T02:00:00Z'),
      },
    ],
    sections: [
      {
        id: 'section-1',
        storeId: 'store-1',
        pageId: 'page-1',
        sectionType: 'hero',
        content: { title: 'Welcome' },
        sortOrder: 0,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
      {
        id: 'section-2',
        storeId: 'store-1',
        pageId: 'page-1',
        sectionType: 'text',
        content: { body: 'Hello' },
        sortOrder: 1,
        createdAt: new Date('2026-08-12T00:00:00Z'),
        updatedAt: new Date('2026-08-12T00:00:00Z'),
      },
    ],
    navigations: [],
    themes: [],
    media: [
      {
        id: 'media-1',
        storeId: 'store-1',
        storagePath: 'logos/store-1.png',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 100n,
        altText: null,
        createdAt: new Date('2026-08-12T00:00:00Z'),
      },
    ],
    auditLogs: [],
  };

  function pageWithSections(page: { id: string; storeId: string }) {
    return {
      ...page,
      sections: db.sections
        .filter((s) => s.storeId === page.storeId && s.pageId === page.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

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
    user: { findUnique: jest.fn() },
    page: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    pageSection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    navigation: { findFirst: jest.fn() },
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

    // Audit actor resolution.
    txClient.user = {
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { authUserId: string } }) => {
          return where.authUserId === 'auth-user-1' ? userRow : null;
        }),
    };

    // RLS tenant binder runs inside every tenant-bound transaction.
    txClient.$executeRaw = jest.fn().mockResolvedValue(undefined);

    // --- pages ------------------------------------------------------------
    txClient.page = {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'page-new',
          seoTitle: null,
          seoDescription: null,
          status: PageStatus.DRAFT,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        db.pages.push(row as DbPage);
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
            for (const page of db.pages) {
              const matches =
                (where.id === undefined || page.id === where.id) &&
                (where.storeId === undefined || page.storeId === where.storeId) &&
                (where.status === undefined || page.status === where.status);
              if (matches) {
                Object.assign(page, data, { updatedAt: new Date() });
                affected += 1;
              }
            }
            return { count: affected };
          },
        ),
      findFirst: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { storeId: string; slug: string } }) => {
          const page = db.pages.find((p) => p.storeId === where.storeId && p.slug === where.slug);
          return page ? { id: page.id } : null;
        }),
    };

    prismaServiceStub.page.findUnique.mockImplementation(
      async ({ where }: { where: { storeId_id: { storeId: string; id: string } } }) => {
        const page = db.pages.find(
          (p) => p.storeId === where.storeId_id.storeId && p.id === where.storeId_id.id,
        );
        return page ? pageWithSections(page) : null;
      },
    );

    prismaServiceStub.page.findMany.mockImplementation(
      async ({
        where,
        skip,
        take,
      }: {
        where: { storeId: string };
        skip?: number;
        take?: number;
      }) => {
        return db.pages
          .filter((p) => p.storeId === where.storeId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip ?? 0, (skip ?? 0) + (take ?? 20))
          .map(pageWithSections);
      },
    );

    prismaServiceStub.page.count.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        db.pages.filter((p) => p.storeId === where.storeId).length,
    );

    // --- page sections -----------------------------------------------------
    txClient.pageSection = {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'section-new',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        db.sections.push(row as DbSection);
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
            for (const section of db.sections) {
              const matches =
                (where.id === undefined || section.id === where.id) &&
                (where.storeId === undefined || section.storeId === where.storeId) &&
                (where.pageId === undefined || section.pageId === where.pageId);
              if (matches) {
                const sortOrder = data.sortOrder;
                if (sortOrder && typeof sortOrder === 'object' && 'increment' in sortOrder) {
                  section.sortOrder += (sortOrder as { increment: number }).increment;
                } else if (sortOrder !== undefined) {
                  section.sortOrder = sortOrder as number;
                }
                if (data.sectionType !== undefined) {
                  section.sectionType = data.sectionType as string;
                }
                if (data.content !== undefined) {
                  section.content = data.content as Record<string, unknown>;
                }
                section.updatedAt = new Date();
                affected += 1;
              }
            }
            return { count: affected };
          },
        ),
      deleteMany: jest
        .fn()
        .mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          const before = db.sections.length;
          db.sections = db.sections.filter(
            (s) =>
              !(
                (where.id === undefined || s.id === where.id) &&
                (where.storeId === undefined || s.storeId === where.storeId) &&
                (where.pageId === undefined || s.pageId === where.pageId)
              ),
          );
          return { count: before - db.sections.length };
        }),
    };

    prismaServiceStub.pageSection.findMany.mockImplementation(
      async ({ where }: { where: { storeId: string; pageId: string } }) =>
        db.sections
          .filter((s) => s.storeId === where.storeId && s.pageId === where.pageId)
          .sort((a, b) => a.sortOrder - b.sortOrder),
    );

    prismaServiceStub.pageSection.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; storeId: string; pageId: string } }) =>
        db.sections.find(
          (s) => s.id === where.id && s.storeId === where.storeId && s.pageId === where.pageId,
        ) ?? null,
    );

    // --- navigation ---------------------------------------------------------
    prismaServiceStub.navigation.findFirst.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        db.navigations.find((n) => n.storeId === where.storeId) ?? null,
    );
    txClient.navigation = {
      findFirst: prismaServiceStub.navigation.findFirst,
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'nav-new',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        db.navigations.push(row as DbNavigation);
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
            for (const navigation of db.navigations) {
              const matches =
                (where.id === undefined || navigation.id === where.id) &&
                (where.storeId === undefined || navigation.storeId === where.storeId);
              if (matches) {
                Object.assign(navigation, data, { updatedAt: new Date() });
                affected += 1;
              }
            }
            return { count: affected };
          },
        ),
    };

    // --- theme ---------------------------------------------------------------
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

    // --- media + audit --------------------------------------------------------
    txClient.media = {
      findFirst: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { id: string; storeId: string } }) =>
            db.media.find((m) => m.id === where.id && m.storeId === where.storeId) ?? null,
        ),
    };

    txClient.auditLog = {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'audit-new', ...data };
        db.auditLogs.push(row as DbAudit);
        return { id: row.id };
      }),
    };

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

  function authRequest(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) {
    let req = request(app.getHttpServer())[method](`/api/v1${path}`);
    if (body !== undefined) {
      req = req.send(body);
    }
    return req.set('Authorization', 'Bearer valid-token');
  }
  describe('authentication', () => {
    it('rejects unauthenticated requests with 401 on every CMS route', async () => {
      await request(app.getHttpServer()).get('/api/v1/pages').expect(401);
      await request(app.getHttpServer()).get('/api/v1/navigation').expect(401);
      await request(app.getHttpServer()).get('/api/v1/theme').expect(401);
      await request(app.getHttpServer()).post('/api/v1/pages').send({ title: 'X' }).expect(401);
      await request(app.getHttpServer())
        .put('/api/v1/navigation')
        .send({ name: 'Main', items: [] })
        .expect(401);
      await request(app.getHttpServer())
        .put('/api/v1/theme')
        .send({ primaryColor: '#000000' })
        .expect(401);
    });
  });

  describe('Pages', () => {
    it('lists the store-scoped pages with pagination metadata', async () => {
      const res = await authRequest('get', '/pages').expect(200);

      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['page-2', 'page-1']);
      // No internal columns leak.
      expect(JSON.stringify(res.body)).not.toContain('storeId');
    });

    it('creates a DRAFT page with a slug generated from the title', async () => {
      const res = await authRequest('post', '/pages', { title: 'Contact Us' }).expect(201);

      expect(res.body.data).toMatchObject({
        id: 'page-new',
        title: 'Contact Us',
        slug: 'contact-us',
        status: 'DRAFT',
        seoTitle: null,
        seoDescription: null,
        sections: [],
      });
    });

    it('resolves store-scoped slug collisions with a -2 suffix', async () => {
      const res = await authRequest('post', '/pages', { title: 'About' }).expect(201);

      expect(res.body.data.slug).toBe('about-2');
    });

    it('returns a page with its sections in defined order', async () => {
      const res = await authRequest('get', '/pages/page-1').expect(200);

      expect(res.body.data).toMatchObject({
        id: 'page-1',
        title: 'About',
        slug: 'about',
        status: 'PUBLISHED',
        seoTitle: 'About My Store',
        seoDescription: 'Learn about My Store',
      });
      expect(res.body.data.sections).toEqual([
        expect.objectContaining({ id: 'section-1', sortOrder: 0 }),
        expect.objectContaining({ id: 'section-2', sortOrder: 1 }),
      ]);
    });

    it('fails closed with 404 for a page outside the store', async () => {
      const res = await authRequest('get', '/pages/page-foreign').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('updates page fields', async () => {
      const res = await authRequest('patch', '/pages/page-2', {
        title: 'Renamed Draft',
        seoTitle: 'SEO',
      }).expect(200);

      expect(res.body.data).toMatchObject({
        id: 'page-2',
        title: 'Renamed Draft',
        seoTitle: 'SEO',
      });
      // Slug is stable after creation (never rewritten by a rename).
      expect(res.body.data.slug).toBe('draft-page');
    });

    it('publishes a DRAFT page via PATCH status', async () => {
      const res = await authRequest('patch', '/pages/page-2', { status: 'PUBLISHED' }).expect(200);
      expect(res.body.data.status).toBe('PUBLISHED');
    });

    it('unpublishes a PUBLISHED page via PATCH status', async () => {
      const res = await authRequest('patch', '/pages/page-1', { status: 'DRAFT' }).expect(200);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('rejects ARCHIVED status through PATCH (dedicated archive endpoint)', async () => {
      const res = await authRequest('patch', '/pages/page-1', { status: 'ARCHIVED' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown body fields (forbidNonWhitelisted)', async () => {
      const res = await authRequest('post', '/pages', { title: 'X', slug: 'forged' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('archives a page', async () => {
      const res = await authRequest('post', '/pages/page-2/archive').expect(200);
      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('rejects archiving an already-archived page (409 STATE_TRANSITION)', async () => {
      const res = await authRequest('post', '/pages/page-2/archive').expect(409);
      expect(res.body.error.code).toBe('STATE_TRANSITION');
    });

    it('rejects an out-of-range limit (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('get', '/pages?limit=500').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Page Sections', () => {
    it('adds a section at the given position (shift keeps the order dense)', async () => {
      const res = await authRequest('post', '/pages/page-1/sections', {
        type: 'HERO',
        position: 0,
        content: { title: 'New Hero' },
      }).expect(201);

      expect(res.body.data).toMatchObject({
        id: 'section-new',
        sectionType: 'hero',
        sortOrder: 0,
        content: { title: 'New Hero' },
      });

      const page = await authRequest('get', '/pages/page-1').expect(200);
      expect(page.body.data.sections.map((s: { id: string }) => s.id)).toEqual([
        'section-new',
        'section-1',
        'section-2',
      ]);
    });

    it('rejects an unknown section type (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('post', '/pages/page-1/sections', {
        type: 'VIDEO',
        position: 0,
        content: {},
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-object section content (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('post', '/pages/page-1/sections', {
        type: 'TEXT',
        position: 0,
        content: 'plain-text',
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('updates a section (type + content + position)', async () => {
      const res = await authRequest('patch', '/pages/page-1/sections/section-2', {
        type: 'TEXT',
        content: { body: 'Updated body' },
        position: 0,
      }).expect(200);

      expect(res.body.data).toMatchObject({ id: 'section-2', sectionType: 'text' });
      expect(res.body.data.sortOrder).toBe(0);
    });

    it('fails with 404 when the section is not in the page', async () => {
      const res = await authRequest('patch', '/pages/page-1/sections/section-999', {
        content: {},
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes a section (204) and fails with 404 on repeat', async () => {
      await authRequest('delete', '/pages/page-1/sections/section-2').expect(204);
      await authRequest('delete', '/pages/page-1/sections/section-2').expect(404);
    });

    it('reorders the full section list', async () => {
      const res = await authRequest('post', '/pages/page-1/sections/reorder', {
        sectionIds: ['section-1', 'section-new'],
      }).expect(200);

      expect(res.body.data.map((s: { id: string }) => s.id)).toEqual(['section-1', 'section-new']);
    });

    it('rejects a reorder that does not cover every section', async () => {
      const res = await authRequest('post', '/pages/page-1/sections/reorder', {
        sectionIds: ['section-1'],
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails with 404 when the page does not exist', async () => {
      const res = await authRequest('post', '/pages/page-999/sections', {
        type: 'TEXT',
        content: {},
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
  describe('Navigation', () => {
    it('materializes a default navigation on first GET (get-or-create)', async () => {
      const res = await authRequest('get', '/navigation').expect(200);

      expect(res.body.data).toMatchObject({ id: 'nav-new', name: 'Main', items: [] });
    });

    it('replaces the navigation via PUT and audits the change', async () => {
      const auditCount = db.auditLogs.length;

      const res = await authRequest('put', '/navigation', {
        name: 'Main',
        items: [
          { label: 'About', type: 'PAGE', value: 'page-1' },
          { label: 'T-Shirts', type: 'CATEGORY', value: 'category-1' },
          { label: 'Contact', type: 'DESTINATION', value: 'contact' },
        ],
      }).expect(200);

      expect(res.body.data).toMatchObject({ name: 'Main' });
      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items[0]).toEqual({ label: 'About', type: 'PAGE', value: 'page-1' });

      expect(db.auditLogs).toHaveLength(auditCount + 1);
      expect(db.auditLogs[db.auditLogs.length - 1].action).toBe('navigation.updated');
    });

    it('returns the stored navigation on GET', async () => {
      const res = await authRequest('get', '/navigation').expect(200);
      expect(res.body.data.items).toHaveLength(3);
    });

    it('rejects malformed navigation items (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('put', '/navigation', {
        name: 'Main',
        items: [{ label: 'X', type: 'PRODUCT', value: 'p' }],
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Theme', () => {
    it('materializes a default theme on first GET (get-or-create)', async () => {
      const res = await authRequest('get', '/theme').expect(200);

      expect(res.body.data).toMatchObject({ id: 'theme-new', logoMediaId: null, config: {} });
    });

    it('updates the theme config via PUT and audits the change', async () => {
      const auditCount = db.auditLogs.length;

      const res = await authRequest('put', '/theme', {
        primaryColor: '#000000',
        fontFamily: 'Inter',
      }).expect(200);

      expect(res.body.data.config).toEqual({ primaryColor: '#000000', fontFamily: 'Inter' });
      expect(db.auditLogs).toHaveLength(auditCount + 1);
      expect(db.auditLogs[db.auditLogs.length - 1].action).toBe('theme.updated');
    });

    it('returns the stored theme on GET', async () => {
      const res = await authRequest('get', '/theme').expect(200);
      expect(res.body.data.config).toEqual({ primaryColor: '#000000', fontFamily: 'Inter' });
    });

    it('rejects an invalid hex primaryColor (400 VALIDATION_ERROR)', async () => {
      const res = await authRequest('put', '/theme', { primaryColor: 'red' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a logo reference that is not in the store (404)', async () => {
      const res = await authRequest('put', '/theme', { logoMediaId: 'media-999' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('accepts an in-store logo reference', async () => {
      const res = await authRequest('put', '/theme', { logoMediaId: 'media-1' }).expect(200);
      expect(res.body.data.logoMediaId).toBe('media-1');
    });
  });

  describe('tenant isolation', () => {
    it('fails closed (403) when the client selects a store without membership', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pages')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-2')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('never returns another store page (404, no existence leak)', async () => {
      const res = await authRequest('get', '/pages/page-foreign').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
