import { StoreStatus, SubscriptionStatus } from '@prisma/client';
import { NotFoundError } from '../../common/errors/domain-exceptions';

/**
 * Storefront availability rules (docs/DOMAIN-MODEL.md §6.3, US-STF-001).
 *
 * - The public storefront is purchasable/served only when the Store is ACTIVE.
 * - DISABLED and SUSPENDED stores are NOT purchasable; their public storefront
 *   fails closed with NOT_FOUND (no existence leak), mirroring the tenant-safe
 *   convention used across the API and the public `anon` RLS policy set
 *   (DATABASE.md §29.6 exposes only ACTIVE data).
 * - Subscription access overlay (Phase 14 — docs/DOMAIN-MODEL.md §6.3/§16.1):
 *   when the Store's Subscription is EXPIRED, the storefront is disabled
 *   REGARDLESS of Store status and also fails closed with NOT_FOUND.
 *   `subscriptionStatus` is the effective status computed by the subscription
 *   domain (read-only evaluation on the public path).
 */
export function assertStorefrontAvailable(
  store: { status: StoreStatus },
  subscriptionStatus?: SubscriptionStatus,
): void {
  if (store.status !== StoreStatus.ACTIVE) {
    throw new NotFoundError('The storefront is not available.');
  }
  if (subscriptionStatus === SubscriptionStatus.EXPIRED) {
    throw new NotFoundError('The storefront is not available.');
  }
}
