import {
  OrderChannel,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderInput, CreateOrderItemInput, OrderRepository } from './order.repository';

describe('OrderRepository', () => {
  let prisma: { order: { findFirst: jest.Mock; create: jest.Mock } };
  let repository: OrderRepository;

  /** The transaction client used by the tx methods. */
  const tx = { order: { findFirst: jest.fn(), create: jest.fn() } };

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
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  const itemRow = {
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

  beforeEach(() => {
    prisma = {
      order: { findFirst: jest.fn(), create: jest.fn() },
    };
    (tx.order.findFirst as jest.Mock).mockReset();
    (tx.order.create as jest.Mock).mockReset();
    repository = new OrderRepository(prisma as unknown as PrismaService);
  });

  it('findByStoreAndIdempotencyKeyTx is a store-scoped findFirst', async () => {
    tx.order.findFirst.mockResolvedValue(orderRow);

    const result = await repository.findByStoreAndIdempotencyKeyTx(tx as never, 'store-1', 'key-1');

    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', idempotencyKey: 'key-1' },
    });
    expect(result).toBe(orderRow);
  });

  it('create persists the order with nested snapshot items', async () => {
    const created = { ...orderRow, items: [itemRow] };
    tx.order.create.mockResolvedValue(created);

    const data: CreateOrderInput = {
      storeId: 'store-1',
      orderNumber: 'ORD-2026-000001',
      channel: OrderChannel.ONLINE_PAYMENT,
      paymentMethod: OrderPaymentMethod.ONLINE,
      paymentStatus: OrderPaymentStatus.UNPAID,
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
      billingAddressSnapshot: null as never,
      idempotencyKey: 'key-1',
      lookupToken: 'lookup-token-1',
    };
    const items: CreateOrderItemInput[] = [
      {
        productId: 'product-1',
        variantId: 'variant-1',
        productNameSnapshot: 'Classic T-Shirt',
        variantNameSnapshot: 'Classic T-Shirt',
        skuSnapshot: null,
        unitPrice: 500n,
        quantity: 2,
        lineTotal: 1000n,
      },
    ];

    const result = await repository.create(tx as never, data, items);

    expect(tx.order.create).toHaveBeenCalledWith({
      data: {
        ...data,
        items: { create: items },
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    expect(result).toBe(created);
  });

  it('findByStoreAndIdempotencyKey loads the order with items + reservations (store-scoped)', async () => {
    const withDetails = { ...orderRow, items: [itemRow], reservations: [reservationRow] };
    prisma.order.findFirst.mockResolvedValue(withDetails);

    const result = await repository.findByStoreAndIdempotencyKey('store-1', 'key-1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1', idempotencyKey: 'key-1' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        reservations: true,
      },
    });
    expect(result).toBe(withDetails);
  });

  it('findWithDetailsTx loads the order by id + store with items + reservations', async () => {
    const withDetails = { ...orderRow, items: [itemRow], reservations: [reservationRow] };
    tx.order.findFirst.mockResolvedValue(withDetails);

    const result = await repository.findWithDetailsTx(tx as never, 'store-1', 'order-1');

    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', storeId: 'store-1' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        reservations: true,
      },
    });
    expect(result).toBe(withDetails);
  });
});
