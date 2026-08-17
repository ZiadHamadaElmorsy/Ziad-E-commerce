import { OrderPaymentMethod, OrderPaymentStatus, OrderStatus, ShipmentStatus, ShippingProvider } from '@prisma/client';
import { CustomerTimelineEntry, customerFriendlyStatusKey } from './domain/shipment-status-mapper';

/**
 * Public Shipping representations (Phase 27).
 *
 * - Money is integer minor units (EGP piastres); the stored BIGINT values are
 *   converted to plain JSON-safe numbers.
 * - Internal provider columns (`provider_shipment_id`, `last_provider_status`,
 *   `raw_provider_data`) are NEVER exposed to customers. The merchant view
 *   exposes the provider NAME (Part 8: "The merchant/admin can see the
 *   shipping provider") but never credentials or raw bodies.
 */

/** A status-history timeline entry (merchant view). */
export interface ShipmentHistoryView {
  id: string;
  previousStatus: ShipmentStatus | null;
  newStatus: ShipmentStatus;
  providerStatus: string | null;
  source: string;
  createdAt: string;
}

/** Merchant shipment view (Part 10 — dashboard order details). */
export interface ShipmentView {
  id: string;
  orderId: string;
  /** The shipping provider the merchant can see (Bosta). */
  provider: ShippingProvider;
  trackingNumber: string | null;
  status: ShipmentStatus;
  codAmount: number;
  shippingCost: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** Merchant-facing operational error message (sanitized; never provider internals). */
  errorMessage: string | null;
  /** Merchant-facing shipping label URL. */
  printedLabelUrl: string | null;
  statusHistory: ShipmentHistoryView[];
}

/**
 * Customer tracking view (Part 12/13/18) — ONE aggregated payload so the
 * tracking page never issues separate order/shipment/history/payment requests.
 * The customer NEVER sees: provider name, provider ids, raw statuses, internal
 * database ids or technical webhook ids. Only the customer-safe tracking
 * number and customer-friendly statuses are exposed.
 */
export interface CustomerTrackingView {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: string;
  };
  payment: {
    method: OrderPaymentMethod;
    status: OrderPaymentStatus;
    /** Amount to collect on delivery — only relevant for COD. */
    codAmount: number;
  };
  tracking: {
    /** Customer-safe tracking number (null when no shipment exists yet). */
    trackingNumber: string | null;
    /** Customer-friendly status key (mapped from the internal shipment status). */
    status: string;
    /** Ordered delivery timeline with done/current/upcoming states. */
    timeline: CustomerTimelineEntry[];
    /** Customer-friendly status history milestones (id-free). */
    milestones: Array<{ status: string; at: string }>;
    /** When the shipment was delivered (null until delivered). */
    deliveredAt: string | null;
  };
}

export function toShipmentHistoryView(entry: {
  id: string;
  previousStatus: ShipmentStatus | null;
  newStatus: ShipmentStatus;
  providerStatus: string | null;
  source: string;
  createdAt: Date;
}): ShipmentHistoryView {
  return {
    id: entry.id,
    previousStatus: entry.previousStatus,
    newStatus: entry.newStatus,
    providerStatus: entry.providerStatus,
    source: entry.source,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toShipmentView(shipment: {
  id: string;
  orderId: string;
  provider: ShippingProvider;
  trackingNumber: string | null;
  status: ShipmentStatus;
  codAmount: bigint;
  shippingCost: bigint;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
  errorMessage: string | null;
  printedLabelUrl: string | null;
  statusHistory: Array<{
    id: string;
    previousStatus: ShipmentStatus | null;
    newStatus: ShipmentStatus;
    providerStatus: string | null;
    source: string;
    createdAt: Date;
  }>;
}): ShipmentView {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    provider: shipment.provider,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    codAmount: Number(shipment.codAmount),
    shippingCost: Number(shipment.shippingCost),
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    errorMessage: shipment.errorMessage,
    printedLabelUrl: shipment.printedLabelUrl,
    statusHistory: shipment.statusHistory.map(toShipmentHistoryView),
  };
}

export { customerFriendlyStatusKey };
