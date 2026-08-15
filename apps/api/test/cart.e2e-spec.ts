import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CartStatus, ProductStatus, VariantStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '../src/auth/auth-provider';
import { UnauthorizedError } from '../src/common/errors/domain-exceptions';

/**
 * End-to-end coverage of PHASE 6 � Cart.
 *
 * The real guard chain (AuthGuard -> TenantContextGuard -> RolesGuard), the
 * real TenantContextService, TransactionService, RlsTenantBinder,
 * InventoryService and the real CartService are exercised end-to-end against a
 * stubbed PrismaService. Supabase and PostgreSQL are NOT contacted.
 *
 * Covered:
 *   - authentication boundary (401) and tenant resolution for every endpoint
 *   - GET  /cart                          (session resolution, 404, view, lazy expiry)
 *   - POST /cart/items                    (first-use cart creation, guest-token
 *     lookup, duplicate-variant merge, purchasability, availability)
 *   - PATCH  /cart/items/:itemId          (quantity update + revalidation)
 *   - DELETE /cart/items/:itemId          (remove item)
 *   - DELETE /cart/items                  (clear cart)
 *   - validation (400 VALIDATION_ERROR) incl. forbidNonWhitelisted
 *   - tenant isolation (client-supplied X-Store-Id is never an auth source;
 *     unknown guest tokens fail 404 with no existence leak)
 *
 * DB-level guarantees (FK/UNIQUE/CHECK/RLS) are NOT claimed here � they live
 * in the blocked database suite.
 */
