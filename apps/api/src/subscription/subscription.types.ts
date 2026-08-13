import { Subscription, SubscriptionStatus } from '@prisma/client';

/**
 * The merchant-facing subscription view returned by
 * `GET /api/v1/subscription` (docs/API-SPEC.md §30).
 *
 * The API must expose sufficient information for the frontend to determine
 * TRIAL / ACTIVE / EXPIRED. The backend remains authoritative for access
 * control — the frontend is never trusted to enforce subscription
 * restrictions.
 */
export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  activatedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps the persisted row to the documented view (no invented fields). */
export function toSubscriptionView(subscription: Subscription): SubscriptionView {
  return {
    id: subscription.id,
    status: subscription.status,
    trialStartedAt: subscription.trialStartedAt,
    trialEndsAt: subscription.trialEndsAt,
    activatedAt: subscription.activatedAt,
    expiresAt: subscription.expiresAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}
