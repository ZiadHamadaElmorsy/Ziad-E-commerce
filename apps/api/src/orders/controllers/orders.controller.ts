import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersService } from '../services/orders.service';

/**
 * Order API (docs/API-SPEC.md §23) — the exact documented endpoints:
 *
 *   GET   /api/v1/orders                   List Orders
 *   GET   /api/v1/orders/:orderId          Get Order
 *   PATCH /api/v1/orders/:orderId/status   Update Order Status
 *
 * Thin controller: all business logic lives in OrdersService. Every route is
 * authenticated + tenant-scoped through the global guard chain; the trusted
 * store comes from the resolved tenant context, never from client input.
 *
 * No undocumented Order endpoints are exposed: no manual order creation
 * (Checkout owns creation), no deletion, and no payment/refund/shipping
 * endpoints — those belong to later phases.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(@Query() query: ListOrdersQueryDto) {
    const { items, meta } = await this.orders.list(query);
    return { data: items, meta };
  }

  @Get(':orderId')
  async get(@Param('orderId') orderId: string) {
    const order = await this.orders.get(orderId);
    return { data: order };
  }

  @Patch(':orderId/status')
  async updateStatus(@Param('orderId') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    const order = await this.orders.updateStatus(orderId, dto);
    return { data: order };
  }
}
