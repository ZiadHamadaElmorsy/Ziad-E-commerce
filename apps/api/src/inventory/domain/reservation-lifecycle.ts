import { ReservationStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/** The two legal terminal reservation states (ACTIVE is never terminal). */
export type TerminalReservationStatus = Exclude<ReservationStatus, 'ACTIVE'>;

/**
 * Reservation lifecycle (docs/DOMAIN-MODEL.md §8.2, docs/DATABASE.md §14):
 *
 *   ACTIVE -> CONSUMED   (verified payment success)
 *   ACTIVE -> RELEASED   (payment failure, order cancellation, or expiration)
 *
 * - EXPIRED is NOT a state; expiration is a REASON/PATH whose terminal result
 *   is RELEASED.
 * - CONVERTED is NOT a state; there is NO two-phase reservation lifecycle.
 * - Release/consumption are idempotent (guarded conditional transitions,
 *   docs/DATABASE.md §14.3): repeated execution against the same target state
 *   is a no-op, and inventory is decremented ONLY when the transition
 *   actually affected a row.
 */
export function assertReservationTransition(from: ReservationStatus, to: ReservationStatus): void {
  const legal =
    from === ReservationStatus.ACTIVE &&
    (to === ReservationStatus.CONSUMED || to === ReservationStatus.RELEASED);

  if (!legal) {
    throw new StateTransitionError(
      `A reservation can only transition from ACTIVE to CONSUMED or RELEASED ` +
        `(requested ${from} -> ${to}).`,
    );
  }
}

/**
 * Decides how a consume/release request behaves for a reservation in
 * `current` status when the caller wants to reach `target` (CONSUMED or
 * RELEASED).
 *
 * - 'noop'    : the reservation is ALREADY in the target state — idempotent
 *               repeated execution; no transition, no inventory change.
 * - 'proceed' : the reservation is ACTIVE — run the guarded transition.
 * - 'invalid' : the reservation is in the OTHER terminal state — the
 *               transition is forbidden (release a CONSUMED reservation or
 *               consume a RELEASED one).
 */
export function resolveTerminalTransition(
  current: ReservationStatus,
  target: TerminalReservationStatus,
): { kind: 'noop' } | { kind: 'proceed' } | { kind: 'invalid' } {
  if (current === target) {
    return { kind: 'noop' };
  }
  if (current === ReservationStatus.ACTIVE) {
    return { kind: 'proceed' };
  }
  return { kind: 'invalid' };
}

/** Human-readable reason for a forbidden terminal transition. */
export function invalidTerminalTransitionMessage(target: TerminalReservationStatus): string {
  if (target === ReservationStatus.RELEASED) {
    return 'Cannot release a reservation that has already been consumed.';
  }
  return 'Cannot consume a reservation that has already been released.';
}
