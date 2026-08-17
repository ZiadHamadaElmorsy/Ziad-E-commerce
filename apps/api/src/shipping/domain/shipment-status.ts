import { ShipmentStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * Shipment lifecycle state machine (Phase 27 — Part 7/Part 13).
 *
 * The shipment status is a SEPARATE state machine from the order lifecycle
 * (`order.status`) and the payment state (`order.payment_status`):
 *
 *   CREATED ─────────────► HANDED_TO_COURIER ─► AT_DELIVERY_CENTER ─► OUT_FOR_DELIVERY ─► DELIVERED
 *      │                        │                      │                     │
 *      ▼                        ▼                      ▼                     ▼
 *   REJECTED / DELIVERY_FAILED / RETURNED (terminal)   REJECTED / DELIVERY_FAILED / RETURNED
 *   CANCELLED (merchant-cancelled, terminal)
 *
 * - `DELIVERED`/`CANCELLED`/`RETURNED` are terminal; no backward moves.
 * - `REJECTED`/`DELIVERY_FAILED` may still become `RETURNED` (the carrier
 *   starts a return).
 * - No self-transitions: a no-op status (same value) is handled by the caller
 *   as an idempotent no-op, not recorded as a history row.
 */
export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (from === to) {
    throw new StateTransitionError(`Shipment is already ${from}.`);
  }
  const legal = LEGAL_SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
  if (!legal) {
    throw new StateTransitionError(`Shipment status cannot transition from ${from} to ${to}.`);
  }
}

const LEGAL_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.CREATED]: [
    ShipmentStatus.HANDED_TO_COURIER,
    ShipmentStatus.AT_DELIVERY_CENTER,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.REJECTED,
    ShipmentStatus.DELIVERY_FAILED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.HANDED_TO_COURIER]: [
    ShipmentStatus.AT_DELIVERY_CENTER,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.REJECTED,
    ShipmentStatus.DELIVERY_FAILED,
    ShipmentStatus.RETURNED,
  ],
  [ShipmentStatus.AT_DELIVERY_CENTER]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.REJECTED,
    ShipmentStatus.DELIVERY_FAILED,
    ShipmentStatus.RETURNED,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.REJECTED,
    ShipmentStatus.DELIVERY_FAILED,
    ShipmentStatus.RETURNED,
  ],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.REJECTED]: [ShipmentStatus.RETURNED],
  [ShipmentStatus.DELIVERY_FAILED]: [ShipmentStatus.RETURNED],
  [ShipmentStatus.RETURNED]: [],
  [ShipmentStatus.CANCELLED]: [],
};

/** Whether a shipment status is terminal (no legal outgoing transitions). */
export function isShipmentTerminal(status: ShipmentStatus): boolean {
  return LEGAL_SHIPMENT_TRANSITIONS[status].length === 0;
}
