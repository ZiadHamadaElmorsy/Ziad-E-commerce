import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CartStatus, OrderChannel, OrderStatus, ProductStatus, VariantStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';
import { PaymentProvider } from '../src/payments/providers/payment-provider';
import { StorageProvider } from '../src/media/storage/storage-provider';

/**
 * End-to-end coverage of PHASE 19 — Public storefront commerce (guest
 * customer cart / checkout / payment / order / theme / navigation / media).
 *
 * Every endpoint under /api/v1/storefront is @Public(): NO merchant session
 * is required. The real guard chain (AuthGuard -> TenantContextGuard ->
 * RolesGuard) skips them, the real StorefrontStoreResolver + the real
 * CartService / CheckoutService / PaymentsService / ThemeService /
 * NavigationService run end-to-end against a stubbed PrismaService. Supabase
 * and PostgreSQL are NOT contacted. Paymob/Storage are overridden with fakes
 * so the payment session and media bytes are deterministic.
 */
describe('Storefront Commerce (e2e)', () => {
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

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    status: ProductStatus.ACTIVE,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const variantRow = {
    id: 'variant-1',
    storeId: 'store-1',
    productId: 'product-1',
    name: 'Classic T-Shirt',
    sku: null,
    price: 500n,
    compareAtPrice: null,
    costPrice: null,
    status: VariantStatus.ACTIVE,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const inventoryRow = {
    id: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    onHandQuantity: 10,
    reservedQuantity: 2,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const cartRow = {
    id: 'cart-1',
    storeId: 'store-1',
    customerId: null,
    guestToken: 'guest-token-1',
    status: CartStatus.ACTIVE,
    currency: 'EGP',
    expiresAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const itemRow = {
    id: 'item-1',
    cartId: 'cart-1',
    variantId: 'variant-1',
    quantity: 2,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const itemWithVariant = { ...itemRow, variant: { ...variantRow, product: productRow } };

  const customerRow = {
    id: 'customer-1',
    storeId: 'store-1',
    email: 'ahmed@example.com',
    phone: '01000000000',
    firstName: 'Ahmed',
    lastName: 'Ali',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const reservationRow = {
    id: 'res-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    cartId: 'cart-1',
    orderId: null,
    quantity: 2,
    status: 'ACTIVE',
    expiresAt: null,
    releasedAt: null,
    consumedAt: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    channel: OrderChannel.ONLINE_PAYMENT,
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
    lookupToken: 'lookup-token-1',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
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
    skuSnapshot: null,
    unitPrice: 500n,
    quantity: 2,
    lineTotal: 1000n,
    createdAt: new Date('2026-08-14T00:00:00Z'),
  };

  const orderWithDetails = { ...orderRow, items: [orderItemRow], reservations: [reservationRow] };

  const paymentRow = {
    id: 'payment-1',
    storeId: 'store-1',
    orderId: 'order-1',
    status: 'PROCESSING',
    provider: 'paymob',
    providerReference: 'ref-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    idempotencyKey: 'pay-key-1',
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const attemptRow = {
    id: 'attempt-1',
    paymentId: 'payment-1',
    status: 'PROCESSING',
    providerReference: 'ref-1',
    idempotencyKey: 'pay-key-1',
    amount: 1000n,
    currency: 'EGP',
    failureCode: null,
    failureMessage: null,
    initiatedAt: new Date('2026-08-14T00:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const themeRow = {
    id: 'theme-1',
    storeId: 'store-1',
    logoMediaId: null,
    config: { primaryColor: '#2563eb', fontFamily: 'Inter' },
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const navigationRow = {
    id: 'nav-1',
    storeId: 'store-1',
    name: 'Main',
    items: [{ label: 'About', type: 'PAGE', value: 'about' }],
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  };

  const mediaRow = {
    id: 'media-1',
    storeId: 'store-1',
    storagePath: 'store-1/media-1.png',
    mediaType: 'IMAGE',
    mimeType: 'image/png',
    sizeBytes: 5n,
    altText: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
  };

  // --- transaction client (runWithTenant) ---
  const txExecuteRaw = jest.fn();
  const txCartFindFirst = jest.fn();
  const txCartCreate = jest.fn();
  const txCartUpdateMany = jest.fn();
  const txItemFindFirst = jest.fn();
  const txItemCreate = jest.fn();
  const txItemUpdateMany = jest.fn();
  const txItemDeleteMany = jest.fn();
  const txItemFindMany = jest.fn();
  const txCustomerFindFirst = jest.fn();
  const txCustomerCreate = jest.fn();
  const txReservationCreate = jest.fn();
  const txReservationUpdateMany = jest.fn();
  const txInventoryFindUnique = jest.fn();
  const txMovementCreate = jest.fn();
  const txOrderFindFirst = jest.fn();
  const txOrderCount = jest.fn();
  const txOrderCreate = jest.fn();
  const txPaymentCreate = jest.fn();
  const txAttemptCreate = jest.fn();
  const txPaymentUpdateMany = jest.fn();
  const txAttemptUpdateMany = jest.fn();
  const txThemeCreate = jest.fn();
  const txNavCreate = jest.fn();

  const txClient = {
    $executeRaw: txExecuteRaw,
    cart: { findFirst: txCartFindFirst, create: txCartCreate, updateMany: txCartUpdateMany },
    cartItem: {
      findFirst: txItemFindFirst,
      create: txItemCreate,
      updateMany: txItemUpdateMany,
      deleteMany: txItemDeleteMany,
      findMany: txItemFindMany,
    },
    customer: { findFirst: txCustomerFindFirst, create: txCustomerCreate },
    inventoryReservation: { create: txReservationCreate, updateMany: txReservationUpdateMany },
    inventory: { findUnique: txInventoryFindUnique },
    inventoryMovement: { create: txMovementCreate },
    order: { findFirst: txOrderFindFirst, count: txOrderCount, create: txOrderCreate },
    payment: { create: txPaymentCreate, updateMany: txPaymentUpdateMany },
    paymentAttempt: { create: txAttemptCreate, updateMany: txAttemptUpdateMany },
    themeConfiguration: { create: txThemeCreate },
    navigation: { create: txNavCreate },
  };

  // --- shared Prisma reads ---
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
    storeSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    storeMembership: { findMany: jest.fn() },
    customer: { findFirst: jest.fn(), findUnique: jest.fn() },
    productVariant: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    inventory: { findUnique: jest.fn() },
    cart: { findFirst: jest.fn(), findMany: jest.fn() },
    cartItem: { findFirst: jest.fn(), findMany: jest.fn() },
    order: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn(), findMany: jest.fn() },
    paymentAttempt: { findFirst: jest.fn(), findMany: jest.fn() },
    themeConfiguration: { findUnique: jest.fn() },
    navigation: { findFirst: jest.fn() },
    media: { findFirst: jest.fn() },
  };

  const authProviderStub = {
    verifyToken: jest.fn().mockRejectedValue(
      new UnauthorizedError('should never be called for public routes'),
    ),
  };

  const paymentProviderStub = {
    initiatePayment: jest.fn().mockResolvedValue({
      providerReference: 'ref-1',
      providerCheckoutUrl: 'https://accept.paymob.test/iframe?payment_token=tok',
    }),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    parseWebhookEvent: jest.fn().mockReturnValue(null),
  };

  const storageProviderStub = {
    uploadObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('bytes')),
  };

  const checkoutBody = {
    customer: {
      name: 'Ahmed Ali',
      phone: '01000000000',
      email: 'ahmed@example.com',
    },
    shippingAddress: {
      governorate: 'Gharbia',
      city: 'Tanta',
      addressLine: 'Street 5',
    },
  };

  beforeAll(async () => {
    // Storefront resolver: my-store resolves, unknown/other slugs do not.
    prismaServiceStub.store.findUnique.mockImplementation(
      async ({ where }: { where: { slug: string } }) =>
        where.slug === 'my-store' ? storeRow : null,
    );

    // Phase 14 overlay: store-1 is on an ACTIVE TRIAL.
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

    prismaServiceStub.storeMembership.findMany.mockResolvedValue([]);

    // Phase 22 — store-1 has WhatsApp ordering enabled (public checkout gate
    // passes and the WhatsApp fallback is usable); other stores do not.
    prismaServiceStub.storeSettings.findUnique.mockImplementation(
      async ({ where }: { where: { storeId: string } }) =>
        where.storeId === 'store-1'
          ? {
              id: 'settings-1',
              storeId: 'store-1',
              settings: { whatsapp: { enabled: true, phoneNumber: '201012345678', label: null } },
              createdAt: new Date('2026-08-15T00:00:00Z'),
              updatedAt: new Date('2026-08-15T00:00:00Z'),
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
      .overrideProvider(StorageProvider)
      .useValue(storageProviderStub)
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  beforeEach(() => {
    txExecuteRaw.mockReset();
    txCartFindFirst.mockReset();
    txCartCreate.mockReset();
    txCartUpdateMany.mockReset();
    txItemFindFirst.mockReset();
    txItemCreate.mockReset();
    txItemUpdateMany.mockReset();
    txItemDeleteMany.mockReset();
    txItemFindMany.mockReset();
    txCustomerFindFirst.mockReset();
    txCustomerCreate.mockReset();
    txReservationCreate.mockReset();
    txReservationUpdateMany.mockReset();
    txInventoryFindUnique.mockReset();
    txMovementCreate.mockReset();
    txOrderFindFirst.mockReset();
    txOrderCount.mockReset();
    txOrderCreate.mockReset();
    txPaymentCreate.mockReset();
    txAttemptCreate.mockReset();
    txPaymentUpdateMany.mockReset();
    txAttemptUpdateMany.mockReset();
    txThemeCreate.mockReset();
    txNavCreate.mockReset();

    prismaServiceStub.cart.findFirst.mockReset();
    prismaServiceStub.cartItem.findFirst.mockReset();
    prismaServiceStub.cartItem.findMany.mockReset();
    prismaServiceStub.customer.findFirst.mockReset();
    prismaServiceStub.productVariant.findUnique.mockReset();
    prismaServiceStub.product.findUnique.mockReset();
    prismaServiceStub.inventory.findUnique.mockReset();
    prismaServiceStub.order.findFirst.mockReset();
    prismaServiceStub.payment.findFirst.mockReset();
    prismaServiceStub.paymentAttempt.findFirst.mockReset();
    prismaServiceStub.themeConfiguration.findUnique.mockReset();
    prismaServiceStub.navigation.findFirst.mockReset();
    prismaServiceStub.media.findFirst.mockReset();

    // cart happy path
    txExecuteRaw.mockResolvedValue(1);
    txCartCreate.mockResolvedValue(cartRow);
    txCartUpdateMany.mockResolvedValue({ count: 1 });
    txCartFindFirst.mockResolvedValue(cartRow);
    txItemFindFirst.mockResolvedValue(null);
    txItemCreate.mockResolvedValue(itemRow);
    txItemUpdateMany.mockResolvedValue({ count: 1 });
    txItemDeleteMany.mockResolvedValue({ count: 1 });
    txItemFindMany.mockResolvedValue([itemWithVariant]);
    prismaServiceStub.cart.findFirst.mockResolvedValue(cartRow);
    prismaServiceStub.cartItem.findFirst.mockResolvedValue(itemRow);
    prismaServiceStub.cartItem.findMany.mockResolvedValue([itemWithVariant]);
    prismaServiceStub.customer.findFirst.mockResolvedValue(null);
    prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
    prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
    prismaServiceStub.inventory.findUnique.mockResolvedValue(inventoryRow);

    // checkout happy path
    txCustomerFindFirst.mockResolvedValue(null);
    txCustomerCreate.mockResolvedValue(customerRow);
    txReservationCreate.mockResolvedValue(reservationRow);
    txReservationUpdateMany.mockResolvedValue({ count: 1 });
    txInventoryFindUnique.mockResolvedValue(inventoryRow);
    txMovementCreate.mockResolvedValue({ id: 'mov-1' });
    txOrderFindFirst.mockResolvedValue(null);
    txOrderCount.mockResolvedValue(0);
    txOrderCreate.mockResolvedValue({ ...orderRow, items: [orderItemRow] });

    // payment happy path
    txPaymentCreate.mockResolvedValue(paymentRow);
    txAttemptCreate.mockResolvedValue(attemptRow);
    txPaymentUpdateMany.mockResolvedValue({ count: 1 });
    txAttemptUpdateMany.mockResolvedValue({ count: 1 });
    prismaServiceStub.order.findFirst.mockResolvedValue(orderWithDetails);
    // payment.findFirst drives four different reads: the idempotency-key replay
    // check and the non-failed guard must return null so initiation proceeds;
    // findById / findLatestForOrder return the payment row.
    prismaServiceStub.payment.findFirst.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.idempotencyKey) return null;
        if (where.status) return null;
        return paymentRow;
      },
    );
    prismaServiceStub.paymentAttempt.findFirst.mockResolvedValue(attemptRow);
    paymentProviderStub.initiatePayment.mockClear();
    storageProviderStub.downloadObject.mockClear();

    // theme + navigation
    prismaServiceStub.themeConfiguration.findUnique.mockResolvedValue(themeRow);
    prismaServiceStub.navigation.findFirst.mockResolvedValue(navigationRow);

    // media proxy (store-scoped)
    prismaServiceStub.media.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; storeId: string } }) =>
        where.id === 'media-1' && where.storeId === 'store-1' ? mediaRow : null,
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function slugHeaders(): Record<string, string> {
    return { 'X-Storefront-Slug': 'my-store' };
  }

  describe('public access (no merchant session required)', () => {
    it('GET /storefront/theme works anonymously', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/theme')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.config.primaryColor).toBe('#2563eb');
    });

    it('GET /storefront/navigation works anonymously', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/navigation')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.name).toBe('Main');
    });

    it('GET /storefront/cart works anonymously', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/cart')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .expect(200);
      expect(res.body.data.guestToken).toBe('guest-token-1');
    });

    it('POST /storefront/checkout works anonymously (creates the order)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/checkout')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .send(checkoutBody)
        .expect(201);
      expect(res.body.data.orderNumber).toBe('ORD-2026-000001');
      expect(res.body.data.grandTotal).toBe(1000);
    });
  });

  describe('store resolution', () => {
    it('fails closed with 404 for an unknown storefront slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/theme')
        .set('X-Storefront-Slug', 'unknown-store')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('fails closed with 404 when no slug header and no subdomain match', async () => {
      await request(app.getHttpServer()).get('/api/v1/storefront/theme').expect(404);
    });
  });

  describe('guest cart lifecycle', () => {
    it('POST /storefront/cart/items creates a guest cart on first use', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/cart/items')
        .set(slugHeaders())
        .send({ variantId: 'variant-1', quantity: 2 })
        .expect(201);
      expect(res.body.data.guestToken).toBe('guest-token-1');
      expect(txCartCreate).toHaveBeenCalled();
    });

    it('PATCH /storefront/cart/items/:itemId updates the quantity', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/storefront/cart/items/item-1')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .send({ quantity: 3 })
        .expect(200);
      expect(res.body.data.items[0].quantity).toBe(2);
      expect(txItemUpdateMany).toHaveBeenCalled();
    });

    it('DELETE /storefront/cart/items/:itemId removes the item (204)', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/storefront/cart/items/item-1')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .expect(204);
      expect(txItemDeleteMany).toHaveBeenCalled();
    });

    it('DELETE /storefront/cart/items clears the cart (204)', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/storefront/cart/items')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .expect(204);
    });

    it('fails closed with 404 for an unknown guest token (no existence leak)', async () => {
      prismaServiceStub.cart.findFirst.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/cart')
        .set(slugHeaders())
        .set('X-Guest-Token', 'other-tenant-token')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects an invalid add-item body with 400 (validation)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/cart/items')
        .set(slugHeaders())
        .send({ variantId: 'variant-1', quantity: 0 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('checkout', () => {
    it('returns 400 VALIDATION_ERROR when required customer fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/checkout')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .send({ customer: { name: 'Ahmed' }, shippingAddress: {} })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when the cart is empty', async () => {
      txItemFindMany.mockResolvedValue([]);
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/checkout')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .send(checkoutBody)
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('payment', () => {
    it('POST /storefront/orders/:orderId/payments requires the Idempotency-Key header', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/order-1/payments')
        .set(slugHeaders())
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates the payment attempt and returns the provider checkout URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/order-1/payments')
        .set(slugHeaders())
        .set('Idempotency-Key', 'pay-key-1')
        .expect(201);
      expect(res.body.data.provider).toBe('paymob');
      expect(res.body.data.status).toBe('PROCESSING');
      expect(res.body.data.providerCheckoutUrl).toContain('accept.paymob.test');
    });

    it('GET /storefront/orders/:orderId/payment returns the current payment state', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-1/payment')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.status).toBe('PROCESSING');
    });
  });

  describe('WhatsApp ordering (Phase 22)', () => {
    it('creates a real WHATSAPP order and returns a wa.me URL', async () => {
      // The checkout transaction mocks are the happy-path ones from
      // beforeEach; the order lookup returns a WHATSAPP-channel order.
      prismaServiceStub.order.findFirst.mockResolvedValue({
        ...orderWithDetails,
        channel: 'WHATSAPP',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/whatsapp')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .set('Idempotency-Key', 'wa-key-1')
        .send({ ...checkoutBody, lang: 'en' })
        .expect(201);

      expect(res.body.data.order.channel).toBe('WHATSAPP');
      expect(res.body.data.order.orderNumber).toBe('ORD-2026-000001');
      expect(res.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/201012345678\?text=/);
      expect(decodeURIComponent(res.body.data.whatsappUrl)).toContain('ORD-2026-000001');
      expect(txOrderCreate).toHaveBeenCalled();
    });

    it('fails closed (no order) when WhatsApp is not configured for the store', async () => {
      prismaServiceStub.storeSettings.findUnique.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/whatsapp')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .send(checkoutBody)
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });

    it('is idempotent: retrying with the same key returns the same order', async () => {
      prismaServiceStub.order.findFirst.mockResolvedValue({
        ...orderWithDetails,
        channel: 'WHATSAPP',
      });

      await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/whatsapp')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .set('Idempotency-Key', 'wa-key-2')
        .send({ ...checkoutBody, lang: 'ar' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/storefront/orders/whatsapp')
        .set(slugHeaders())
        .set('X-Guest-Token', 'guest-token-1')
        .set('Idempotency-Key', 'wa-key-2')
        .send({ ...checkoutBody, lang: 'ar' })
        .expect(201);

      expect(res.body.data.order.orderId).toBe('order-1');
      expect(res.body.data.order.channel).toBe('WHATSAPP');
    });
  });

  describe('order confirmation view + tenant isolation', () => {
    it('without the lookup token returns the PII-free view (no email/phone/address)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-1')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.orderNumber).toBe('ORD-2026-000001');
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.paymentStatus).toBe('PROCESSING');
      // Phase 23 — customer PII is gated behind the lookup token.
      expect(res.body.data.customerEmail).toBeNull();
      expect(res.body.data.customerPhone).toBeNull();
      expect(res.body.data.shippingAddress).toEqual({});
      expect(res.body.data.lookupToken).toBeUndefined();
    });

    it('with the correct lookup token includes the customer PII', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-1?token=lookup-token-1')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.customerEmail).toBe('ahmed@example.com');
      expect(res.body.data.customerPhone).toBe('01000000000');
      expect(res.body.data.shippingAddress.city).toBe('Tanta');
    });

    it('with a wrong lookup token still hides the customer PII', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-1?token=wrong-token-000000000000')
        .set(slugHeaders())
        .expect(200);
      expect(res.body.data.customerEmail).toBeNull();
      expect(res.body.data.customerPhone).toBeNull();
    });

    it('fails closed with 404 for a cross-tenant order id (Merchant B order)', async () => {
      prismaServiceStub.order.findFirst.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/orders/order-b')
        .set(slugHeaders())
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('media content proxy', () => {
    it('streams a store media binary with its content type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/media/media-1/content')
        .set(slugHeaders())
        .expect(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.body.toString()).toBe('bytes');
    });

    it('fails closed with 404 for a cross-tenant media id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storefront/media/media-other/content')
        .set(slugHeaders())
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(storageProviderStub.downloadObject).not.toHaveBeenCalled();
    });
  });
});

