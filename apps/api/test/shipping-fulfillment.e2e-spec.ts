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
 * End-to-end coverage of PHASE 10 — SHIPPING & FULFILLMENT / DELIVERY.
 *
 * The FINAL documents represent shipping/fulfillment/delivery ENTIRELY through
 * the Order lifecycle (docs/DATABASE.md §7.16 — "Fulfillment is represented by
 * order status (PROCESSING -> SHIPPED -> DELIVERED); there is NO separate
 * fulfillment state machine"). There is no shipment/fulfillment/delivery table,
 * entity, state machine, tracking number, carrier or delivery-event model in
 * the MVP (docs/DATABASE.md §31 future extensions; docs/MVP-SCOPE.md §40
 * out-of-scope). The merchant `PATCH /orders/:orderId/status` path reserved by
 * the FINAL documents (docs/IMPLEMENTATION-PHASE9-PAYMENTS.md §27) is the
 * shipping/fulfillment/delivery mechanism, and Phase 8 implemented it.
 *
 * This suite pins the documented shipping/fulfillment/delivery contract end to
 * end through the real guard chain (AuthGuard -> TenantContextGuard ->
 * RolesGuard), real OrdersService/TransactionService/RlsTenantBinder against a
 * stubbed PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - the complete documented fulfillment/delivery chain
 *     PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED over HTTP
 *   - one audit row (order.status_changed) per transition; no order.cancelled
 *   - inventory boundary: SHIPPED/DELIVERED never touch reservations/stock
 *   - payment boundary: SHIPPED/DELIVERED never touch payment records
 *   - US-ORDER-002: order detail exposes shipping information + delivery status
 *   - idempotency: repeated SHIPPED / DELIVERED requests fail closed (409)
 *   - terminal DELIVERED protection and invalid-transition rejection
 *   - tenant isolation (403 foreign store, 404 foreign order) and validation
 *
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS/guarded concurrency/append-only)
 * are NOT claimed here — they live in the blocked database suite
 * `shipping-fulfillment-database-tests.blocked.e2e-spec.ts`.
 */
