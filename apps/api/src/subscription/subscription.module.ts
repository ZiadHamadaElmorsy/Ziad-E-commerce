import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionController } from './controllers/subscription.controller';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { SubscriptionAccessGuard } from './services/subscription-access.guard';
import { SubscriptionService } from './services/subscription.service';

/**
 * Subscription module (roadmap Phase 14 — SaaS Subscription).
 *
 * Implements the documented subscription contract (docs/API-SPEC.md §30,
 * docs/DOMAIN-MODEL.md §16.1, docs/DATABASE.md §7.4/§20):
 *
 *   - GET /api/v1/subscription — current subscription (TRIAL/ACTIVE/EXPIRED).
 *   - The FINALIZED lifecycle state machine with guarded transitions.
 *   - The configurable free trial created atomically with each Store.
 *   - The expiry access overlay:
 *       * SubscriptionAccessGuard (global, after RolesGuard) blocks merchant
 *         WRITES when the subscription is EXPIRED (dashboard read-only).
 *       * The storefront resolver enforces the disabled storefront overlay.
 *
 * The FINAL Prisma schema + migration already ship the `subscriptions` table,
 * the `subscription_status` enum, the UNIQUE (store_id) 1:1 constraint, the
 * status index and the `member_subscription_select` RLS policy — this module
 * only adds the application boundary on top of that contract. No schema or
 * migration change is made.
 *
 * Exported so the Identity module can create the trial row in the store-creation
 * transaction (US-SUB-001) and the Storefront module can enforce the overlay.
 */
@Module({
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    { provide: APP_GUARD, useClass: SubscriptionAccessGuard },
  ],
  exports: [SubscriptionService, SubscriptionRepository],
})
export class SubscriptionModule {}
