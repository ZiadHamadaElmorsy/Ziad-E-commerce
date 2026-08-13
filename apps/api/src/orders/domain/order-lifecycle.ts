import { OrderStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * The exact Order lifecycle state machine (docs/DOMAIN-MODEL.md §12.3,
 * docs/DATABASE.md §15.2):
 *
 *   PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
 *   PENDING  -> CANCELLED     (terminal)
 *   CONFIRMED -> CANCELLED    (terminal)
 *
 * - No forward-state skipping; no arbitrary transitions; no self-transitions.
 * - CANCELLED is terminal and only reachable from PENDING or CONFIRMED.
 * - DELIVERED is terminal; terminal states never move backwards.
 * - The documented payment-driven PENDING -> CONFIRMED path is part of the
 *   same normal lifecycle; reservation CONSUMPTION on payment success belongs
 *   to the Payments phase, not to this state machine.
 */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const legal =
    (from === OrderStatus.PENDING && to === OrderStatus.CONFIRMED) ||
    (from === OrderStatus.CONFIRMED && to === OrderStatus.PROCESSING) ||
    (from === OrderStatus.PROCESSING && to === OrderStatus.SHIPPED) ||
    (from === OrderStatus.SHIPPED && to === OrderStatus.DELIVERED) ||
    (from === OrderStatus.PENDING && to === OrderStatus.CANCELLED) ||
    (from === OrderStatus.CONFIRMED && to === OrderStatus.CANCELLED);

  if (!legal) {
    throw new StateTransitionError(`Order status cannot transition from ${from} to ${to}.`);
  }
}

/** Lifecycle timestamps written by the documented transitions (DATABASE §7.16). */
export interface OrderTransitionTimestamps {
  confirmedAt?: Date;
  cancelledAt?: Date;
}

/** The extra columns a legal transition writes (confirmed_at / cancelled_at). */
export function transitionTimestamps(to: OrderStatus): OrderTransitionTimestamps {
  return {
    ...(to === OrderStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
    ...(to === OrderStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
  };
}
