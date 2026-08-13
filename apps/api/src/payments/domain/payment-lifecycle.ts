import { PaymentStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';

/**
 * The exact Payment lifecycle state machine (docs/DOMAIN-MODEL.md §28 #7,
 * docs/DATABASE.md §16.3, §12):
 *
 *   PENDING -> PROCESSING -> SUCCEEDED
 *   PENDING -> PROCESSING -> FAILED
 *
 * - Order status and Payment status are SEPARATE state machines (an order has
 *   no payment_status column — DATABASE §15.6).
 * - There is no direct PENDING -> SUCCEEDED / PENDING -> FAILED: the provider
 *   flow always passes through PROCESSING (documented failure flow is
 *   PENDING -> PROCESSING -> FAILED).
 * - SUCCEEDED and FAILED are terminal; terminal states never move backwards.
 *
 * The guarded terminal transitions (WHERE status = from) live in the payment
 * repositories; this module validates the transition BEFORE any write and is
 * also reused for provider-initiation failure marking (PENDING -> PROCESSING
 * -> FAILED in one transaction).
 */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  const legal =
    (from === PaymentStatus.PENDING && to === PaymentStatus.PROCESSING) ||
    (from === PaymentStatus.PROCESSING && to === PaymentStatus.SUCCEEDED) ||
    (from === PaymentStatus.PROCESSING && to === PaymentStatus.FAILED);

  if (!legal) {
    throw new StateTransitionError(`Payment status cannot transition from ${from} to ${to}.`);
  }
}

/** The extra attempt columns a legal transition writes (DATABASE §7.19). */
export interface PaymentAttemptTimestamps {
  initiatedAt?: Date;
  completedAt?: Date;
}

/** The extra attempt columns the documented transitions write. */
export function attemptTimestamps(to: PaymentStatus): PaymentAttemptTimestamps {
  return {
    ...(to === PaymentStatus.PROCESSING ? { initiatedAt: new Date() } : {}),
    ...(to === PaymentStatus.SUCCEEDED || to === PaymentStatus.FAILED
      ? { completedAt: new Date() }
      : {}),
  };
}
