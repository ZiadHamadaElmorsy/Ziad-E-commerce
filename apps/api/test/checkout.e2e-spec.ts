import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CartStatus, OrderStatus, Prisma, ProductStatus, VariantStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 7 — Checkout.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard), the
 * real TenantContextService, TransactionService, RlsTenantBinder,
 * InventoryReservationService and the real CheckoutService are exercised
 * end-to-end against a stubbed PrismaService. Supabase and PostgreSQL are NOT
 * contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution (403) for POST /checkout
 *   - valid checkout -> 201 with the documented response contract
 *   - missing / unknown / expired / completed / empty cart
 *   - archived variant and non-active product revalidation
 *   - insufficient inventory (guarded reserve applies zero rows)
 *   - cross-tenant isolation (guest token only selects a cart inside the store)
 *   - request validation (400 VALIDATION_ERROR incl. forbidNonWhitelisted)
 *   - idempotent retry (same Idempotency-Key returns the same order, no duplicate)
 *   - failed order creation maps deterministically (404 NOT_FOUND)
 *
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS/concurrency) are NOT claimed here —
 * they live in the blocked database suite.
 */
describe('Checkout (e2e)', () => {
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

  const productRow = {
    id: 'product-1',
    storeId: 'store-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    status: ProductStatus.ACTIVE,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
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

  const cartRow = {
    id: 'cart-1',
    storeId: 'store-1',
    customerId: null,
    guestToken: 'guest-token-1',
    status: CartStatus.ACTIVE,
    currency: 'EGP',
    expiresAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const itemRow = {
    id: 'item-1',
    cartId: 'cart-1',
    variantId: 'variant-1',
    quantity: 2,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const itemWithVariant = { ...itemRow, variant: { ...variantRow, product: productRow } };

  const customerRow = {
    id: 'customer-1',
    storeId: 'store-1',
    email: 'ahmed@example.com',
    phone: '01000000000',
    firstName: 'Ahmed',
    lastName: 'Ali',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
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
    idempotencyKey: 'key-1',
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
    skuSnapshot: null,
    unitPrice: 500n,
    quantity: 2,
    lineTotal: 1000n,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  };

  const orderWithItems = { ...orderRow, items: [orderItemRow] };
  const orderWithDetails = { ...orderWithItems, reservations: [reservationRow] };

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

  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  const txExecuteRaw = jest.fn();
  const txCartFindFirst = jest.fn();
  const txCartUpdateMany = jest.fn();
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

  const txClient = {
    $executeRaw: txExecuteRaw,
    cart: { findFirst: txCartFindFirst, updateMany: txCartUpdateMany },
    cartItem: { findMany: txItemFindMany },
    customer: { findFirst: txCustomerFindFirst, create: txCustomerCreate },
    inventoryReservation: { create: txReservationCreate, updateMany: txReservationUpdateMany },
    inventory: { findUnique: txInventoryFindUnique },
    inventoryMovement: { create: txMovementCreate },
    order: { findFirst: txOrderFindFirst, count: txOrderCount, create: txOrderCreate },
  };

  // Shared Prisma reads used by repositories and the real TenantContextService.
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
    order: { findFirst: jest.fn() },
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
    txCartFindFirst.mockReset();
    txCartUpdateMany.mockReset();
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

    // Happy-path defaults (RLS binder ignores $executeRaw results; cart + items
    // resolve; a new customer is created; reservation + order creation succeed).
    txExecuteRaw.mockResolvedValue(1);
    txCartFindFirst.mockResolvedValue(cartRow);
    txCartUpdateMany.mockResolvedValue({ count: 1 });
    txItemFindMany.mockResolvedValue([itemWithVariant]);
    txCustomerFindFirst.mockResolvedValue(null);
    txCustomerCreate.mockResolvedValue(customerRow);
    txReservationCreate.mockResolvedValue(reservationRow);
    txReservationUpdateMany.mockResolvedValue({ count: 1 });
    txInventoryFindUnique.mockResolvedValue(inventoryRow);
    txMovementCreate.mockResolvedValue({ id: 'mov-1' });
    txOrderFindFirst.mockResolvedValue(null);
    txOrderCount.mockResolvedValue(0);
    txOrderCreate.mockResolvedValue(orderWithItems);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function postCheckout(overrides: {
    body?: unknown;
    token?: string;
    guestToken?: string;
    idempotencyKey?: string;
    storeId?: string;
  }) {
    let req = request(app.getHttpServer()).post('/api/v1/checkout');
    if (overrides.token !== undefined) {
      req = req.set('Authorization', `Bearer ${overrides.token}`);
    }
    if (overrides.guestToken !== undefined) {
      req = req.set('X-Guest-Token', overrides.guestToken);
    }
    if (overrides.idempotencyKey !== undefined) {
      req = req.set('Idempotency-Key', overrides.idempotencyKey);
    }
    if (overrides.storeId !== undefined) {
      req = req.set('X-Store-Id', overrides.storeId);
    }
    return req.send(overrides.body ?? checkoutBody);
  }

  describe('authentication boundary', () => {
    it('POST /checkout rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .send(checkoutBody)
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant isolation', () => {
    it('rejects a client-supplied store of another tenant (403 FORBIDDEN)', async () => {
      const res = await postCheckout({ token: 'valid-token', storeId: 'store-b' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });

    it('an unknown guest token resolves to 404 and never reaches order creation', async () => {
      txCartFindFirst.mockResolvedValue(null);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'other-store-token',
      }).expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });
  });

  describe('valid checkout', () => {
    it('returns 201 with the documented checkout result contract', async () => {
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(201);

      expect(res.body.data).toEqual({
        orderId: 'order-1',
        orderNumber: 'ORD-2026-000001',
        status: 'PENDING',
        currency: 'EGP',
        subtotal: 1000,
        discountTotal: 0,
        shippingTotal: 0,
        taxTotal: 0,
        grandTotal: 1000,
        customerId: 'customer-1',
        customerEmail: 'ahmed@example.com',
        customerPhone: '01000000000',
        items: [
          {
            productId: 'product-1',
            variantId: 'variant-1',
            productName: 'Classic T-Shirt',
            variantName: 'Classic T-Shirt',
            sku: null,
            unitPrice: 500,
            quantity: 2,
            lineTotal: 1000,
          },
        ],
        reservations: [{ id: 'res-1', variantId: 'variant-1', quantity: 2, status: 'ACTIVE' }],
        createdAt: '2026-08-12T00:00:00.000Z',
      });

      // The atomic sequence: cart lookup -> reserve -> order -> link -> complete.
      expect(txReservationCreate).toHaveBeenCalled();
      expect(txOrderCreate).toHaveBeenCalled();
      expect(txReservationUpdateMany).toHaveBeenCalled();
      expect(txCartUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cart-1', storeId: 'store-1', status: 'ACTIVE' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('reuses an existing customer by email instead of creating one', async () => {
      txCustomerFindFirst.mockResolvedValue(customerRow);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(201);

      expect(txCustomerCreate).not.toHaveBeenCalled();
      expect(res.body.data.customerId).toBe('customer-1');
    });
  });

  describe('cart lifecycle', () => {
    it('returns 404 when the X-Guest-Token header is missing', async () => {
      const res = await postCheckout({ token: 'valid-token' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 STATE_TRANSITION for an expired cart', async () => {
      txCartFindFirst.mockResolvedValue({ ...cartRow, status: CartStatus.EXPIRED });

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(409);
      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });

    it('returns 409 STATE_TRANSITION for a completed cart', async () => {
      txCartFindFirst.mockResolvedValue({ ...cartRow, status: CartStatus.COMPLETED });

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(409);
      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });

    it('returns 400 BAD_REQUEST for an empty cart', async () => {
      txItemFindMany.mockResolvedValue([]);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });
  });

  describe('revalidation', () => {
    it('rejects an ARCHIVED variant with 409 CONFLICT', async () => {
      txItemFindMany.mockResolvedValue([
        {
          ...itemRow,
          variant: { ...variantRow, product: productRow, status: VariantStatus.ARCHIVED },
        },
      ]);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });

    it('rejects a non-ACTIVE product with 409 CONFLICT', async () => {
      txItemFindMany.mockResolvedValue([
        {
          ...itemRow,
          variant: {
            ...variantRow,
            product: { ...productRow, status: ProductStatus.DRAFT },
          },
        },
      ]);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns 409 INSUFFICIENT_INVENTORY when the guarded reserve applies zero rows', async () => {
      txExecuteRaw.mockResolvedValue(0); // guardedReserve count = 0

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      expect(txOrderCreate).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects a missing customer name with 400 VALIDATION_ERROR', async () => {
      const body = { ...checkoutBody, customer: { ...checkoutBody.customer, name: '' } };
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        body,
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing phone with 400 VALIDATION_ERROR', async () => {
      const body = { ...checkoutBody, customer: { ...checkoutBody.customer, phone: '' } };
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        body,
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid email with 400 VALIDATION_ERROR', async () => {
      const body = {
        ...checkoutBody,
        customer: { ...checkoutBody.customer, email: 'not-an-email' },
      };
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        body,
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects undocumented fields (forbidNonWhitelisted)', async () => {
      const body = { ...checkoutBody, grandTotal: 0 };
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        body,
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing shipping governorate with 400 VALIDATION_ERROR', async () => {
      const body = {
        ...checkoutBody,
        shippingAddress: { ...checkoutBody.shippingAddress, governorate: '' },
      };
      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        body,
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('idempotency', () => {
    it('returns the same order for a repeated Idempotency-Key without creating a duplicate', async () => {
      // First request: no existing order (pre-check returns null) -> full flow.
      // Retry: pre-check returns the winner's order -> returns it, no writes.
      let precheckCalls = 0;
      txOrderFindFirst.mockImplementation(async (args: { include?: unknown }) => {
        if (args.include) {
          return orderWithDetails; // findWithDetailsTx
        }
        precheckCalls += 1;
        return precheckCalls === 1 ? null : orderRow;
      });

      const first = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        idempotencyKey: 'key-1',
      }).expect(201);

      const second = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
        idempotencyKey: 'key-1',
      }).expect(201);

      expect(first.body.data.orderId).toBe('order-1');
      expect(second.body.data.orderId).toBe('order-1');
      expect(txOrderCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('failed transaction', () => {
    it('maps an order-creation failure deterministically (P2025 -> 404 NOT_FOUND)', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '6.19.3',
      });
      txOrderCreate.mockRejectedValue(p2025);

      const res = await postCheckout({
        token: 'valid-token',
        guestToken: 'guest-token-1',
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
