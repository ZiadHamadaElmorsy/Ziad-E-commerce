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

/**
 * Public Checkout result returned by POST /api/v1/checkout
 * (docs/API-SPEC.md §22 "Create Checkout"). The exact response contract is
 * listed as an API open decision (API-SPEC §46), so this is the minimal
 * documented-compatible shape: the created (or idempotently returned) PENDING
 * order with its purchase-time snapshot items and ACTIVE inventory
 * reservations.
 *
 * - Money is integer minor units (EGP piastres); the stored BIGINT values are
 *   converted to plain JSON-safe numbers by the mappers (docs/DATABASE.md
 *   §15.5 — no floating-point money anywhere).
 * - Internal columns (store_id, idempotency_key, snapshots) are not exposed.
 */

/** The Order aggregate as returned by the checkout persistence operations. */
export type OrderWithItems = Order & { items: OrderItem[] };

/** The Order aggregate with its reservations (idempotent retry / result load). */
export type OrderWithDetails = Order & { items: OrderItem[]; reservations: InventoryReservation[] };

export interface CheckoutItemView {
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface CheckoutReservationView {
  id: string;
  variantId: string;
  quantity: number;
  status: ReservationStatus;
}

export interface CheckoutView {
  orderId: string;
  orderNumber: string;
  channel: OrderChannel;
  /** How the order's payment is settled (ONLINE | COD) — Phase 27. */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (COD orders start UNPAID) — Phase 27. */
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
  /**
   * Phase 23 — per-order secure lookup token. Returned ONLY to the party that
   * created the order (the checkout / WhatsApp response); required to read the
   * customer PII of this order through the PUBLIC storefront confirmation
   * endpoint. Never logged, never persisted anywhere else.
   */
  lookupToken: string | null;
  items: CheckoutItemView[];
  reservations: CheckoutReservationView[];
  createdAt: string;
}

export function toCheckoutView(order: OrderWithDetails): CheckoutView {
  return {
    orderId: order.id,
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
    lookupToken: order.lookupToken ?? null,
    items: order.items.map(toCheckoutItemView),
    reservations: order.reservations.map(toCheckoutReservationView),
    createdAt: order.createdAt.toISOString(),
  };
}

function toCheckoutItemView(item: OrderItem): CheckoutItemView {
  return {
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

function toCheckoutReservationView(reservation: InventoryReservation): CheckoutReservationView {
  return {
    id: reservation.id,
    variantId: reservation.variantId,
    quantity: reservation.quantity,
    status: reservation.status,
  };
}
