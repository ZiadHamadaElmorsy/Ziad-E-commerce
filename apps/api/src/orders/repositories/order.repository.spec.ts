import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderRepository } from './order.repository';

describe('OrderRepository', () => {
  let prisma: { order: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock } };
  let repository: OrderRepository;

  const tx = {
    order: { findFirst: jest.fn(), updateMany: jest.fn() },
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
      order: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    (tx.order.findFirst as jest.Mock).mockReset();
    (tx.order.updateMany as jest.Mock).mockReset();
    repository = new OrderRepository(prisma as unknown as PrismaService);
  });

  it('findWithDetails is a store-scoped findFirst with items + reservations', async () => {
    const withDetails = { ...orderRow, items: [itemRow], reservations: [reservationRow] };
    prisma.order.findFirst.mockResolvedValue(withDetails);

    const result = await repository.findWithDetails('store-1', 'order-1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', storeId: 'store-1' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        reservations: true,
      },
    });
    expect(result).toBe(withDetails);
  });

  it('findWithDetailsTx is a store-scoped findFirst on the transaction client', async () => {
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

  it('findMany applies only the documented filters (status, search, dates) store-scoped', async () => {
    prisma.order.findMany.mockResolvedValue([orderRow]);

    await repository.findMany('store-1', {
      status: OrderStatus.PENDING,
      search: 'ORD-2026',
      dateFrom: new Date('2026-08-01T00:00:00Z'),
      dateTo: new Date('2026-08-31T23:59:59Z'),
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        status: OrderStatus.PENDING,
        OR: [
          { orderNumber: { contains: 'ORD-2026', mode: 'insensitive' } },
          { customerEmail: { contains: 'ORD-2026', mode: 'insensitive' } },
          { customerPhone: { contains: 'ORD-2026', mode: 'insensitive' } },
        ],
        createdAt: {
          gte: new Date('2026-08-01T00:00:00Z'),
          lte: new Date('2026-08-31T23:59:59Z'),
        },
      },
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('count applies the same store-scoped filter', async () => {
    prisma.order.count.mockResolvedValue(5);

    const result = await repository.count('store-1', {
      status: OrderStatus.SHIPPED,
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: OrderStatus.SHIPPED },
    });
    expect(result).toBe(5);
  });

  it('transitionStatus is a guarded conditional update (WHERE status = from)', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    const confirmedAt = new Date('2026-08-13T10:00:00Z');

    const result = await repository.transitionStatus(
      tx as never,
      'store-1',
      'order-1',
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      { confirmedAt },
    );

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.PENDING },
      data: { status: OrderStatus.CONFIRMED, confirmedAt },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('transitionStatus writes cancelled_at only for -> CANCELLED', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    const cancelledAt = new Date('2026-08-13T10:00:00Z');

    await repository.transitionStatus(
      tx as never,
      'store-1',
      'order-1',
      OrderStatus.PENDING,
      OrderStatus.CANCELLED,
      { cancelledAt },
    );

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', storeId: 'store-1', status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED, cancelledAt },
    });
  });

  it('transitionStatus reports 0 rows when the guarded update matched nothing', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.transitionStatus(
      tx as never,
      'store-1',
      'order-1',
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      {},
    );

    expect(result).toEqual({ count: 0 });
  });
});
