import { SubscriptionStatus } from '@prisma/client';

/**
 * Subscription lifecycle (docs/DOMAIN-MODEL.md §16.1, docs/DATABASE.md §20.2).
 *
 * FINALIZED MVP states (exactly):
 *
 *   TRIAL -> ACTIVE
 *   TRIAL -> EXPIRED
 *   ACTIVE -> EXPIRED
 *   EXPIRED -> ACTIVE   (reactivation)
 *
 * No PAST_DUE / CANCELLED / SUSPENDED states in the MVP. The transitions are
 * application-enforced (guarded conditional UPDATEs — DATABASE §26.2); the
 * database only constrains enum membership.
 */

/** Exactly the three FINALIZED states. */
export const SUBSCRIPTION_STATES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.EXPIRED,
];

/**
 * Whether `from -> to` is one of the FINALIZED lifecycle transitions.
 * Any other pair (including same-state "transitions") is illegal.
 */
export function isAllowedSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  switch (from) {
    case SubscriptionStatus.TRIAL:
      return to === SubscriptionStatus.ACTIVE || to === SubscriptionStatus.EXPIRED;
    case SubscriptionStatus.ACTIVE:
      return to === SubscriptionStatus.EXPIRED;
    case SubscriptionStatus.EXPIRED:
      return to === SubscriptionStatus.ACTIVE;
    default:
      return false;
  }
}

/**
 * A subscription row (the fields the effective-status evaluation needs).
 */
export interface SubscriptionLike {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
}

/**
 * Computes the EFFECTIVE status from the stored status + dates.
 *
 * The only date-driven expiry documented for the MVP is the trial:
 *
 *   TRIAL with `trial_ends_at` reached/passed -> EXPIRED
 *
 * (`trial_ends_at` is a FUTURE target; `expires_at` is set when a subscription
 * transitions INTO EXPIRED — DATABASE §7.4 — so it records the expiration
 * moment rather than being an ACTIVE-period target. An ACTIVE subscription has
 * no documented automatic expiry date in the MVP because the billing/payment
 * model is deferred (MVP-SCOPE §30, DATABASE §20.4).)
 *
 * A TRIAL row without a `trial_ends_at` never auto-expires.
 *
 * Boundary rule: `now >= trial_ends_at` means the trial has elapsed
 * (implementation decision — an instant equal to the end date is expired).
 */
export function effectiveSubscriptionStatus(
  subscription: SubscriptionLike,
  now: Date,
): SubscriptionStatus {
  if (
    subscription.status === SubscriptionStatus.TRIAL &&
    subscription.trialEndsAt !== null &&
    now.getTime() >= subscription.trialEndsAt.getTime()
  ) {
    return SubscriptionStatus.EXPIRED;
  }
  return subscription.status;
}

/** Whether the effective status is EXPIRED (blocks merchant writes / storefront). */
export function isSubscriptionExpired(subscription: SubscriptionLike, now: Date): boolean {
  return effectiveSubscriptionStatus(subscription, now) === SubscriptionStatus.EXPIRED;
}
