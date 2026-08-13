import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListCustomerOrdersQueryDto } from '../dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from '../dto/list-customers-query.dto';
import { CustomersService } from '../services/customers.service';

/**
 * Customer API (docs/API-SPEC.md §20) — the only Customer endpoints defined by
 * the FINAL API contract:
 *
 *   GET /api/v1/customers                 List Customers
 *   GET /api/v1/customers/:customerId     Get Customer
 *   GET /api/v1/customers/:customerId/orders  Get Customer Orders
 *
 * Thin controller: all business logic lives in CustomersService. Every route
 * is authenticated + tenant-scoped through the global guard chain; the
 * trusted store comes from the resolved tenant context, never from client
 * input. No Customer write endpoints exist: API-SPEC §20 states merchant-side
 * manual Customer creation is not required, and CustomerAddress operations
 * are service-level only (no documented address endpoints).
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  async list(@Query() query: ListCustomersQueryDto) {
    const { items, meta } = await this.customers.list(query);
    return { data: items, meta };
  }

  @Get(':customerId')
  async get(@Param('customerId') customerId: string) {
    const customer = await this.customers.get(customerId);
    return { data: customer };
  }

  @Get(':customerId/orders')
  async listOrders(
    @Param('customerId') customerId: string,
    @Query() query: ListCustomerOrdersQueryDto,
  ) {
    const { items, meta } = await this.customers.listOrders(customerId, query);
    return { data: items, meta };
  }
}
