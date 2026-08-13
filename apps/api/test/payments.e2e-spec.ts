import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';
import { PaymentProvider } from '../src/payments/providers/payment-provider';

/**
 * End-to-end coverage of PHASE 9 — Payments.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard), the
 * real TenantContextService, TransactionService, RlsTenantBinder, the real
 * PaymentsService / PaymobWebhookService and the real Order/Inventory
 * primitives are exercised end-to-end against a stubbed PrismaService and a
 * stubbed PaymentProvider. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution (403) for the
 *     Payment API
 *   - POST /orders/:orderId/payments (201 create + provider initiation;
 *     Idempotency-Key replay; CONFLICT on active payment / non-PENDING order;
 *     provider-failure -> FAILED)
 *   - GET /orders/:orderId/payment (active payment view; 404s)
 *   - POST /webhooks/paymob (public, signature-gated): success -> payment
 *     SUCCEEDED + order CONFIRMED + reservations CONSUMED; failure -> payment
 *     FAILED + reservations RELEASED; duplicate/forged/unresolvable events
 *
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS/guarded concurrency) are NOT
 * claimed here — they live in the blocked database suite.
 */
describe('Payments (e2e)', () => {
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
    idempotencyKey: 'checkout-key-1',
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

  const orderWithDetails = { ...orderRow, items: [orderItemRow], reservations: [reservationRow] };

  const paymentRow = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: PaymentStatus.PENDING,
    provider: 'paymob',
    providerReference: null,
    amount: 1000n,
    currency: 'EGP',
    idempotencyKey: 'pay-key-1',
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const processingPaymentRow = {
    ...paymentRow,
    status: PaymentStatus.PROCESSING,
    providerReference: 'pm-order-1',
  };

  const attemptRow = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: PaymentStatus.PENDING,
    providerReference: null,
    idempotencyKey: 'pay-key-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const processingAttemptRow = {
    ...attemptRow,
    status: PaymentStatus.PROCESSING,
    providerReference: 'pm-order-1',
    initiatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const eventRow = {
    id: 'event-1',
    storeId: null,
    paymentId: null,
    provider: 'paymob',
    providerEventId: 'txn-1',
    eventType: 'transaction',
    payload: {},
    signatureVerified: true,
    processingStatus: 'RECEIVED',
    errorMessage: null,
    processedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  const txExecuteRaw = jest.fn();
  const txPaymentCreate = jest.fn();
  const txPaymentUpdateMany = jest.fn();
  const txAttemptCreate = jest.fn();
  const txAttemptFindFirst = jest.fn();
  const txAttemptUpdateMany = jest.fn();
  const txOrderFindFirst = jest.fn();
  const txOrderUpdateMany = jest.fn();
  const txReservationFindMany = jest.fn();
  const txReservationUpdateMany = jest.fn();
  const txInventoryFindUnique = jest.fn();
  const txMovementCreate = jest.fn();
  const txAuditLogCreate = jest.fn();
  const txPaymentEventUpdateMany = jest.fn();

  const txClient = {
    $executeRaw: txExecuteRaw,
    payment: { create: txPaymentCreate, updateMany: txPaymentUpdateMany },
    paymentAttempt: {
      create: txAttemptCreate,
      findFirst: txAttemptFindFirst,
      updateMany: txAttemptUpdateMany,
    },
    order: { findFirst: txOrderFindFirst, updateMany: txOrderUpdateMany },
    inventoryReservation: { findMany: txReservationFindMany, updateMany: txReservationUpdateMany },
    inventory: { findUnique: txInventoryFindUnique },
    inventoryMovement: { create: txMovementCreate },
    auditLog: { create: txAuditLogCreate },
    paymentEvent: { updateMany: txPaymentEventUpdateMany },
  };

  // Shared Prisma reads/writes used by repositories and the real guard chain.
  const prismaOrderFindFirst = jest.fn();
  const prismaPaymentFindFirst = jest.fn();
  const prismaPaymentFindUnique = jest.fn();
  const prismaAttemptFindFirst = jest.fn();
  const prismaEventCreate = jest.fn();
  const prismaEventFindUnique = jest.fn();
  const prismaEventUpdateMany = jest.fn();

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
    order: { findFirst: prismaOrderFindFirst },
    payment: { findFirst: prismaPaymentFindFirst, findUnique: prismaPaymentFindUnique },
    paymentAttempt: { findFirst: prismaAttemptFindFirst },
    paymentEvent: {
      create: prismaEventCreate,
      findUnique: prismaEventFindUnique,
      updateMany: prismaEventUpdateMany,
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

  const paymentProviderStub = {
    initiatePayment: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    parseWebhookEvent: jest.fn(),
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
      .overrideProvider(PaymentProvider)
      .useValue(paymentProviderStub)
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
    txExecuteRaw.mockResolvedValue(undefined);
    paymentProviderStub.initiatePayment.mockResolvedValue({
      providerReference: 'pm-order-1',
      providerCheckoutUrl: 'https://accept.paymob.test/api/acceptance/iframes/7777?payment_token=x',
    });
  });

  function createPayment(
    orderId: string,
    overrides: { token?: string; storeId?: string; key?: string; body?: unknown } = {},
  ) {
    let req = request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/payments`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    if (overrides.key !== undefined) {
      req = req.set('Idempotency-Key', overrides.key);
    }
    return req.send(overrides.body ?? {});
  }

  function getPayment(orderId: string, overrides: { token?: string; storeId?: string } = {}) {
    let req = request(app.getHttpServer()).get(`/api/v1/orders/${orderId}/payment`);
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    return req.send();
  }

  function postWebhook(body: unknown, hmac?: string) {
    const url =
      hmac !== undefined
        ? `/api/v1/webhooks/paymob?hmac=${encodeURIComponent(hmac)}`
        : '/api/v1/webhooks/paymob';
    return request(app.getHttpServer())
      .post(url)
      .send(body as Record<string, unknown>);
  }

  describe('authentication boundary', () => {
    it('rejects unauthenticated payment creation with 401', async () => {
      const res = await createPayment('order-1', {}).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated get-payment with 401', async () => {
      const res = await getPayment('order-1', {}).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant isolation', () => {
    it('rejects a client-supplied store of another tenant (403 FORBIDDEN)', async () => {
      const res = await createPayment('order-1', {
        token: 'valid-token',
        storeId: 'store-b',
        key: 'key-1',
      }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('a foreign-store order id fails closed with 404 NOT_FOUND (no existence leak)', async () => {
      prismaOrderFindFirst.mockResolvedValue(null);

      const res = await createPayment('order-foreign', {
        token: 'valid-token',
        key: 'key-1',
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('create payment', () => {
    it('requires an Idempotency-Key (400 VALIDATION_ERROR)', async () => {
      const res = await createPayment('order-1', { token: 'valid-token' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(paymentProviderStub.initiatePayment).not.toHaveBeenCalled();
    });

    it('rejects payment for a non-PENDING order (409 STATE_TRANSITION)', async () => {
      prismaOrderFindFirst.mockResolvedValue({
        ...orderWithDetails,
        status: OrderStatus.CANCELLED,
      });

      const res = await createPayment('order-1', { token: 'valid-token', key: 'key-1' }).expect(
        409,
      );
      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txPaymentCreate).not.toHaveBeenCalled();
    });

    it('creates the PENDING payment + attempt and returns the initiated PROCESSING view (201)', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst
        .mockResolvedValueOnce(null) // findByIdempotencyKey
        .mockResolvedValueOnce(null) // findNonFailedForOrder
        .mockResolvedValueOnce(processingPaymentRow); // findById (view load)
      prismaAttemptFindFirst.mockResolvedValueOnce(processingAttemptRow);
      txPaymentCreate.mockResolvedValue(paymentRow);
      txAttemptCreate.mockResolvedValue(attemptRow);
      txPaymentUpdateMany.mockResolvedValue({ count: 1 });
      txAttemptUpdateMany.mockResolvedValue({ count: 1 });

      const res = await createPayment('order-1', { token: 'valid-token', key: 'pay-key-1' }).expect(
        201,
      );

      // Amount/currency come from the order; provider = paymob.
      expect(txPaymentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'store-1',
            orderId: 'order-1',
            provider: 'paymob',
            amount: 1000n,
            currency: 'EGP',
            idempotencyKey: 'pay-key-1',
          }),
        }),
      );
      expect(txAttemptCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentId: 'payment-1', amount: 1000n, currency: 'EGP' }),
        }),
      );
      // Provider initiated AFTER the DB write (external call outside the tx).
      expect(paymentProviderStub.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment-1',
          orderId: 'order-1',
          orderNumber: 'ORD-2026-000001',
          amount: 1000n,
          currency: 'EGP',
        }),
      );
      // Guarded PENDING -> PROCESSING on payment + attempt with the reference.
      expect(txPaymentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-1', storeId: 'store-1', status: PaymentStatus.PENDING },
          data: expect.objectContaining({
            status: PaymentStatus.PROCESSING,
            providerReference: 'pm-order-1',
          }),
        }),
      );
      expect(res.body.data.status).toBe(PaymentStatus.PROCESSING);
      expect(res.body.data.amount).toBe(1000);
      expect(res.body.data.currency).toBe('EGP');
      expect(res.body.data.providerCheckoutUrl).toContain('payment_token=x');
    });

    it('replays an idempotency key without creating a new payment or calling the provider', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst
        .mockResolvedValueOnce(paymentRow) // findByIdempotencyKey -> existing
        .mockResolvedValueOnce(paymentRow); // findById (view load)
      prismaAttemptFindFirst.mockResolvedValueOnce(attemptRow);

      const res = await createPayment('order-1', { token: 'valid-token', key: 'pay-key-1' }).expect(
        201,
      );

      expect(txPaymentCreate).not.toHaveBeenCalled();
      expect(paymentProviderStub.initiatePayment).not.toHaveBeenCalled();
      expect(res.body.data.id).toBe('payment-1');
    });

    it('rejects an idempotency key already used for a different order (409 IDEMPOTENCY_CONFLICT)', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst.mockResolvedValueOnce({ ...paymentRow, orderId: 'order-other' });

      const res = await createPayment('order-1', { token: 'valid-token', key: 'pay-key-1' }).expect(
        409,
      );
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('blocks initiation while a non-FAILED payment exists (409 CONFLICT)', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst
        .mockResolvedValueOnce(null) // findByIdempotencyKey
        .mockResolvedValueOnce(paymentRow); // findNonFailedForOrder -> active

      const res = await createPayment('order-1', { token: 'valid-token', key: 'key-2' }).expect(
        409,
      );
      expect(res.body.error.code).toBe('CONFLICT');
      expect(txPaymentCreate).not.toHaveBeenCalled();
    });

    it('marks payment + attempt FAILED when provider initiation fails (409 + FAILED state)', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst
        .mockResolvedValueOnce(null) // findByIdempotencyKey
        .mockResolvedValueOnce(null); // findNonFailedForOrder
      txPaymentCreate.mockResolvedValue(paymentRow);
      txAttemptCreate.mockResolvedValue(attemptRow);
      paymentProviderStub.initiatePayment.mockRejectedValue(
        Object.assign(new Error('provider down'), { status: 409 }),
      );
      txPaymentUpdateMany.mockResolvedValue({ count: 1 });
      txAttemptUpdateMany.mockResolvedValue({ count: 1 });

      const res = await createPayment('order-1', { token: 'valid-token', key: 'pay-key-2' }).expect(
        409,
      );

      expect(res.body.error.code).toBe('CONFLICT');
      // Documented failure flow: PENDING -> PROCESSING -> FAILED on the payment.
      expect(txPaymentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PaymentStatus.PENDING }),
          data: expect.objectContaining({ status: PaymentStatus.PROCESSING }),
        }),
      );
      expect(txPaymentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PaymentStatus.PROCESSING }),
          data: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
    });
  });

  describe('get payment', () => {
    it('returns 404 for a missing order', async () => {
      prismaOrderFindFirst.mockResolvedValue(null);

      const res = await getPayment('order-missing', { token: 'valid-token' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the order has no payment yet', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst.mockResolvedValueOnce(null);

      const res = await getPayment('order-1', { token: 'valid-token' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns the active payment with its attempts', async () => {
      prismaOrderFindFirst.mockResolvedValue(orderWithDetails);
      prismaPaymentFindFirst
        .mockResolvedValueOnce(paymentRow) // findLatestForOrder
        .mockResolvedValueOnce(paymentRow); // findById (view load)
      prismaAttemptFindFirst.mockResolvedValueOnce(attemptRow);

      const res = await getPayment('order-1', { token: 'valid-token' }).expect(200);

      expect(res.body.data.id).toBe('payment-1');
      expect(res.body.data.attempts).toHaveLength(1);
    });
  });

  describe('paymob webhook', () => {
    const successEvent = {
      providerEventId: 'txn-1',
      eventType: 'transaction',
      paymentReference: 'payment-1',
      success: true,
      pending: false,
      failureCode: null,
      failureMessage: null,
    };

    const failureEvent = { ...successEvent, success: false, failureMessage: 'Insufficient funds' };

    it('is public: a valid webhook is processed WITHOUT merchant authentication', async () => {
      paymentProviderStub.verifyWebhookSignature.mockReturnValue(true);
      paymentProviderStub.parseWebhookEvent.mockReturnValue(successEvent);
      prismaEventCreate.mockResolvedValue(eventRow);
      prismaPaymentFindUnique.mockResolvedValue(processingPaymentRow);
      txOrderFindFirst.mockResolvedValue(orderRow);
      txPaymentUpdateMany.mockResolvedValue({ count: 1 });
      txAttemptFindFirst.mockResolvedValue(processingAttemptRow);
      txAttemptUpdateMany.mockResolvedValue({ count: 1 });
      txReservationFindMany.mockResolvedValue([reservationRow]);
      txReservationUpdateMany.mockResolvedValue({ count: 1 });
      txInventoryFindUnique.mockResolvedValue(inventoryRow);
      txMovementCreate.mockResolvedValue({});
      txOrderUpdateMany.mockResolvedValue({ count: 1 });
      txAuditLogCreate.mockResolvedValue({});
      txPaymentEventUpdateMany.mockResolvedValue({ count: 1 });

      const res = await postWebhook({ type: 'transaction', obj: { id: 'txn-1' } }).expect(200);

      expect(res.body.data.status).toBe('processed');
      // Payment SUCCEEDED.
      expect(txPaymentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PaymentStatus.PROCESSING }),
          data: expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
        }),
      );
      // Order PENDING -> CONFIRMED (guarded, Orders-domain primitive).
      expect(txOrderUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: OrderStatus.PENDING }),
          data: expect.objectContaining({ status: OrderStatus.CONFIRMED }),
        }),
      );
      // Reservations ACTIVE -> CONSUMED.
      expect(txReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
          data: expect.objectContaining({ status: 'CONSUMED' }),
        }),
      );
      // Event marked PROCESSED + resolved to the store/payment.
      expect(txPaymentEventUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1' },
          data: expect.objectContaining({ storeId: 'store-1', paymentId: 'payment-1' }),
        }),
      );
      // Audit rows written in the same transaction.
      expect(txAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'payment.succeeded' }) }),
      );
    });

    it('rejects a forged webhook with 400 (invalid signature)', async () => {
      paymentProviderStub.verifyWebhookSignature.mockReturnValue(false);

      const res = await postWebhook({ type: 'transaction', obj: { id: 'txn-1' } }).expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(prismaEventCreate).not.toHaveBeenCalled();
    });

    it('is idempotent for a duplicate of a PROCESSED event (200, no transitions)', async () => {
      paymentProviderStub.verifyWebhookSignature.mockReturnValue(true);
      paymentProviderStub.parseWebhookEvent.mockReturnValue(successEvent);
      prismaEventCreate.mockRejectedValue(uniqueViolation());
      prismaEventFindUnique.mockResolvedValue({
        ...eventRow,
        processingStatus: 'PROCESSED',
        processedAt: new Date('2026-08-12T00:00:00Z'),
      });

      const res = await postWebhook({ type: 'transaction', obj: { id: 'txn-1' } }).expect(200);

      expect(res.body.data.status).toBe('already_processed');
      expect(prismaPaymentFindUnique).not.toHaveBeenCalled();
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('marks an unresolvable payment event ERROR and returns a safe response', async () => {
      paymentProviderStub.verifyWebhookSignature.mockReturnValue(true);
      paymentProviderStub.parseWebhookEvent.mockReturnValue(successEvent);
      prismaEventCreate.mockResolvedValue(eventRow);
      prismaPaymentFindUnique.mockResolvedValue(null);

      const res = await postWebhook({ type: 'transaction', obj: { id: 'txn-1' } }).expect(200);

      expect(res.body.data.status).toBe('payment_unresolved');
      expect(prismaEventUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1' },
          data: expect.objectContaining({ processingStatus: 'ERROR' }),
        }),
      );
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
    });

    it('applies FAILED: payment FAILED + reservations RELEASED, order stays PENDING', async () => {
      paymentProviderStub.verifyWebhookSignature.mockReturnValue(true);
      paymentProviderStub.parseWebhookEvent.mockReturnValue(failureEvent);
      prismaEventCreate.mockResolvedValue(eventRow);
      prismaPaymentFindUnique.mockResolvedValue(processingPaymentRow);
      txOrderFindFirst.mockResolvedValue(orderRow);
      txPaymentUpdateMany.mockResolvedValue({ count: 1 });
      txAttemptFindFirst.mockResolvedValue(processingAttemptRow);
      txAttemptUpdateMany.mockResolvedValue({ count: 1 });
      txReservationFindMany.mockResolvedValue([reservationRow]);
      txReservationUpdateMany.mockResolvedValue({ count: 1 });
      txInventoryFindUnique.mockResolvedValue(inventoryRow);
      txMovementCreate.mockResolvedValue({});
      txAuditLogCreate.mockResolvedValue({});
      txPaymentEventUpdateMany.mockResolvedValue({ count: 1 });

      const res = await postWebhook({ type: 'transaction', obj: { id: 'txn-2' } }).expect(200);

      expect(res.body.data.status).toBe('processed');
      expect(txPaymentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PaymentStatus.PROCESSING }),
          data: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
      // Reservations ACTIVE -> RELEASED.
      expect(txReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
          data: expect.objectContaining({ status: 'RELEASED' }),
        }),
      );
      // A failed payment never confirms the order.
      expect(txOrderUpdateMany).not.toHaveBeenCalled();
      expect(txAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'payment.failed' }) }),
      );
    });
  });
});

function uniqueViolation(): unknown {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['provider_event_id'] },
  });
}
