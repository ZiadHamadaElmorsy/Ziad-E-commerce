import { ShipmentStatus } from '@prisma/client';

/**
 * Status mapping pipeline (Phase 27 — Part 13):
 *
 *   Bosta Status  →  Internal ShipmentStatus  →  Customer-Friendly Status
 *
 * The customer NEVER sees a raw provider status. The internal
 * `ShipmentStatus` is the normalized domain value stored on `shipments.status`;
 * the customer-facing view is derived through `customerFriendlyStatus`.
 */

/** Normalized internal shipment statuses the provider statuses map into. */
const BOSTA_TO_INTERNAL: Readonly<Record<string, ShipmentStatus>> = {
  PENDING: ShipmentStatus.CREATED,
  PROCESSING: ShipmentStatus.HANDED_TO_COURIER,
  AT_WAREHOUSE: ShipmentStatus.AT_DELIVERY_CENTER,
  AT_DELIVERY_CENTER: ShipmentStatus.AT_DELIVERY_CENTER,
  RIDER_ASSIGNED: ShipmentStatus.OUT_FOR_DELIVERY,
  OUT_FOR_DELIVERY: ShipmentStatus.OUT_FOR_DELIVERY,
  DELIVERED: ShipmentStatus.DELIVERED,
  REJECTED: ShipmentStatus.REJECTED,
  FAILED: ShipmentStatus.DELIVERY_FAILED,
  RETURNED: ShipmentStatus.RETURNED,
  CANCELLED: ShipmentStatus.CANCELLED,
};

/**
 * Maps a raw provider status string to the normalized internal shipment
 * status. Returns null when the provider status is unrecognized (the caller
 * keeps the current internal status and stores the raw value).
 */
export function mapProviderStatusToInternal(providerStatus: string | null): ShipmentStatus | null {
  if (!providerStatus) return null;
  const normalized = providerStatus.trim().toUpperCase();
  return BOSTA_TO_INTERNAL[normalized] ?? null;
}

/** Customer-friendly delivery timeline steps in display order. */
export type CustomerTimelineStep =
  | 'ORDER_CONFIRMED'
  | 'HANDED_TO_COURIER'
  | 'AT_DELIVERY_CENTER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

/** The ordered customer timeline steps (Part 13). */
export const CUSTOMER_TIMELINE_STEPS: readonly CustomerTimelineStep[] = [
  'ORDER_CONFIRMED',
  'HANDED_TO_COURIER',
  'AT_DELIVERY_CENTER',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

/** The timeline step index a shipment status has completed. */
function timelineIndexOf(status: ShipmentStatus | null): number {
  switch (status) {
    case ShipmentStatus.CREATED:
      return 0; // order confirmed; shipment not yet handed over
    case ShipmentStatus.HANDED_TO_COURIER:
      return 1;
    case ShipmentStatus.AT_DELIVERY_CENTER:
      return 2;
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 3;
    case ShipmentStatus.DELIVERED:
      return 4;
    default:
      return -1; // terminal non-delivery states have no timeline index
  }
}

export interface CustomerTimelineEntry {
  /** The timeline step key (customer-facing i18n key suffix). */
  step: CustomerTimelineStep;
  /** 'done' | 'current' | 'upcoming' — drives the ✓ / ● / ○ rendering. */
  state: 'done' | 'current' | 'upcoming';
}

/**
 * Builds the customer delivery timeline from the current internal shipment
 * status (Part 13). The step state is computed by position so a partially
 * delivered order renders ✓ / ✓ / ✓ / ● / ○ without exposing raw statuses.
 */
export function buildCustomerTimeline(
  status: ShipmentStatus | null,
): CustomerTimelineEntry[] {
  const currentIndex = timelineIndexOf(status);
  return CUSTOMER_TIMELINE_STEPS.map((step, index) => ({
    step,
    state: currentIndex === -1 ? 'upcoming' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

/**
 * Customer-friendly headline for a shipment status (Part 13). These strings are
 * the i18n keys rendered by the tracking page; the page labels them with the
 * matching translations. The raw provider status is never exposed.
 */
export function customerFriendlyStatusKey(status: ShipmentStatus | null): string {
  switch (status) {
    case ShipmentStatus.CREATED:
      return 'ORDER_CONFIRMED';
    case ShipmentStatus.HANDED_TO_COURIER:
      return 'HANDED_TO_COURIER';
    case ShipmentStatus.AT_DELIVERY_CENTER:
      return 'AT_DELIVERY_CENTER';
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'OUT_FOR_DELIVERY';
    case ShipmentStatus.DELIVERED:
      return 'DELIVERED';
    case ShipmentStatus.REJECTED:
      return 'REJECTED';
    case ShipmentStatus.DELIVERY_FAILED:
      return 'DELIVERY_FAILED';
    case ShipmentStatus.RETURNED:
      return 'RETURNED';
    case ShipmentStatus.CANCELLED:
      return 'CANCELLED';
    default:
      return 'ORDER_CONFIRMED';
  }
}