describe('Shipping & Fulfillment / Delivery (e2e)', () => {
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

  const baseOrderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'customer-1',
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 3500n,
    taxTotal: 0n,
    grandTotal: 4500n,
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
    status: 'CONSUMED',
    expiresAt: null,
    releasedAt: null,
    consumedAt: new Date('2026-08-12T10:00:00Z'),
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T10:00:00Z'),
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

  const pendingOrderRow = {
    ...baseOrderRow,
    status: OrderStatus.PENDING,
    items: [orderItemRow],
    reservations: [reservationRow],
  };
  const confirmedOrderRow = {
    ...pendingOrderRow,
    status: OrderStatus.CONFIRMED,
    confirmedAt: new Date('2026-08-12T10:00:00Z'),
  };
  const processingOrderRow = {
    ...confirmedOrderRow,
    status: OrderStatus.PROCESSING,
  };
  const shippedOrderRow = {
    ...processingOrderRow,
    status: OrderStatus.SHIPPED,
  };
  const deliveredOrderRow = {
    ...shippedOrderRow,
    status: OrderStatus.DELIVERED,
  };

  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  // Payment delegates are stubbed only to prove the payment boundary.
  const txExecuteRaw = jest.fn();
  const txOrderFindFirst = jest.fn();
  const txOrderUpdateMany = jest.fn();
  const txReservationFindMany = jest.fn();
  const txReservationUpdateMany = jest.fn();
  const txInventoryFindUnique = jest.fn();
  const txMovementCreate = jest.fn();
  const txUserFindUnique = jest.fn();
  const txAuditLogCreate = jest.fn();
  const txPaymentCreate = jest.fn();
  const txPaymentUpdateMany = jest.fn();

  const txClient = {
    $executeRaw: txExecuteRaw,
    order: { findFirst: txOrderFindFirst, updateMany: txOrderUpdateMany },
    inventoryReservation: { findMany: txReservationFindMany, updateMany: txReservationUpdateMany },
    inventory: { findUnique: txInventoryFindUnique },
    inventoryMovement: { create: txMovementCreate },
    user: { findUnique: txUserFindUnique },
    auditLog: { create: txAuditLogCreate },
    payment: { create: txPaymentCreate, updateMany: txPaymentUpdateMany },
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

  afterAll(async () => {
    await app.close();
  });

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
    return req.send(overrides.body ?? { status: OrderStatus.PROCESSING });
  }

  function getOrder(orderId: string, overrides: { token?: string } = {}) {
    let req = request(app.getHttpServer()).get(`/api/v1/orders/${orderId}`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    return req;
  }

  beforeEach(() => {
    jest.clearAllMocks();
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
    txOrderUpdateMany.mockResolvedValue({ count: 1 });
    txUserFindUnique.mockResolvedValue(userRow);
    txAuditLogCreate.mockResolvedValue({ id: 'audit-1' });
  });

  describe('authentication boundary', () => {
    it('rejects an unauthenticated status update with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/orders/order-1/status')
        .send({ status: OrderStatus.SHIPPED })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant isolation', () => {
    it('rejects a client-supplied store of another tenant with 403 FORBIDDEN', async () => {
      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        storeId: 'store-b',
        body: { status: OrderStatus.SHIPPED },
      }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(prismaOrderFindFirst).not.toHaveBeenCalled();
    });

    it('a foreign-store order id fails closed with 404 NOT_FOUND (no existence leak)', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(null);

      const res = await patchOrderStatus('order-foreign', {
        token: 'valid-token',
        body: { status: OrderStatus.DELIVERED },
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('documented fulfillment / delivery chain', () => {
    it('walks PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED with one audit row per transition and no inventory/payment writes', async () => {
      // Pre-read for each PATCH (the current status before the transition).
      prismaOrderFindFirst.mockResolvedValueOnce(pendingOrderRow);
      prismaOrderFindFirst.mockResolvedValueOnce(confirmedOrderRow);
      prismaOrderFindFirst.mockResolvedValueOnce(processingOrderRow);
      prismaOrderFindFirst.mockResolvedValueOnce(shippedOrderRow);
      // Reloaded order after each transition (inside the transaction).
      txOrderFindFirst.mockResolvedValueOnce(confirmedOrderRow);
      txOrderFindFirst.mockResolvedValueOnce(processingOrderRow);
      txOrderFindFirst.mockResolvedValueOnce(shippedOrderRow);
      txOrderFindFirst.mockResolvedValueOnce(deliveredOrderRow);

      const step1 = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.CONFIRMED },
      }).expect(200);
      const step2 = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.PROCESSING },
      }).expect(200);
      const step3 = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.SHIPPED },
      }).expect(200);
      const step4 = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.DELIVERED },
      }).expect(200);

      // Each step is a guarded, store-scoped conditional update.
      expect(txOrderUpdateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.PENDING },
        data: expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      });
      expect(txOrderUpdateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.CONFIRMED },
        data: { status: OrderStatus.PROCESSING },
      });
      expect(txOrderUpdateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.PROCESSING },
        data: { status: OrderStatus.SHIPPED },
      });
      expect(txOrderUpdateMany).toHaveBeenNthCalledWith(4, {
        where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.SHIPPED },
        data: { status: OrderStatus.DELIVERED },
      });

      // Exactly one audit row per successful status change; never order.cancelled
      // on the fulfillment path (US-ORDER-003, DATABASE section 7.18).
      expect(txAuditLogCreate).toHaveBeenCalledTimes(4);
      expect(txAuditLogCreate.mock.calls.map(([args]) => args.data.action)).toEqual([
        'order.status_changed',
        'order.status_changed',
        'order.status_changed',
        'order.status_changed',
      ]);
      expect(txAuditLogCreate.mock.calls.map(([args]) => args.data.metadata)).toEqual([
        { orderNumber: 'ORD-2026-000001', from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
        {
          orderNumber: 'ORD-2026-000001',
          from: OrderStatus.CONFIRMED,
          to: OrderStatus.PROCESSING,
        },
        { orderNumber: 'ORD-2026-000001', from: OrderStatus.PROCESSING, to: OrderStatus.SHIPPED },
        { orderNumber: 'ORD-2026-000001', from: OrderStatus.SHIPPED, to: OrderStatus.DELIVERED },
      ]);

      // Inventory boundary: shipping/fulfillment/delivery never consume or
      // release reservations and never mutate stock (owned by cancellation /
      // payment outcomes only — DATABASE sections 27.1/28.2/28.4).
      expect(txReservationFindMany).not.toHaveBeenCalled();
      expect(txReservationUpdateMany).not.toHaveBeenCalled();
      expect(txInventoryFindUnique).not.toHaveBeenCalled();
      expect(txMovementCreate).not.toHaveBeenCalled();

      // Payment boundary: the delivery lifecycle never creates or updates
      // payment records (Payments owns the payment state machine).
      expect(txPaymentCreate).not.toHaveBeenCalled();
      expect(txPaymentUpdateMany).not.toHaveBeenCalled();

      expect(step1.body.data.status).toBe(OrderStatus.CONFIRMED);
      expect(step2.body.data.status).toBe(OrderStatus.PROCESSING);
      expect(step3.body.data.status).toBe(OrderStatus.SHIPPED);
      expect(step4.body.data.status).toBe(OrderStatus.DELIVERED);
    });
  });

  describe('shipping / delivery idempotency (repeated requests)', () => {
    it('rejects a repeated SHIPPED request with 409 STATE_TRANSITION and writes nothing', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(shippedOrderRow);

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.SHIPPED },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });

    it('rejects a repeated DELIVERED request with 409 STATE_TRANSITION and writes nothing', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(deliveredOrderRow);

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.DELIVERED },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('terminal state and invalid transitions', () => {
    it('protects the DELIVERED terminal state (no backward move, no cancellation after delivery)', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(deliveredOrderRow);

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.CANCELLED },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });

    it('rejects forward-state skipping (PROCESSING -> DELIVERED) with 409 STATE_TRANSITION', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(processingOrderRow);

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.DELIVERED },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('fails closed with 409 STATE_TRANSITION when a guarded SHIPPED -> DELIVERED update affects zero rows', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(shippedOrderRow);
      txOrderUpdateMany.mockResolvedValue({ count: 0 });

      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: OrderStatus.DELIVERED },
      }).expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txAuditLogCreate).not.toHaveBeenCalled();
    });

    it('rejects an invalid status value with 400 VALIDATION_ERROR', async () => {
      const res = await patchOrderStatus('order-1', {
        token: 'valid-token',
        body: { status: 'DELIVERING' },
      }).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('merchant order detail (US-ORDER-002 — shipping information)', () => {
    it('renders the shipping snapshot, shipping total and SHIPPED/DELIVERED status from stored order data', async () => {
      prismaOrderFindFirst.mockResolvedValueOnce(shippedOrderRow);

      const res = await getOrder('order-1', { token: 'valid-token' }).expect(200);

      expect(res.body.data).toMatchObject({
        id: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: OrderStatus.SHIPPED,
        shippingTotal: 3500,
        shippingAddress: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
      });
      expect(prismaOrderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', storeId: 'store-1' } }),
      );
    });
  });
});
