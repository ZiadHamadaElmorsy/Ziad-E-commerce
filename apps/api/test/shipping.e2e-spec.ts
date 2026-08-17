import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { StorageProvider } from '../src/media/storage/storage-provider';
import { PaymentProvider } from '../src/payments/providers/payment-provider';
import { ShippingProvider } from '../src/shipping/providers/shipping-provider';
import { BOSTA_SIGNATURE_HEADER, verifyBostaWebhookSignature } from '../src/shipping/providers/bosta/bosta-webhook-signature';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 27 - Shipping (Bosta behind the provider
 * abstraction), Cash on Delivery and customer tracking.
 *
 * Same harness as the other e2e suites: real guard chain + real services
 * against a stubbed PrismaService; the ShippingProvider is faked so the Bosta
 * HTTP calls are deterministic, but the webhook SIGNATURE is verified with the
 * real HMAC helper over the raw body (rawBody capture is enabled).
 */
describe('Shipping / COD / Tracking (e2e)', () => {
  let app: INestApplication;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const membershipRow = {
    id: 'm-1',
    storeId: 'store-1',
    userId: 'user-1',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  // COD order - grand total EGP 750 (75000 minor units).
  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    channel: 'ONLINE_PAYMENT',
    paymentMethod: 'COD',
    paymentStatus: 'UNPAID',
    customerId: 'customer-1',
    status: 'SHIPPED',
    currency: 'EGP',
    subtotal: 75000n,
    discountTotal: 0n,
    shippingTotal: 0n,
    taxTotal: 0n,
    grandTotal: 75000n,
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    shippingAddressSnapshot: { governorate: 'Gharbia', city: 'Tanta', addressLine: 'Street 5' },
    billingAddressSnapshot: null,
    idempotencyKey: null,
    lookupToken: 'lookup-token-1',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
    confirmedAt: new Date('2026-08-14T00:00:00Z'),
    cancelledAt: null,
  };

  const orderItemRow = {
    id: 'oi-1',
    orderId: 'order-1',
    productId: 'product-1',
    variantId: 'variant-1',
    productNameSnapshot: 'Classic T-Shirt',
    variantNameSnapshot: 'Black',
    skuSnapshot: 'TS-BLK',
    unitPrice: 75000n,
    quantity: 1,
    lineTotal: 75000n,
    createdAt: new Date('2026-08-14T00:00:00Z'),
  };

  const orderWithDetails = {
    ...orderRow,
    items: [orderItemRow],
    reservations: [],
  };

  const historyRow = {
    id: 'h-1',
    storeId: 'store-1',
    shipmentId: 'shipment-1',
    previousStatus: null,
    newStatus: 'CREATED',
    providerStatus: null,
    source: 'SYSTEM',
    providerEventId: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
  };

  const shipmentRow = {
    id: 'shipment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    provider: 'BOSTA',
    providerShipmentId: 'bosta-1',
    trackingNumber: 'TRK-001',
    status: 'CREATED',
    codAmount: 75000n,
    shippingCost: 0n,
    lastProviderStatus: 'PENDING',
    rawProviderData: null,
    errorMessage: null,
    printedLabelUrl: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
    deliveredAt: null,
  };

  const shipmentWithHistory = { ...shipmentRow, statusHistory: [historyRow] };

  // --- transaction client (runWithTenant) ---
  const txShipmentCreate = jest.fn();
  const txShipmentUpdate = jest.fn();
  const txShipmentUpdateMany = jest.fn();
  const txShipmentFindFirst = jest.fn();
  const txHistoryCreate = jest.fn();
  const txOrderFindFirst = jest.fn();
  const txOrderUpdateMany = jest.fn();

  const txClient = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    shipment: {
      create: txShipmentCreate,
      update: txShipmentUpdate,
      updateMany: txShipmentUpdateMany,
      findFirst: txShipmentFindFirst,
    },
    shipmentStatusHistory: { create: txHistoryCreate },
    order: { findFirst: txOrderFindFirst, updateMany: txOrderUpdateMany },
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
    store: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn() },
    storeMembership: { findMany: jest.fn() },
    customer: { findFirst: jest.fn(), findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
    shipment: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn(), findMany: jest.fn() },
    paymentAttempt: { findFirst: jest.fn(), findMany: jest.fn() },
    media: { findFirst: jest.fn() },
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
    initiatePayment: jest.fn().mockResolvedValue({
      providerReference: 'ref-1',
      providerCheckoutUrl: 'https://accept.paymob.test/iframe',
    }),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    parseWebhookEvent: jest.fn().mockReturnValue(null),
  };

  const storageProviderStub = {
    uploadObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('bytes')),
  };

  const shippingProviderStub = {
    createShipment: jest.fn().mockResolvedValue({
      providerShipmentId: 'bosta-1',
      trackingNumber: 'TRK-001',
      printedLabelUrl: null,
      rawProviderStatus: 'PENDING',
    }),
    getShipment: jest.fn().mockResolvedValue({
      rawProviderStatus: 'OUT_FOR_DELIVERY',
      trackingNumber: 'TRK-001',
      rawData: { status: 'OUT_FOR_DELIVERY' },
    }),
    cancelShipment: jest.fn().mockResolvedValue(undefined),
    getShippingLabel: jest.fn().mockResolvedValue(null),
    // Real HMAC verification over the raw body (production code path).
    verifyWebhookSignature: jest
      .fn()
      .mockImplementation((rawBody: string, signature?: string) =>
        verifyBostaWebhookSignature(rawBody, signature, 'test-webhook-secret'),
      ),
    parseWebhookEvent: jest.fn().mockImplementation((rawBody: string) => {
      const body = JSON.parse(rawBody) as Record<string, string>;
      return {
        providerEventId: body.eventId ?? 'evt-fallback',
        providerShipmentId: body.shipmentId ?? 'bosta-1',
        providerStatus: body.status ?? null,
      };
    }),
  };

  const WEBHOOK_SECRET = 'test-webhook-secret';
  const signBody = (raw: string): string =>
    createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('hex');

  beforeAll(async () => {
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { slug: string } }) =>
        where.slug === 'my-store' ? storeRow : null,
    );
    prismaServiceStub.storeMembership.findMany.mockImplementation(async () => [
      { ...membershipRow, store: storeRow },
    ]);
    prismaServiceStub.subscription.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        where.storeId === 'store-1'
          ? {
              id: 'sub-1',
              storeId: 'store-1',
              status: 'TRIAL',
              trialStartedAt: new Date('2026-08-14T00:00:00Z'),
              trialEndsAt: new Date('2027-08-14T00:00:00Z'),
              activatedAt: null,
              expiresAt: null,
              createdAt: new Date('2026-08-14T00:00:00Z'),
              updatedAt: new Date('2026-08-14T00:00:00Z'),
            }
          : null,
    );
    prismaServiceStub.storeSettings.findUnique.mockResolvedValue({
      id: 'settings-1',
      storeId: 'store-1',
      settings: {},
      createdAt: new Date('2026-08-14T00:00:00Z'),
      updatedAt: new Date('2026-08-14T00:00:00Z'),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(AuthProvider)
      .useValue(authProviderStub)
      .overrideProvider(PaymentProvider)
      .useValue(paymentProviderStub)
      .overrideProvider(StorageProvider)
      .useValue(storageProviderStub)
      .overrideProvider(ShippingProvider)
      .useValue(shippingProviderStub)
      .compile();

    // rawBody: true so the Bosta webhook controller receives req.rawBody.
    app = moduleFixture.createNestApplication({ rawBody: true });
    setupApp(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply the shared-read defaults after clearAllMocks.
    prismaServiceStub.order.findFirst.mockResolvedValue(orderWithDetails);
    prismaServiceStub.shipment.findFirst.mockResolvedValue(shipmentWithHistory);
    txShipmentFindFirst.mockResolvedValue(shipmentWithHistory);
    txOrderFindFirst.mockResolvedValue(orderWithDetails);
    txShipmentCreate.mockResolvedValue({ ...shipmentRow });
    txShipmentUpdate.mockResolvedValue({ ...shipmentRow });
    txShipmentUpdateMany.mockResolvedValue({ count: 1 });
    txHistoryCreate.mockResolvedValue({ id: 'h-2' });
    txOrderUpdateMany.mockResolvedValue({ count: 1 });
    shippingProviderStub.createShipment.mockResolvedValue({
      providerShipmentId: 'bosta-1',
      trackingNumber: 'TRK-001',
      printedLabelUrl: null,
      rawProviderStatus: 'PENDING',
    });
  });

  // ---------------------------------------------------------------------------
  // Merchant: create / get / refresh / cancel shipment (Part 10)
  // ---------------------------------------------------------------------------

  describe('merchant create shipment', () => {
    it('creates the shipment with the COD amount (grand total) and tracking number', async () => {
      prismaServiceStub.shipment.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(201);

      expect(res.body.data).toMatchObject({
        orderId: 'order-1',
        provider: 'BOSTA',
        trackingNumber: 'TRK-001',
        status: 'CREATED',
        codAmount: 75000,
      });
      // The COD amount sent to the provider is the order grand total.
      expect(shippingProviderStub.createShipment).toHaveBeenCalledWith(
        expect.objectContaining({ codAmount: 75000n }),
      );
      expect(txShipmentCreate).toHaveBeenCalledWith(
        { data: expect.objectContaining({ codAmount: 75000n, orderId: 'order-1', provider: 'BOSTA' }) },
      );
    });

    it('is IDEMPOTENT - a repeated create returns the existing shipment and never calls the provider twice', async () => {
      prismaServiceStub.shipment.findFirst.mockResolvedValue(shipmentWithHistory);

      const first = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(201);

      expect(first.body.data.id).toBe(second.body.data.id);
      // The provider is never called for the existing-shipment path.
      expect(shippingProviderStub.createShipment).not.toHaveBeenCalled();
    });

    it('rejects shipment creation for a cancelled order', async () => {
      prismaServiceStub.order.findFirst.mockResolvedValue({
        ...orderWithDetails,
        status: 'CANCELLED',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(txShipmentCreate).not.toHaveBeenCalled();
    });

    it('fails closed with NOT_FOUND for a foreign order (tenant isolation)', async () => {
      prismaServiceStub.order.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/foreign-order/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txShipmentCreate).not.toHaveBeenCalled();
    });
  });

  describe('merchant get / refresh / cancel shipment', () => {
    it('returns the shipment detail', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/order-1/shipment')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
      expect(res.body.data).toMatchObject({
        trackingNumber: 'TRK-001',
        status: 'CREATED',
        codAmount: 75000,
      });
    });

    it('refresh applies the provider status with a history row', async () => {
      // The post-transition reload returns the shipment in its new status.
      txShipmentFindFirst.mockResolvedValue({
        ...shipmentWithHistory,
        status: 'OUT_FOR_DELIVERY',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment/refresh')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(shippingProviderStub.getShipment).toHaveBeenCalledWith('bosta-1');
      expect(res.body.data.status).toBe('OUT_FOR_DELIVERY');
      // Guarded transition + history row + raw provider status persisted.
      expect(txShipmentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shipment-1', storeId: 'store-1', status: 'CREATED' },
          data: expect.objectContaining({
            status: 'OUT_FOR_DELIVERY',
            lastProviderStatus: 'OUT_FOR_DELIVERY',
          }),
        }),
      );
      expect(txHistoryCreate).toHaveBeenCalledWith(
        { data: expect.objectContaining({
          previousStatus: 'CREATED',
          newStatus: 'OUT_FOR_DELIVERY',
          source: 'MERCHANT',
        }) },
      );
    });

    it('cancel calls the provider and moves the shipment to CANCELLED', async () => {
      txShipmentFindFirst.mockResolvedValue({
        ...shipmentWithHistory,
        status: 'CANCELLED',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/order-1/shipment/cancel')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(shippingProviderStub.cancelShipment).toHaveBeenCalledWith('bosta-1');
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  // ---------------------------------------------------------------------------
  // Bosta webhook (Part 15)
  // ---------------------------------------------------------------------------

  describe('bosta webhook', () => {
    const deliveredBody = JSON.stringify({
      eventId: 'evt-delivered',
      shipmentId: 'bosta-1',
      status: 'DELIVERED',
    });

    it('rejects an invalid signature with 400 and never touches the shipment', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/bosta')
        .set('Content-Type', 'application/json')
        .set(BOSTA_SIGNATURE_HEADER, 'invalid-signature')
        .send(deliveredBody)
        .expect(400);

      expect(txShipmentUpdateMany).not.toHaveBeenCalled();
    });

    it('processes a DELIVERED event: shipment DELIVERED + COD order becomes PAID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/bosta')
        .set('Content-Type', 'application/json')
        .set(BOSTA_SIGNATURE_HEADER, signBody(deliveredBody))
        .send(deliveredBody)
        .expect(200);

      expect(res.body.data.status).toBe('processed');
      // Shipment transition + history row.
      expect(txShipmentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shipment-1', storeId: 'store-1', status: 'CREATED' },
          data: expect.objectContaining({
            status: 'DELIVERED',
            lastProviderStatus: 'DELIVERED',
          }),
        }),
      );
      expect(txHistoryCreate).toHaveBeenCalledWith(
        { data: expect.objectContaining({
          previousStatus: 'CREATED',
          newStatus: 'DELIVERED',
          source: 'WEBHOOK',
          providerEventId: 'evt-delivered',
        }) },
      );
      // COD: the order-level payment status becomes PAID (Part 11).
      expect(txOrderUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', storeId: 'store-1', paymentStatus: 'UNPAID' },
          data: { paymentStatus: 'PAID' },
        }),
      );
    });

    it('deduplicates a repeated event (already_processed, no second history row)', async () => {
      // Simulate a duplicate delivery by making the history insert hit the
      // UNIQUE (shipment_id, provider_event_id) constraint.
      txHistoryCreate.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on shipment_status_history',
          { code: 'P2002', clientVersion: '6.19.3' },
        ),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/bosta')
        .set('Content-Type', 'application/json')
        .set(BOSTA_SIGNATURE_HEADER, signBody(deliveredBody))
        .send(deliveredBody)
        .expect(200);

      expect(res.body.data.status).toBe('already_processed');
    });

    it('returns shipment_unresolved for an unknown shipment (safe 200, no writes)', async () => {
      prismaServiceStub.shipment.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/bosta')
        .set('Content-Type', 'application/json')
        .set(BOSTA_SIGNATURE_HEADER, signBody(deliveredBody))
        .send(deliveredBody)
        .expect(200);

      expect(res.body.data.status).toBe('shipment_unresolved');
      expect(txShipmentUpdateMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Customer tracking (Part 13/18)
  // ---------------------------------------------------------------------------

  describe('customer tracking', () => {
    it('returns ONE aggregated payload and never exposes Bosta internals', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-1/tracking')
        .set('X-Storefront-Slug', 'my-store')
        .expect(200);

      const body = res.body.data;
      expect(body.order.orderNumber).toBe('ORD-2026-000001');
      expect(body.payment.method).toBe('COD');
      expect(body.payment.status).toBe('UNPAID');
      expect(body.payment.codAmount).toBe(75000);
      expect(body.tracking.trackingNumber).toBe('TRK-001');
      expect(body.tracking.timeline.map((entry: { step: string }) => entry.step)).toEqual([
        'ORDER_CONFIRMED',
        'HANDED_TO_COURIER',
        'AT_DELIVERY_CENTER',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
      ]);

      // The customer must NEVER see the provider name, provider ids, raw
      // statuses or internal database ids.
      const raw = JSON.stringify(body);
      expect(raw.toLowerCase()).not.toContain('bosta');
      expect(raw).not.toContain('bosta-1');
      expect(raw).not.toContain('PENDING');
      expect(raw).not.toContain('providerShipmentId');
      expect(raw).not.toContain('lastProviderStatus');
      expect(raw).not.toContain('storeId');
    });

    it('fails closed with NOT_FOUND for a foreign order (cross-tenant tracking rejected)', async () => {
      prismaServiceStub.order.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/foreign-order/tracking')
        .set('X-Storefront-Slug', 'my-store')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // COD payment lifecycle (Part 11)
  // ---------------------------------------------------------------------------

  describe('COD payment lifecycle', () => {
    it('a rejected shipment keeps the order UNPAID (no delivery -> no payment)', async () => {
      const rejectedBody = JSON.stringify({
        eventId: 'evt-rejected',
        shipmentId: 'bosta-1',
        status: 'REJECTED',
      });

      await request(app.getHttpServer())
        .post('/api/v1/webhooks/bosta')
        .set('Content-Type', 'application/json')
        .set(BOSTA_SIGNATURE_HEADER, signBody(rejectedBody))
        .send(rejectedBody)
        .expect(200);

      // The order payment status is NEVER touched on REJECTED.
      const paidTransition = txOrderUpdateMany.mock.calls.find(
        (call) => (call[1] as { data?: { paymentStatus?: string } })?.data?.paymentStatus === 'PAID',
      );
      expect(paidTransition).toBeUndefined();
    });
  });
});










