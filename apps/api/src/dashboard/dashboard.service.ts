import { Injectable } from '@nestjs/common';
import { requireStoreId } from '../catalog/domain/catalog-tenant';
import { CategoryRepository } from '../catalog/repositories/category.repository';
import { ProductRepository } from '../catalog/repositories/product.repository';
import { RequestContextService } from '../common/context/request-context.service';
import { OrderRepository } from '../orders/repositories/order.repository';
import {
  DashboardStatsView,
  toDashboardOrderSummary,
  toDashboardRecentProduct,
} from './dashboard.types';

/** Number of recent orders / products rendered by the dashboard tables. */
const RECENT_COUNT = 5;

/**
 * Dashboard aggregation service (Phase 25 — performance audit).
 *
 * One request computes every dashboard metric with parallel store-scoped
 * queries:
 *   - product counts grouped by status (ONE grouped query, not four)
 *   - category count
 *   - order total + the RECENT_COUNT most recent orders
 *   - revenue as a single SUM(grand_total) aggregate (not a client-side sum)
 *   - the RECENT_COUNT most recent products (lean projection, no media join)
 *
 * All queries are store-scoped to the trusted tenant context and run in
 * parallel, so the dashboard costs a single request + one round-trip instead
 * of the previous six-to-fifty request pattern.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly orders: OrderRepository,
  ) {}

  async getStats(): Promise<DashboardStatsView> {
    const storeId = requireStoreId(this.requestContext);

    const [countsByStatus, categories, ordersTotal, recentOrders, revenueSum, recentProducts] =
      await Promise.all([
        this.products.countByStatus(storeId),
        this.categories.count(storeId),
        this.orders.count(storeId, {
          skip: 0,
          take: 1,
          orderBy: { createdAt: 'desc' },
        }),
        this.orders.findMany(storeId, {
          skip: 0,
          take: RECENT_COUNT,
          orderBy: { createdAt: 'desc' },
        }),
        this.orders.sumGrandTotal(storeId),
        this.products.findMany(storeId, {
          skip: 0,
          take: RECENT_COUNT,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      products: {
        total: countsByStatus.DRAFT + countsByStatus.ACTIVE + countsByStatus.ARCHIVED,
        active: countsByStatus.ACTIVE,
        drafts: countsByStatus.DRAFT,
        archived: countsByStatus.ARCHIVED,
      },
      categories,
      orders: {
        total: ordersTotal,
        recent: recentOrders.map(toDashboardOrderSummary),
      },
      revenue: revenueSum === null ? null : Number(revenueSum),
      recentProducts: recentProducts.map(toDashboardRecentProduct),
    };
  }
}