describe('Cart (e2e)', () => {
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

  const itemWithVariant = {
    ...itemRow,
    variant: { ...variantRow, product: productRow },
  };

  const cartViewBody = {
    id: 'cart-1',
    status: 'ACTIVE',
    currency: 'EGP',
    guestToken: 'guest-token-1',
    expiresAt: null,
    items: [
      {
        id: 'item-1',
        variantId: 'variant-1',
        productId: 'product-1',
        name: 'Classic T-Shirt',
        sku: null,
        variantStatus: 'ACTIVE',
        quantity: 2,
        unitPrice: 500,
        compareAtPrice: null,
      },
    ],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
  // Transaction-client delegates (used inside TransactionService.runWithTenant).
  const txCartFindFirst = jest.fn();
  const txCartCreate = jest.fn();
  const txCartUpdateMany = jest.fn();
  const txItemFindFirst = jest.fn();
  const txItemCreate = jest.fn();
  const txItemUpdateMany = jest.fn();
  const txItemDeleteMany = jest.fn();
  const txExecuteRaw = jest.fn();

  const txClient = {
    cart: {
      findFirst: txCartFindFirst,
      create: txCartCreate,
      updateMany: txCartUpdateMany,
    },
    cartItem: {
      findFirst: txItemFindFirst,
      create: txItemCreate,
      updateMany: txItemUpdateMany,
      deleteMany: txItemDeleteMany,
    },
    $executeRaw: txExecuteRaw,
  };

  // Shared Prisma reads used by repositories, the real TenantContextService and
  // the real InventoryService.
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
    product: { findUnique: jest.fn() },
    inventory: { findUnique: jest.fn() },
    cart: { findFirst: jest.fn(), findMany: jest.fn() },
    cartItem: { findFirst: jest.fn(), findMany: jest.fn() },
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
    prismaServiceStub.product.findUnique.mockReset();
    prismaServiceStub.inventory.findUnique.mockReset();
    prismaServiceStub.cart.findFirst.mockReset();
    prismaServiceStub.cart.findMany.mockReset();
    prismaServiceStub.cartItem.findFirst.mockReset();
    prismaServiceStub.cartItem.findMany.mockReset();

    txCartFindFirst.mockReset();
    txCartCreate.mockReset();
    txCartUpdateMany.mockReset();
    txItemFindFirst.mockReset();
    txItemCreate.mockReset();
    txItemUpdateMany.mockReset();
    txItemDeleteMany.mockReset();
    txExecuteRaw.mockReset();

    // Defaults: RLS binder ignores $executeRaw results; variant/product exist;
    // inventory row exists with available = 8; items resolve for the cart view.
    txExecuteRaw.mockResolvedValue(1);
    txCartCreate.mockResolvedValue(cartRow);
    txItemFindFirst.mockResolvedValue(null);
    prismaServiceStub.productVariant.findUnique.mockResolvedValue(variantRow);
    prismaServiceStub.product.findUnique.mockResolvedValue(productRow);
    prismaServiceStub.inventory.findUnique.mockResolvedValue(inventoryRow);
    prismaServiceStub.cart.findFirst.mockResolvedValue(cartRow);
    prismaServiceStub.cartItem.findMany.mockResolvedValue([itemWithVariant]);
    prismaServiceStub.cartItem.findFirst.mockResolvedValue(itemRow);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
  describe('authentication boundary', () => {
    it('GET /cart rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /cart/items rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .send({ variantId: 'variant-1', quantity: 2 })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('PATCH /cart/items/:itemId rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/item-1')
        .send({ quantity: 3 })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /cart/items/:itemId rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/cart/items/item-1')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /cart/items rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).delete('/api/v1/cart/items').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('tenant isolation', () => {
    it('rejects a client-supplied store of another tenant (403 FORBIDDEN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Store-Id', 'store-999')
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(prismaServiceStub.cart.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/cart', () => {
    it('returns 404 when no guest token is supplied (no cart yet)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(prismaServiceStub.cart.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown guest token (no existence leak)', async () => {
      prismaServiceStub.cart.findFirst.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'unknown-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(prismaServiceStub.cart.findFirst).toHaveBeenCalledWith({
        where: { storeId: 'store-1', guestToken: 'unknown-token' },
      });
    });

    it('returns the cart resolved from the guest/session context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .expect(200);

      expect(res.body.data).toEqual(cartViewBody);
      expect(prismaServiceStub.cart.findFirst).toHaveBeenCalledWith({
        where: { storeId: 'store-1', guestToken: 'guest-token-1' },
      });
    });

    it('lazily expires a cart whose expiry has passed and returns its EXPIRED state', async () => {
      prismaServiceStub.cart.findFirst
        .mockResolvedValueOnce({
          ...cartRow,
          expiresAt: new Date('2026-08-01T00:00:00Z'),
        })
        .mockResolvedValueOnce({
          ...cartRow,
          expiresAt: new Date('2026-08-01T00:00:00Z'),
          status: CartStatus.EXPIRED,
        });
      txCartUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .expect(200);

      expect(res.body.data.status).toBe('EXPIRED');
      expect(txCartUpdateMany).toHaveBeenCalledWith({
        where: { id: 'cart-1', storeId: 'store-1', status: CartStatus.ACTIVE },
        data: { status: CartStatus.EXPIRED },
      });
    });
  });
  describe('POST /api/v1/cart/items', () => {
    it('creates a guest cart on first use and adds the item (201 + data envelope)', async () => {
      txCartCreate.mockResolvedValue(cartRow);
      txItemFindFirst.mockResolvedValue(null);
      txItemCreate.mockResolvedValue(itemRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 2 })
        .expect(201);

      expect(res.body.data).toEqual(cartViewBody);
      expect(txCartCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            storeId: 'store-1',
            // The guest token is server-generated on first use (never trusted
            // from client input) — assert shape only.
            guestToken: expect.any(String),
            status: CartStatus.ACTIVE,
            // Phase 21 — new carts carry an abandoned-cart expiry (CART_TTL_MS).
            expiresAt: expect.any(Date),
          },
        }),
      );
      expect(txItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { cartId: 'cart-1', variantId: 'variant-1', quantity: 2 },
        }),
      );
    });

    it('adds to the cart selected by the X-Guest-Token header', async () => {
      txCartFindFirst.mockResolvedValue(cartRow);
      txItemFindFirst.mockResolvedValue(null);
      txItemCreate.mockResolvedValue(itemRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ variantId: 'variant-1', quantity: 2 })
        .expect(201);

      expect(txCartCreate).not.toHaveBeenCalled();
      expect(txCartFindFirst).toHaveBeenCalledWith({
        where: { storeId: 'store-1', guestToken: 'guest-token-1' },
      });
      expect(res.body.data.id).toBe('cart-1');
    });

    it('merges quantity for a duplicate variant instead of creating a second line', async () => {
      txCartFindFirst.mockResolvedValue(cartRow);
      txItemFindFirst.mockResolvedValue({ ...itemRow, quantity: 2 });
      txItemUpdateMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ variantId: 'variant-1', quantity: 3 })
        .expect(201);

      expect(txItemUpdateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', cartId: 'cart-1' },
        data: { quantity: 5 },
      });
      expect(txItemCreate).not.toHaveBeenCalled();
    });

    it('returns 404 for a variant outside the current store', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'store-b-variant', quantity: 1 })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txCartCreate).not.toHaveBeenCalled();
    });

    it('rejects an ARCHIVED variant with 409 CONFLICT (not purchasable)', async () => {
      prismaServiceStub.productVariant.findUnique.mockResolvedValue({
        ...variantRow,
        status: VariantStatus.ARCHIVED,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 1 })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
      expect(txCartCreate).not.toHaveBeenCalled();
    });

    it('rejects a variant whose product is not ACTIVE with 409 CONFLICT', async () => {
      prismaServiceStub.product.findUnique.mockResolvedValue({
        ...productRow,
        status: ProductStatus.DRAFT,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 1 })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects with 409 INSUFFICIENT_INVENTORY when availability is too low', async () => {
      prismaServiceStub.inventory.findUnique.mockResolvedValue({
        ...inventoryRow,
        onHandQuantity: 3,
        reservedQuantity: 2,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 5 })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      // The cart create call is rolled back with the failed transaction; the
      // authoritative assertion is that no item line was ever written.
      expect(txItemCreate).not.toHaveBeenCalled();
    });

    it('fails closed with INSUFFICIENT_INVENTORY when no inventory row exists', async () => {
      prismaServiceStub.inventory.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 1 })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      expect(txItemCreate).not.toHaveBeenCalled();
    });

    it('rejects an unknown guest token with 404 (no cart created under client input)', async () => {
      txCartFindFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'unknown-token')
        .send({ variantId: 'variant-1', quantity: 1 })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txCartCreate).not.toHaveBeenCalled();
    });

    it('rejects mutating an EXPIRED cart with 409 STATE_TRANSITION', async () => {
      txCartFindFirst.mockResolvedValue({
        ...cartRow,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });
      txCartUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ variantId: 'variant-1', quantity: 1 })
        .expect(409);

      expect(res.body.error.code).toBe('STATE_TRANSITION');
      expect(txItemCreate).not.toHaveBeenCalled();
    });

    it('rejects invalid payloads with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 0 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a negative quantity with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: -1 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing variantId with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 1 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects undocumented body fields (forbidNonWhitelisted) with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'variant-1', quantity: 1, price: 999, storeId: 'store-1' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(txCartCreate).not.toHaveBeenCalled();
    });
  });
  describe('PATCH /api/v1/cart/items/:itemId', () => {
    it('replaces the quantity and returns the updated cart', async () => {
      prismaServiceStub.cartItem.findFirst.mockResolvedValue(itemRow);
      txItemUpdateMany.mockResolvedValue({ count: 1 });
      prismaServiceStub.cartItem.findMany.mockResolvedValue([{ ...itemWithVariant, quantity: 4 }]);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/item-1')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ quantity: 4 })
        .expect(200);

      expect(res.body.data.items[0].quantity).toBe(4);
      expect(txItemUpdateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', cartId: 'cart-1' },
        data: { quantity: 4 },
      });
    });

    it('returns 404 when the item does not belong to the session cart', async () => {
      prismaServiceStub.cartItem.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/foreign-item')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ quantity: 3 })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(txItemUpdateMany).not.toHaveBeenCalled();
    });

    it('returns 404 without a session token', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/item-1')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 3 })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects an invalid quantity with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/item-1')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ quantity: 0 })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects availability overflow with 409 INSUFFICIENT_INVENTORY', async () => {
      prismaServiceStub.cartItem.findFirst.mockResolvedValue(itemRow);
      prismaServiceStub.inventory.findUnique.mockResolvedValue({
        ...inventoryRow,
        onHandQuantity: 3,
        reservedQuantity: 2,
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/cart/items/item-1')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .send({ quantity: 5 })
        .expect(409);

      expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      expect(txItemUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/cart/items/:itemId', () => {
    it('removes the item and returns 204', async () => {
      txItemDeleteMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .delete('/api/v1/cart/items/item-1')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .expect(204);

      expect(txItemDeleteMany).toHaveBeenCalledWith({
        where: { id: 'item-1', cartId: 'cart-1' },
      });
    });

    it('returns 404 when the item does not exist in the cart', async () => {
      txItemDeleteMany.mockResolvedValue({ count: 0 });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/cart/items/foreign-item')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/cart/items (clear cart)', () => {
    it('clears every item and returns 204', async () => {
      txItemDeleteMany.mockResolvedValue({ count: 2 });

      await request(app.getHttpServer())
        .delete('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Guest-Token', 'guest-token-1')
        .expect(204);

      expect(txItemDeleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
    });

    it('returns 404 without a session token', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/cart/items')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
