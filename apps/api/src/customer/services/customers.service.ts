import { Injectable } from '@nestjs/common';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import {
  buildPaginationMeta,
  CustomerOrderView,
  CustomerView,
  PaginatedView,
  toCustomerOrderView,
  toCustomerView,
} from '../customer.types';
import { ListCustomerOrdersQueryDto } from '../dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from '../dto/list-customers-query.dto';
import { CustomerListFilter, CustomerRepository } from '../repositories/customer.repository';

/**
 * Customer application service (docs/API-SPEC.md §20).
 *
 * Business rules implemented here (docs/DOMAIN-MODEL.md §9.1, docs/DATABASE.md
 * §7.12/§11/§18.2):
 *
 * - Customer ownership is ALWAYS the trusted tenant context (membership ->
 *   store); client-supplied ids are never an authorization source. Every
 *   repository query is store-scoped and RLS is the final defense.
 * - Customers have NO lifecycle status (DATABASE.md §18.2 — no status
 *   column). Nothing in this phase introduces one.
 * - Merchant-side manual Customer creation is NOT required (API-SPEC §20),
 *   so no write endpoints are exposed. Customer creation belongs to checkout
 *   (future phase); the repository write contract is prepared for it.
 * - Missing/foreign customers fail closed with NOT_FOUND (existence of a
 *   cross-tenant customer is never leaked).
 * - `GET /customers/:customerId/orders` is a read-only customer-order-history
 *   projection over the FINAL `orders` table. It implements NO Order domain
 *   logic (creation/status/payment/snapshots belong to the Orders phase);
 *   order customer/address information will be snapshotted by that phase.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly customers: CustomerRepository,
  ) {}

  async list(query: ListCustomersQueryDto): Promise<PaginatedView<CustomerView>> {
    const storeId = requireStoreId(this.requestContext);
    const skip = (query.page - 1) * query.limit;

    const filter: CustomerListFilter = {
      search: query.search,
      skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    };

    const [items, total] = await Promise.all([
      this.customers.findMany(storeId, filter),
      this.customers.count(storeId, filter),
    ]);

    return {
      items: items.map(toCustomerView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async get(customerId: string): Promise<CustomerView> {
    const storeId = requireStoreId(this.requestContext);

    const customer = await this.customers.findById(storeId, customerId);
    if (!customer) {
      throw new NotFoundError('The customer was not found.');
    }
    return toCustomerView(customer);
  }

  async listOrders(
    customerId: string,
    query: ListCustomerOrdersQueryDto,
  ): Promise<PaginatedView<CustomerOrderView>> {
    const storeId = requireStoreId(this.requestContext);

    // Resolve the customer in the current store FIRST so a cross-tenant or
    // unknown customer fails closed with NOT_FOUND before any order data is
    // touched (no existence leak).
    const customer = await this.customers.findById(storeId, customerId);
    if (!customer) {
      throw new NotFoundError('The customer was not found.');
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.customers.findOrders(storeId, customerId, {
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.customers.countOrders(storeId, customerId),
    ]);

    return {
      items: items.map(toCustomerOrderView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }
}
