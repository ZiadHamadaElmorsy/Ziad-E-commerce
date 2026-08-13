import 'reflect-metadata';
import { OrderStatus } from '@prisma/client';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersService } from '../services/orders.service';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let orders: { list: jest.Mock; get: jest.Mock; updateStatus: jest.Mock };
  let controller: OrdersController;

  const orderView = {
    id: 'order-1',
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
    shippingAddress: { governorate: 'Gharbia' },
    billingAddress: null,
    items: [],
    reservations: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    confirmedAt: null,
    cancelledAt: null,
  };

  beforeEach(() => {
    orders = { list: jest.fn(), get: jest.fn(), updateStatus: jest.fn() };
    controller = new OrdersController(orders as unknown as OrdersService);
  });

  it('GET /orders delegates the query and wraps items + meta', async () => {
    orders.list.mockResolvedValue({
      items: [orderView],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const query = new ListOrdersQueryDto();

    const result = await controller.list(query);

    expect(orders.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({
      data: [orderView],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('GET /orders/:orderId delegates the id and wraps the order', async () => {
    orders.get.mockResolvedValue(orderView);

    const result = await controller.get('order-1');

    expect(orders.get).toHaveBeenCalledWith('order-1');
    expect(result).toEqual({ data: orderView });
  });

  it('PATCH /orders/:orderId/status delegates id + dto and wraps the updated order', async () => {
    const updated = { ...orderView, status: OrderStatus.CONFIRMED };
    orders.updateStatus.mockResolvedValue(updated);
    const dto = new UpdateOrderStatusDto();
    dto.status = OrderStatus.CONFIRMED;

    const result = await controller.updateStatus('order-1', dto);

    expect(orders.updateStatus).toHaveBeenCalledWith('order-1', dto);
    expect(result).toEqual({ data: updated });
  });
});
