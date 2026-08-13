import { Module } from '@nestjs/common';
import { SubscriptionModule } from '../subscription/subscription.module';
import { StorefrontController } from './controllers/storefront.controller';
import { StorefrontRepository } from './repositories/storefront.repository';
import { StorefrontService } from './services/storefront.service';
import { StorefrontStoreResolver } from './services/storefront-store-resolver';

/**
 * Storefront module (roadmap Phase 11).
 *
 * Implements the PUBLIC customer-facing read API (docs/API-SPEC.md §31-§32,
 * docs/DATABASE.md §5.4/§29.6). All endpoints are anonymous (@Public) and
 * read-only; the Store is resolved from the public storefront slug/domain, and
 * every query is store-scoped to that resolved Store.
 *
 * Phase 14 (SaaS Subscription): imports SubscriptionModule so the storefront
 * resolver enforces the documented subscription access overlay (DOMAIN-MODEL
 * §6.3 — an EXPIRED subscription disables the storefront regardless of Store
 * status) with a read-only effective-status evaluation.
 *
 * Controller -> Service -> Repository -> Database.
 */
@Module({
  imports: [SubscriptionModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, StorefrontStoreResolver, StorefrontRepository],
})
export class StorefrontModule {}
