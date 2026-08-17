import { CartStatus } from '@prisma/client';
import { NotFoundError, StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * Cart lifecycle (docs/DOMAIN-MODEL.md §10.1, docs/DATABASE.md §17.4):
 *
 *   ACTIVE    -> usable.
 *   EXPIRED   -> no longer usable (expires_at + sweep/lazy evaluation).
 *   COMPLETED -> fulfilled by a completed checkout (completed_at set by the
 *                Checkout phase); never reused for a new checkout (technical).
 *
 * No cart merging, no abandoned-cart recovery, no guest/customer merge in the
 * MVP. This phase only guards against mutating a non-ACTIVE cart — the
 * COMPLETED transition itself belongs to the Checkout phase.
 */
export function assertCartUsable(cart: { status: CartStatus }): void {
  if (cart.status === CartStatus.EXPIRED) {
    throw new StateTransitionError('The cart has expired and is no longer usable.');
  }
  if (cart.status === CartStatus.COMPLETED) {
    throw new StateTransitionError('The cart has been completed and can no longer be modified.');
  }
  if (cart.status !== CartStatus.ACTIVE) {
    throw new StateTransitionError(`The cart status ${cart.status} cannot be modified.`);
  }
}

/** True when an ACTIVE cart should be lazily expired (expires_at passed). */
export function isCartExpiredDue(
  cart: { status: CartStatus; expiresAt: Date | null },
  now: Date,
): boolean {
  return (
    cart.status === CartStatus.ACTIVE &&
    cart.expiresAt !== null &&
    cart.expiresAt.getTime() <= now.getTime()
  );
}

/**
 * Phase 27 (Part 17) — completed-cart mutation guard. A COMPLETED cart belongs
 * to a finished checkout and is never reused; mutating it is surfaced as "no
 * usable cart" (NOT_FOUND) so the storefront clears the stale guest token and
 * starts a fresh cart instead of showing the raw lifecycle error.
 */
export function assertCartNotCompleted(cart: { status: CartStatus }): void {
  if (cart.status === CartStatus.COMPLETED) {
    throw new NotFoundError('No cart was found for this session.');
  }
}
