import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 4 — Inventory.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard), the
 * real TenantContextService, TransactionService and RlsTenantBinder are
 * exercised end-to-end against a stubbed PrismaService. Supabase and
 * PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution for every endpoint
 *   - GET  /variants/:variantId/inventory       (read + derived available)
 *   - POST /variants/:variantId/inventory/adjust (INITIAL_STOCK creation,
 *     guarded ADJUSTMENT, insufficient inventory, atomic movement write)
 *   - GET  /variants/:variantId/inventory/movements (paginated envelope)
 *   - tenant isolation (client-supplied X-Store-Id is never an auth source)
 *   - validation (400 VALIDATION_ERROR), variant ownership (404),
 *     insufficient inventory (409 INSUFFICIENT_INVENTORY)
 *
 * The reservation lifecycle (reserve/consume/release/expiration) is NOT
 * exposed through HTTP in this phase (docs/API-SPEC.md §19 defines no
 * reservation endpoints) and is covered by the service unit tests.
 */
describe('Inventory (e2e)', () => {
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

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Classic T-Shirt',
    sku: null,
    price: 0n,
    compareAtPrice: null,
    costPrice: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const inventoryRow = {
    id: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    onHandQuantity: 10,
    reservedQuantity: 3,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const movementRow = {
    id: 'mov-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    movementType: 'INITIAL_STOCK',
    quantity: 10,
    referenceType: 'adjustment',
    referenceId: null,
    reason: 'INITIAL_STOCK',
    onHandAfter: 10,
    reservedAfter: 0,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  const txInventoryFindUnique = jest.fn();
  const txInventoryCreate = jest.fn();
  const txMovementCreate = jest.fn();
  const txExecuteRaw = jest.fn();

  const txClient = {
    inventory: {
      findUnique: txInventoryFindUnique,
      create: txInventoryCreate,
    },
    inventoryMovement: {
      create: txMovementCreate,
    },
    $executeRaw: txExecuteRaw,
  };

  // Shared Prisma reads used by repositories + the real TenantContextService.
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
    productVariant: { findUnique: jest.fn() },
    inventory: { findUnique: jest.fn() },
    inventoryReservation: { findFirst: jest.fn(), findMany: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), count: jest.fn() },
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
    prismaServiceStub.productVariant.findUnique.mockReset();
    prismaServiceStub.inventory.findUnique.mockReset();
    prismaServiceStub.inventoryReservation.findFirst.mockReset();
    prismaServiceStub.inventoryReservation.findMany.mockReset();
    prismaServiceStub.inventoryMovement.findMany.mockReset();
    prismaServiceStub.inventoryMovement.count.mockReset();

    txInventoryFindUnique.mockReset();
    txInventoryCreate.mockReset();
    txMovementCreate.mockReset();
    txExecuteRaw.mockReset();

    // Default: the RLS binder ignores $executeRaw return values and the
    // guarded inventory UPDATEs default to "1 row affected".
    txExecuteRaw.mockResolvedValue(1);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('authentication boundary', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/variants/:variantId/inventory', () => {
    it('returns the derived inventory view (available = on_hand - reserved)', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      prismaServiceStub.inventory.findUnique.mockResolvedValue(inventoryRow);

      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toEqual({
        variantId: 'variant-1',
        onHand: 10,
        reserved: 3,
        available: 7,
      });
    });

    it('returns 404 for a variant outside the current store', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/store-b-variant/inventory')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the inventory row was never initialized', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      prismaServiceStub.inventory.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects a client-supplied store of another tenant (403 FORBIDDEN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/variants/:variantId/inventory/adjust', () => {
    it('creates the inventory row on first adjustment (INITIAL_STOCK) with an atomic movement', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      txInventoryFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(inventoryRow);
      txInventoryCreate.mockResolvedValue({ ...inventoryRow, reservedQuantity: 0 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10, reason: 'INITIAL_STOCK' })
        .expect(200);

      expect(res.body.data).toEqual({
        variantId: 'variant-1',
        onHand: 10,
        reserved: 3,
        available: 7,
      });
      expect(txInventoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 'store-1',
          variantId: 'variant-1',
          onHandQuantity: 10,
        }),
      });
      // The append-only movement carries the post-change snapshot.
      expect(txMovementCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 'store-1',
          variantId: 'variant-1',
          movementType: 'INITIAL_STOCK',
          quantity: 10,
          reason: 'INITIAL_STOCK',
          onHandAfter: 10,
          reservedAfter: 3,
        }),
      });
    });

    it('applies a guarded adjustment on an existing row (ADJUSTMENT movement)', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      txInventoryFindUnique
        .mockResolvedValueOnce(inventoryRow)
        .mockResolvedValueOnce({ ...inventoryRow, onHandQuantity: 15, reservedQuantity: 3 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 5, reason: 'Restock' })
        .expect(200);

      expect(res.body.data).toEqual({
        variantId: 'variant-1',
        onHand: 15,
        reserved: 3,
        available: 12,
      });
      expect(txMovementCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantity: 5,
          reason: 'Restock',
          onHandAfter: 15,
          reservedAfter: 3,
        }),
      });
    });

    it('returns 409 INSUFFICIENT_INVENTORY when the guarded update affects zero rows', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      txInventoryFindUnique.mockResolvedValueOnce(inventoryRow);
      txExecuteRaw.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: -8, reason: 'Damage' })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      expect(txMovementCreate).not.toHaveBeenCalled();
    });

    it('rejects a zero quantity with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 0, reason: 'INITIAL_STOCK' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing reason with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a floating-point quantity with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/variant-1/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10.5, reason: 'INITIAL_STOCK' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a variant outside the current store', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/variants/store-b-variant/inventory/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10, reason: 'INITIAL_STOCK' })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txMovementCreate).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/variants/:variantId/inventory/movements', () => {
    it('returns the paginated movement history with the data/meta envelope', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
      prismaServiceStub.inventoryMovement.findMany.mockResolvedValue([movementRow]);
      prismaServiceStub.inventoryMovement.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory/movements')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        movementType: 'INITIAL_STOCK',
        quantity: 10,
        reason: 'INITIAL_STOCK',
        onHandAfter: 10,
        reservedAfter: 0,
      });
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('rejects a limit above the maximum with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/variant-1/inventory/movements?limit=1000')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a variant outside the current store', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/variants/store-b-variant/inventory/movements')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
