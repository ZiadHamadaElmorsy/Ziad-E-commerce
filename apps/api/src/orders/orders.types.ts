import {
  InventoryReservation,
  Order,
  OrderChannel,
  OrderItem,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  ReservationStatus,
} from '@prisma/client';
import { buildPaginationMeta, PaginatedView } from '../catalog/catalog.types';

/**
 * Public Order representations returned by the merchant Order API
 * (docs/API-SPEC.md §23).
 *
 * - Money is integer minor units (EGP piastres); the stored BIGINT values are
 *   converted to plain JSON-safe numbers by the mappers (docs/DATABASE.md
 *   §15.5 — no floating-point money anywhere).
 * - Historical values ALWAYS come from the purchase-time snapshots
 *   (docs/DATABASE.md §15.3): item names/SKU/prices, customer email/phone and
 *   the shipping/billing address snapshots. Current Product/Variant/Customer
 *   rows are never substituted.
 * - Internal columns (store_id, idempotency_key) are not exposed.
 * - Payment status is NOT part of this view: `orders` has no payment_status
 *   column (DATABASE §15.6) and payment records belong to the Payments phase.
 */

/** The Order aggregate with its snapshot items and inventory reservations. */
export type OrderWithDetails = Order & {
  items: OrderItem[];
  reservations: InventoryReservation[];
};

export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderReservationView {
  id: string;
  variantId: string;
  quantity: number;
  status: ReservationStatus;
}

/** Full Order detail (GET /api/v1/orders/:orderId and status-update result). */
export interface OrderView {
  id: string;
  orderNumber: string;
  /** Acquisition/payment channel (ONLINE_PAYMENT | WHATSAPP) — Phase 22. */
  channel: OrderChannel;
  /** How the order's payment is settled (ONLINE | COD) — Phase 27. */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (PAID/UNPAID/FAILED/REFUNDED) — Phase 27. */
  paymentStatus: OrderPaymentStatus;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown> | null;
  items: OrderItemView[];
  reservations: OrderReservationView[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
}

/** Compact list representation (GET /api/v1/orders). */
export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  /** Acquisition/payment channel (ONLINE_PAYMENT | WHATSAPP) — Phase 22. */
  channel: OrderChannel;
  /** How the order's payment is settled (ONLINE | COD) — Phase 27. */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (PAID/UNPAID/FAILED/REFUNDED) — Phase 27. */
  paymentStatus: OrderPaymentStatus;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
}

export function toOrderItemView(item: OrderItem): OrderItemView {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productNameSnapshot,
    variantName: item.variantNameSnapshot,
    sku: item.skuSnapshot,
    unitPrice: Number(item.unitPrice),
    quantity: item.quantity,
    lineTotal: Number(item.lineTotal),
  };
}

export function toOrderReservationView(reservation: InventoryReservation): OrderReservationView {
  return {
    id: reservation.id,
    variantId: reservation.variantId,
    quantity: reservation.quantity,
    status: reservation.status,
  };
}

export function toOrderView(order: OrderWithDetails): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    shippingTotal: Number(order.shippingTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    customerId: order.customerId,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddressSnapshot as Record<string, unknown>,
    billingAddress: order.billingAddressSnapshot as Record<string, unknown> | null,
    items: order.items.map(toOrderItemView),
    reservations: order.reservations.map(toOrderReservationView),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}

export function toOrderSummaryView(order: Order): OrderSummaryView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    currency: order.currency,
    grandTotal: Number(order.grandTotal),
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt.toISOString(),
  };
}

export { buildPaginationMeta, PaginatedView };
