import { OrderChannel, OrderStatus, ProductStatus, VariantStatus } from '@prisma/client';
import type { ProductWithVariants } from '../catalog/repositories/product.repository';
import type { Order } from '@prisma/client';

/**
 * Merchant Dashboard representations (Phase 25 — performance audit).
 *
 * A single GET /api/v1/dashboard/stats response replaces the dashboard's old
 * request pattern: six parallel collection calls PLUS a paginated browser-side
 * revenue sum loop (up to 50 sequential API requests for a 5,000-order store).
 * Every number below is computed server-side with parallel aggregate queries.
 */

export interface DashboardProductCounts {
  total: number;
  active: number;
  drafts: number;
  archived: number;
}

export interface DashboardRecentProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  /** Price (minor units) of the first ACTIVE variant, or null when none is active. */
  price: number | null;
  variantsCount: number;
}

export interface DashboardOrderSummary {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
}

export interface DashboardStatsView {
  products: DashboardProductCounts;
  categories: number;
  orders: {
    total: number;
    recent: DashboardOrderSummary[];
  };
  /** Sum of grand_total across ALL orders (null when there are no orders). */
  revenue: number | null;
  recentProducts: DashboardRecentProduct[];
}

export function toDashboardOrderSummary(order: Order): DashboardOrderSummary {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    status: order.status,
    currency: order.currency,
    grandTotal: Number(order.grandTotal),
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt.toISOString(),
  };
}

export function toDashboardRecentProduct(product: ProductWithVariants): DashboardRecentProduct {
  const activeVariant = product.variants.find((variant) => variant.status === VariantStatus.ACTIVE);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    price: activeVariant ? Number(activeVariant.price) : null,
    variantsCount: product.variants.length,
  };
}
