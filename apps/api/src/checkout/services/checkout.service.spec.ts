import { ConfigService } from '@nestjs/config';
import {
  CartStatus,
  OrderChannel,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  ProductStatus,
  ReservationStatus,
  VariantStatus,
} from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  BadRequestError,
  ConflictError,
  InsufficientInventoryError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CartItemRepository } from '../../cart/repositories/cart-item.repository';
import { CartRepository } from '../../cart/repositories/cart.repository';
import { CustomerRepository } from '../../customer/repositories/customer.repository';
import { InventoryReservationRepository } from '../../inventory/repositories/inventory-reservation.repository';
import { InventoryReservationService } from '../../inventory/services/inventory-reservation.service';
import { CheckoutRequestDto } from '../dto/checkout-request.dto';
import { OrderRepository } from '../repositories/order.repository';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let carts: {
    findByGuestTokenTx: jest.Mock;
    transitionStatus: jest.Mock;
    complete: jest.Mock;
  };
  let items: { findManyByCartTx: jest.Mock };
  let reservations: { reserveTx: jest.Mock };
  let reservationRepository: { linkOrderForCart: jest.Mock };
  let customers: { findByEmailTx: jest.Mock; create: jest.Mock };
  let orders: {
    findByStoreAndIdempotencyKeyTx: jest.Mock;
    findWithDetailsTx: jest.Mock;
    create: jest.Mock;
    findByStoreAndIdempotencyKey: jest.Mock;
  };
  let transaction: { runWithTenant: jest.Mock };
  let service: CheckoutService;

  const tx = {
    order: { count: jest.fn() },
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
    status: ReservationStatus.ACTIVE,
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
    shippingAddressSnapshot: { governorate: 'Gharbia' },
    billingAddressSnapshot: null,
    idempotencyKey: null,
    lookupToken: 'lookup-token-1',
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

  function buildDto(): CheckoutRequestDto {
    const dto = new CheckoutRequestDto();
    dto.customer = { name: 'Ahmed Ali', phone: '01000000000', email: 'ahmed@example.com' };
    dto.shippingAddress = {
      governorate: 'Gharbia',
      city: 'Tanta',
      addressLine: 'Street 5',
      building: '12',
      apartment: '3',
    };
    return dto;
  }

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    carts = {
      findByGuestTokenTx: jest.fn(),
      transitionStatus: jest.fn(),
      complete: jest.fn(),
    };
    items = { findManyByCartTx: jest.fn() };
    reservations = { reserveTx: jest.fn() };
    reservationRepository = { linkOrderForCart: jest.fn() };
    customers = { findByEmailTx: jest.fn(), create: jest.fn() };
    orders = {
      findByStoreAndIdempotencyKeyTx: jest.fn(),
      findWithDetailsTx: jest.fn(),
      create: jest.fn(),
      findByStoreAndIdempotencyKey: jest.fn(),
    };
    transaction = {
      runWithTenant: jest
        .fn()
        .mockImplementation(async (_storeId: string, work: (t: unknown) => Promise<unknown>) =>
          work(tx),
        ),
    };
    tx.order.count.mockReset().mockResolvedValue(0);

    service = new CheckoutService(
      requestContext as unknown as RequestContextService,
      carts as unknown as CartRepository,
      items as unknown as CartItemRepository,
      reservations as unknown as InventoryReservationService,
      reservationRepository as unknown as InventoryReservationRepository,
      customers as unknown as CustomerRepository,
      orders as unknown as OrderRepository,
      transaction as unknown as TransactionService,
      { get: jest.fn().mockReturnValue(30 * 60 * 1000) } as unknown as ConfigService,
    );
  });

  function withActiveTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function stubHappyPath(
    overrides: {
      cart?: unknown;
      itemsList?: unknown[];
      customer?: unknown | null;
      order?: unknown;
    } = {},
  ): void {
    carts.findByGuestTokenTx.mockResolvedValue(overrides.cart ?? cartRow);
    items.findManyByCartTx.mockResolvedValue(overrides.itemsList ?? [itemWithVariant]);
    customers.findByEmailTx.mockResolvedValue(overrides.customer ?? null);
    customers.create.mockResolvedValue(overrides.customer ?? customerRow);
    reservations.reserveTx.mockResolvedValue(reservationRow);
    orders.create.mockResolvedValue(overrides.order ?? orderWithItems);
    reservationRepository.linkOrderForCart.mockResolvedValue({ count: 1 });
    carts.complete.mockResolvedValue({ count: 1 });
  }

  const expectedView = {
    orderId: 'order-1',
    orderNumber: 'ORD-2026-000001',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal: 1000,
    customerId: 'customer-1',
    customerEmail: 'ahmed@example.com',
    customerPhone: '01000000000',
    lookupToken: 'lookup-token-1',
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
    reservations: [
      { id: 'res-1', variantId: 'variant-1', quantity: 2, status: ReservationStatus.ACTIVE },
    ],
    createdAt: '2026-08-12T00:00:00.000Z',
  };

  describe('tenant context', () => {
    it('requires a resolved store (TENANT_CONTEXT_REQUIRED)', async () => {
      requestContext.getCurrent.mockReturnValue({ requestId: 'req-1' });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('rejects checkout when the store is not ACTIVE (CONFLICT)', async () => {
      requestContext.getCurrent.mockReturnValue({
        requestId: 'req-1',
        store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'DISABLED' },
      });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });
  });

  describe('cart resolution', () => {
    it('fails with NOT_FOUND when no guest token is provided', async () => {
      withActiveTenant();

      await expect(service.createCheckout(buildDto(), undefined)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND for an unknown guest token (no existence leak)', async () => {
      withActiveTenant();
      carts.findByGuestTokenTx.mockResolvedValue(null);

      await expect(service.createCheckout(buildDto(), 'unknown-token')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('rejects an EXPIRED cart with STATE_TRANSITION', async () => {
      withActiveTenant();
      carts.findByGuestTokenTx.mockResolvedValue({ ...cartRow, status: CartStatus.EXPIRED });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        StateTransitionError,
      );
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('rejects a COMPLETED cart with STATE_TRANSITION', async () => {
      withActiveTenant();
      carts.findByGuestTokenTx.mockResolvedValue({ ...cartRow, status: CartStatus.COMPLETED });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        StateTransitionError,
      );
    });

    it('lazily expires a due ACTIVE cart then rejects with STATE_TRANSITION', async () => {
      withActiveTenant();
      carts.findByGuestTokenTx.mockResolvedValue({
        ...cartRow,
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      });
      carts.transitionStatus.mockResolvedValue({ count: 1 });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        StateTransitionError,
      );
      expect(carts.transitionStatus).toHaveBeenCalledWith(
        tx,
        'store-1',
        'cart-1',
        CartStatus.ACTIVE,
        CartStatus.EXPIRED,
      );
    });

    it('rejects an empty cart with BAD_REQUEST', async () => {
      withActiveTenant();
      stubHappyPath({ itemsList: [] });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(orders.create).not.toHaveBeenCalled();
    });
  });

  describe('line revalidation', () => {
    it('rejects a cart item whose product is not ACTIVE (CONFLICT)', async () => {
      withActiveTenant();
      stubHappyPath({
        itemsList: [
          {
            ...itemRow,
            variant: {
              ...variantRow,
              product: { ...productRow, status: ProductStatus.DRAFT },
            },
          },
        ],
      });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(reservations.reserveTx).not.toHaveBeenCalled();
    });

    it('rejects a cart item whose variant is ARCHIVED (CONFLICT)', async () => {
      withActiveTenant();
      stubHappyPath({
        itemsList: [
          {
            ...itemRow,
            variant: { ...variantRow, product: productRow, status: VariantStatus.ARCHIVED },
          },
        ],
      });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('fails closed with NOT_FOUND for a cross-store variant (defense-in-depth)', async () => {
      withActiveTenant();
      stubHappyPath({
        itemsList: [
          {
            ...itemRow,
            variant: { ...variantRow, storeId: 'store-b', product: productRow },
          },
        ],
      });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('fails closed with NOT_FOUND when the variant include is empty (RLS/vanished)', async () => {
      withActiveTenant();
      stubHappyPath({ itemsList: [{ ...itemRow, variant: null }] });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('propagates INSUFFICIENT_INVENTORY when the guarded reserve applies zero rows', async () => {
      withActiveTenant();
      stubHappyPath();
      reservations.reserveTx.mockRejectedValue(
        new InsufficientInventoryError('Insufficient inventory available for this reservation.'),
      );

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        InsufficientInventoryError,
      );
      expect(orders.create).not.toHaveBeenCalled();
    });
  });

  describe('successful checkout', () => {
    it('creates a new customer, reserves, creates the order, links and completes the cart', async () => {
      withActiveTenant();
      stubHappyPath();

      const result = await service.createCheckout(buildDto(), 'guest-token-1');

      expect(result).toEqual(expectedView);
      expect(customers.create).toHaveBeenCalledWith(tx, {
        storeId: 'store-1',
        email: 'ahmed@example.com',
        phone: '01000000000',
        firstName: 'Ahmed',
        lastName: 'Ali',
      });
      expect(reservations.reserveTx).toHaveBeenCalledWith(
        tx,
        'store-1',
        'variant-1',
        2,
        { cartId: 'cart-1' },
        expect.any(Date),
      );
      expect(orders.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
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
          shippingAddressSnapshot: {
            governorate: 'Gharbia',
            city: 'Tanta',
            addressLine: 'Street 5',
            building: '12',
            apartment: '3',
          },
          billingAddressSnapshot: Prisma.DbNull,
          idempotencyKey: null,
        }),
        [
          expect.objectContaining({
            productId: 'product-1',
            variantId: 'variant-1',
            productNameSnapshot: 'Classic T-Shirt',
            variantNameSnapshot: 'Classic T-Shirt',
            skuSnapshot: null,
            unitPrice: 500n,
            quantity: 2,
            lineTotal: 1000n,
          }),
        ],
      );
      expect(reservationRepository.linkOrderForCart).toHaveBeenCalledWith(
        tx,
        'store-1',
        'cart-1',
        'order-1',
      );
      expect(carts.complete).toHaveBeenCalledWith(tx, 'store-1', 'cart-1');
    });

    it('creates a COD order with paymentMethod=COD and paymentStatus=UNPAID (Phase 27 — Part 6/7)', async () => {
      withActiveTenant();
      stubHappyPath();

      await service.createCheckout(buildDto(), 'guest-token-1', undefined, undefined, undefined, OrderChannel.ONLINE_PAYMENT, OrderPaymentMethod.COD);

      // COD orders are created UNPAID (Part 6) — the order being created does
      // NOT mean it is paid; the carrier collects the cash on delivery.
      expect(orders.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          paymentMethod: OrderPaymentMethod.COD,
          paymentStatus: OrderPaymentStatus.UNPAID,
        }),
        expect.any(Array),
      );
    });

    it('reuses an existing store-scoped customer by email instead of creating one', async () => {
      withActiveTenant();
      stubHappyPath({ customer: customerRow });

      const result = await service.createCheckout(buildDto(), 'guest-token-1');

      expect(customers.findByEmailTx).toHaveBeenCalledWith(tx, 'store-1', 'ahmed@example.com');
      expect(customers.create).not.toHaveBeenCalled();
      expect(result.orderId).toBe('order-1');
    });

    it('creates a customer without an email when none is provided (guest)', async () => {
      withActiveTenant();
      const dto = buildDto();
      dto.customer.email = undefined;
      stubHappyPath({
        customer: { ...customerRow, email: null },
        order: { ...orderWithItems, customerEmail: null },
      });

      const result = await service.createCheckout(dto, 'guest-token-1');

      expect(customers.findByEmailTx).not.toHaveBeenCalled();
      expect(customers.create).toHaveBeenCalledWith(tx, {
        storeId: 'store-1',
        phone: '01000000000',
        firstName: 'Ahmed',
        lastName: 'Ali',
      });
      expect(result.customerEmail).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('short-circuits when an order already exists for the idempotency key', async () => {
      withActiveTenant();
      stubHappyPath();
      orders.findByStoreAndIdempotencyKeyTx.mockResolvedValue(orderRow);
      orders.findWithDetailsTx.mockResolvedValue(orderWithDetails);

      const result = await service.createCheckout(buildDto(), 'guest-token-1', 'key-1');

      expect(orders.findByStoreAndIdempotencyKeyTx).toHaveBeenCalledWith(tx, 'store-1', 'key-1');
      // No writes at all on the retry path.
      expect(customers.create).not.toHaveBeenCalled();
      expect(reservations.reserveTx).not.toHaveBeenCalled();
      expect(orders.create).not.toHaveBeenCalled();
      expect(carts.complete).not.toHaveBeenCalled();
      expect(result.orderId).toBe('order-1');
    });

    it('returns the existing order when a concurrent request won the idempotency race', async () => {
      withActiveTenant();
      stubHappyPath();
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
      // The whole transaction rolled back after the UNIQUE collision.
      transaction.runWithTenant.mockRejectedValueOnce(p2002);
      orders.findByStoreAndIdempotencyKey.mockResolvedValue(orderWithDetails);

      const result = await service.createCheckout(buildDto(), 'guest-token-1', 'key-1');

      expect(orders.findByStoreAndIdempotencyKey).toHaveBeenCalledWith('store-1', 'key-1');
      expect(result.orderId).toBe('order-1');
    });
  });

  describe('retry and rollback', () => {
    it('retries the whole transaction on an order-number collision (UNIQUE store_id, order_number)', async () => {
      withActiveTenant();
      stubHappyPath();
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
      transaction.runWithTenant.mockRejectedValueOnce(p2002);

      const result = await service.createCheckout(buildDto(), 'guest-token-1');

      expect(transaction.runWithTenant).toHaveBeenCalledTimes(2);
      expect(result.orderId).toBe('order-1');
    });

    it('rolls back (STATE_TRANSITION) when a concurrent request already completed the cart', async () => {
      withActiveTenant();
      stubHappyPath();
      carts.complete.mockResolvedValue({ count: 0 });

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        StateTransitionError,
      );
    });

    it('maps a Prisma P2025 from order creation to NOT_FOUND (no partial state leaks)', async () => {
      withActiveTenant();
      stubHappyPath();
      const p2025 = new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '6.19.3',
      });
      transaction.runWithTenant.mockRejectedValueOnce(p2025);

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('gives up with CONFLICT after bounded retries on persistent unique collisions', async () => {
      withActiveTenant();
      stubHappyPath();
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
      transaction.runWithTenant.mockRejectedValue(p2002);

      await expect(service.createCheckout(buildDto(), 'guest-token-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
      // 5 attempts, then the final ConflictError is thrown directly (not mapped).
      expect(transaction.runWithTenant).toHaveBeenCalledTimes(5);
    });
  });
});
