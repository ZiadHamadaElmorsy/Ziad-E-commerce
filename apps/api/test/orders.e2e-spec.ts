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
 * End-to-end coverage of PHASE 8 — Orders.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard), the
 * real TenantContextService, TransactionService, RlsTenantBinder,
 * InventoryReservationService and the real OrdersService are exercised
 * end-to-end against a stubbed PrismaService. Supabase and PostgreSQL are NOT
 * contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution (403) for the Order API
 *   - list orders (200 + pagination meta + documented filters)
 *   - get order (200 full detail from purchase-time snapshots; 404 missing)
 *   - update order status (200 documented transitions; 409 STATE_TRANSITION
 *     for illegal / skipped / backward / terminal-state transitions)
 *   - cancellation releases ACTIVE reservations + writes the order.cancelled
 *     audit row in the same transaction
 *   - request validation (400 VALIDATION_ERROR)
 *
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS/guarded concurrency) are NOT
 * claimed here — they live in the blocked database suite.
 */
describe('Orders (e2e)', () => {
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

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'customer-1',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 0n,
    taxTotal: 0n,
    grandTotal: 1000n,
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    shippingAddressSnapshot: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
    billingAddressSnapshot: null,
    idempotencyKey: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  const confirmedOrderRow = {
    ...orderRow,
    status: OrderStatus.CONFIRMED,
    confirmedAt: new Date('2026-08-12T10:00:00Z'),
  };

  const orderItemRow = {
    id: 'oi-1',
    orderId: 'order-1',
    productId: 'product-1',
    variantId: 'variant-1',
    productNameSnapshot: 'Classic T-Shirt',
    variantNameSnapshot: 'Classic T-Shirt',
    skuSnapshot: 'TS-BLK-M',
    unitPrice: 500n,
    quantity: 2,
    lineTotal: 1000n,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  const reservationRow = {
    id: 'res-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    cartId: 'cart-1',
    orderId: 'order-1',
    quantity: 2,
    status: 'ACTIVE',
    expiresAt: null,
    releasedAt: null,
    consumedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const inventoryRow = {
    id: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    onHandQuantity: 10,
    reservedQuantity: 2,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const userRow = {
    id: 'user-1',
    authUserId: 'auth-user-1',
    firstName: 'Owner',
    lastName: 'User',
    email: 'owner@example.com',
    phone: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const orderWithDetails = { ...orderRow, items: [orderItemRow], reservations: [reservationRow] };

  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  const txExecuteRaw = jest.fn();
  const txOrderFindFirst = jest.fn();
  const txOrderUpdateMany = jest.fn();
  const txReservationFindMany = jest.fn();
  const txReservationUpdateMany = jest.fn();
  const txInventoryFindUnique = jest.fn();
  const txMovementCreate = jest.fn();
  const txUserFindUnique = jest.fn();
  const txAuditLogCreate = jest.fn();

  const txClient = {
    $executeRaw: txExecuteRaw,
    order: { findFirst: txOrderFindFirst, updateMany: txOrderUpdateMany },
    inventoryReservation: { findMany: txReservationFindMany, updateMany: txReservationUpdateMany },
    inventory: { findUnique: txInventoryFindUnique },
    inventoryMovement: { create: txMovementCreate },
    user: { findUnique: txUserFindUnique },
    auditLog: { create: txAuditLogCreate },
  };

  // Shared Prisma reads used by repositories and the real TenantContextService.
  const prismaOrderFindFirst = jest.fn();
  const prismaOrderFindMany = jest.fn();
  const prismaOrderCount = jest.fn();

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
    order: {
      findFirst: prismaOrderFindFirst,
      findMany: prismaOrderFindMany,
      count: prismaOrderCount,
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
    txExecuteRaw.mockReset();
    txOrderFindFirst.mockReset();
    txOrderUpdateMany.mockReset();
    txReservationFindMany.mockReset();
    txReservationUpdateMany.mockReset();
    txInventoryFindUnique.mockReset();
    txMovementCreate.mockReset();
    txUserFindUnique.mockReset();
    txAuditLogCreate.mockReset();
    prismaOrderFindFirst.mockReset();
    prismaOrderFindMany.mockReset();
    prismaOrderCount.mockReset();

    // RLS binder (bind + reset) defaults.
    txExecuteRaw.mockResolvedValue(1);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function getOrders(overrides: { token?: string; storeId?: string; query?: string }) {
    let req = request(app.getHttpServer()).get(`/api/v1/orders${overrides.query ?? ''}`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    return req;
  }

  function getOrder(orderId: string, overrides: { token?: string; storeId?: string } = {}) {
    let req = request(app.getHttpServer()).get(`/api/v1/orders/${orderId}`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    return req;
  }

  function patchOrderStatus(
    orderId: string,
    overrides: { token?: string; storeId?: string; body?: unknown },
  ) {
    let req = request(app.getHttpServer()).patch(`/api/v1/orders/${orderId}/status`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    return req.send(overrides.body ?? { status: 'PROCESSING' });
  }

  describe('authentication boundary', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant isolation', () => {
    it('rejects a client-supplied store of another tenant (403 FORBIDDEN)', async () => {
      const res = await getOrders({ token: 'valid-token', storeId: 'store-b' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(prismaOrderFindMany).not.toHaveBeenCalled();
    });

    it('a foreign-store order id fails closed with 404 NOT_FOUND (no existence leak)', async () => {
      prismaOrderFindFirst.mockResolvedValue(null);

      const res = await getOrder('order-foreign', { token: 'valid-token' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('list orders', () => {
    it('returns the documented collection contract (data + meta) store-scoped', async () => {
      prismaOrderFindMany.mockResolvedValue([orderRow]);
      prismaOrderCount.mockResolvedValue(1);

      const res = await getOrders({ token: 'valid-token' }).expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: OrderStatus.PENDING,
        currency: 'EGP',
        grandTotal: 1000,
      });
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(prismaOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ storeId: 'store-1' }) }),
      );
    });

    it('applies the documented status filter', async () => {
      prismaOrderFindMany.mockResolvedValue([orderRow]);
      prismaOrderCount.mockResolvedValue(1);

      const res = await getOrders({
        token: 'valid-token',
        query: `?status=${OrderStatus.PENDING}`,
      }).expect(200);

      expect(prismaOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ storeId: 'store-1', status: OrderStatus.PENDING }),
        }),
      );
      expect(res.body.data).toHaveLength(1);
    });

    it('rejects a limit above the documented maximum (400 VALIDATION_ERROR)', async () => {
      const res = await getOrders({ token: 'valid-token', query: '?limit=101' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('get order', () => {
    it('returns the full detail built from purchase-time snapshots', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);

      const res = await getOrder('order-1', { token: 'valid-token' }).expect(200);

      expect(prismaOrderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', storeId: 'store-1' } }),
      );
      expect(res.body.data).toMatchObject({
        id: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: OrderStatus.PENDING,
        customerEmail: 'ahmed@example.com',
        shippingAddress: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
        items: [
          {
            id: 'oi-1',
            productName: 'Classic T-Shirt',
            variantName: 'Classic T-Shirt',
            sku: 'TS-BLK-M',
            unitPrice: 500,
            quantity: 2,
            lineTotal: 1000,
          },
        ],
      });
    });

    it('returns 404 for a missing order', async () => {
      prismaOrderFindFirst.mockResolvedValue(null);

      const res = await getOrder('order-missing', { token: 'valid-token' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('update order status', () => {
    it('applies a documented transition (CONFIRMED -> PROCESSING) and audits it', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(confirmedOrderRow);
      txOrderUpdateMany.mockResolvedValue({ count: 1 });
      txUserFindUnique.mockResolvedValue(userRow);
      txAuditLogCreate.mockResolvedValue({ id: 'audit-1' });
      txOrderFindFirst.mockResolvedValue({
        ...confirmedOrderRow,
        status: OrderStatus.PROCESSING,
        items: [orderItemRow],
        reservations: [reservationRow],
      });

      const res = await patchOrderStatus('order-1', { token: 'valid-token' }).expect(200);

      expect(txOrderUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'order-1',
            storeId: 'store-1',
            status: OrderStatus.CONFIRMED,
          },
          data: { status: OrderStatus.PROCESSING },
        }),
      );
      expect(txAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'store-1',
            userId: 'user-1',
            action: 'order.status_changed',
            entityType: 'order',
            entityId: 'order-1',
          }),
        }),
      );
      // No reservation release for a non-cancellation transition.
      expect(txReservationFindMany).not.toHaveBeenCalled();
      expect(res.body.data.status).toBe(OrderStatus.PROCESSING);
    });

    it('cancels from PENDING: releases ACTIVE reservations and writes order.cancelled', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(orderRow);
      txOrderUpdateMany.mockResolvedValue({ count: 1 });
      txReservationFindMany.mockResolvedValue([reservationRow]);
      txReservationUpdateMany.mockResolvedValue({ count: 1 });
      txInventoryFindUnique.mockResolvedValue(inventoryRow);
      txMovementCreate.mockResolvedValue({ id: 'mov-1' });
      txUserFindUnique.mockResolvedValue(userRow);
      txAuditLogCreate.mockResolvedValue({ id: 'audit-1' });
      txOrderFindFirst.mockResolvedValue({
        ...orderRow,
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date('2026-08-13T10:00:00Z'),
        items: [orderItemRow],
        reservations: [{ ...reservationRow, status: 'RELEASED', releasedAt: new Date() }],
      });

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.CANCELLED },
      }).expect(200);

      expect(txReservationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: 'store-1', orderId: 'order-1', status: 'ACTIVE' },
        }),
      );
      expect(txReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'res-1', storeId: 'store-1', status: 'ACTIVE' },
          data: expect.objectContaining({ status: 'RELEASED' }),
        }),
      );
      expect(txAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'order.cancelled', userId: 'user-1' }),
        }),
      );
      expect(res.body.data.status).toBe(OrderStatus.CANCELLED);
    });

    it('rejects an illegal lifecycle transition with 409 STATE_TRANSITION', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(orderRow);

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.PROCESSING },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });

    it('rejects a backward transition with 409 STATE_TRANSITION', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce({
        ...confirmedOrderRow,
        status: OrderStatus.SHIPPED,
      });

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.PROCESSING },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('protects the CANCELLED terminal state', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce({
        ...orderRow,
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date('2026-08-12T00:00:00Z'),
      });

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.PENDING },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing order', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(null);

      const res = await patchOrderStatus('order-missing', {
        token: 'valid-token',
        body: { status: OrderStatus.CONFIRMED },
      }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('rejects an invalid status value with 400 VALIDATION_ERROR', async () => {
      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: 'PAID' },
      }).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a guarded update that affects zero rows with 409 STATE_TRANSITION', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(confirmedOrderRow);
      txOrderUpdateMany.mockResolvedValue({ count: 0 });

      const res = await patchOrderStatus('order-1', { token: 'valid-token' }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });
  });
});
