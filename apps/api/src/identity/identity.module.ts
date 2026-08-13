import { Module } from '@nestjs/common';
import { SubscriptionModule } from '../subscription/subscription.module';
import { StoresController } from './controllers/stores.controller';
import { StoreMembershipRepository } from './repositories/store-membership.repository';
import { StoreRepository } from './repositories/store.repository';
import { UserRepository } from './repositories/user.repository';
import { MembershipService } from './services/membership.service';
import { StoreService } from './services/store.service';

/**
 * Identity & Tenancy module (Phase 2).
 *
 * Implements User / Store / StoreMembership on top of the Phase 1 foundation
 * (authentication boundary, tenant context, transaction helper, RLS binder).
 *
 * Controller -> Service -> Repository -> Database.
 * Business rules live in the service/domain layer; controllers stay thin.
 *
 * Imports SubscriptionModule so Store creation also creates the TRIAL
 * subscription row in the same transaction (US-SUB-001 — Phase 14).
 */
@Module({
  imports: [SubscriptionModule],
  controllers: [StoresController],
  providers: [
    StoreService,
    MembershipService,
    UserRepository,
    StoreRepository,
    StoreMembershipRepository,
  ],
  exports: [MembershipService, UserRepository],
})
export class IdentityModule {}
