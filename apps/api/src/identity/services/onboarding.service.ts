import { Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma, Store, StoreMembership, User } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import {
  assertValidStoreSlug,
  generateStoreSlug,
  normalizeStoreSlug,
} from '../domain/store-slug';
import { CreateMerchantDto } from '../dto/create-merchant.dto';
import { StoreView } from '../identity.types';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';
import { StoreRepository } from '../repositories/store.repository';
import { UserRepository } from '../repositories/user.repository';

/** Default currency (MVP-SCOPE / BRD / USER-STORIES: "Currency defaults to EGP"). */
const DEFAULT_CURRENCY = 'EGP';

/** Application-level view of the merchant's User row (no database internals). */
export interface OnboardingUserView {
  id: string;
  authUserId: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Application-level view of the merchant's membership (role/status). */
export interface OnboardingMembershipView {
  id: string;
  storeId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

/** Result of creating the merchant (Store + membership are always present). */
export interface CreateMerchantResult {
  store: StoreView;
  membership: OnboardingMembershipView;
}

/** Result of GET /onboarding/status — user may exist without a Store yet. */
export interface OnboardingStatusView {
  user: OnboardingUserView | null;
  store: StoreView | null;
  membership: OnboardingMembershipView | null;
}


/**
 * Merchant onboarding application service (Phase 17).
 *
 * Connects the public signup to the FINAL identity/tenancy model:
 *
 *   Supabase User -> Application User -> StoreMembership (OWNER, ACTIVE) -> Store
 *
 * Business rules:
 * - `createMerchant` is IDEMPOTENT. Re-running it for the same authenticated
 *   identity NEVER creates a second User, Store or membership: when the user
 *   already holds an ACTIVE membership the existing Store is returned. Unique
 *   constraints (users.auth_user_id, stores.slug, users.email) are mapped to
 *   the domain error taxonomy; Prisma internals never reach the client.
 * - All writes (User -> Store -> membership -> TRIAL subscription) happen in a
 *   SINGLE `TransactionService.run` boundary: any failure rolls everything
 *   back, so partial state cannot survive (US-SUB-001 is preserved — the trial
 *   is created atomically with the Store).
 * - The Store id never comes from the client; the tenant boundary is created
 *   here and consumed afterwards exclusively through the trusted tenant
 *   context (membership -> store).
 * - Passwords are never handled: Supabase Auth owns credentials.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly users: UserRepository,
    private readonly stores: StoreRepository,
    private readonly memberships: StoreMembershipRepository,
    private readonly transaction: TransactionService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /**
   * Idempotently creates the merchant's application User + Store + OWNER
   * membership + TRIAL subscription.
   */
  async createMerchant(dto: CreateMerchantDto): Promise<CreateMerchantResult> {
    const authUserId = this.requestContext.getCurrent()?.user?.authUserId;
    if (!authUserId) {
      throw new UnauthorizedError('Authentication required.');
    }
    const email = this.requestContext.getCurrent()?.user?.email ?? '';
    if (!email) {
      throw new BadRequestError('A verified email is required to create a merchant account.');
    }

    const slug = normalizeStoreSlug(dto.slug ?? generateStoreSlug(dto.storeName));
    assertValidStoreSlug(slug);
    const currency = dto.currency ? dto.currency.toUpperCase() : DEFAULT_CURRENCY;

    // Fast-path idempotency (outside the transaction): the merchant already
    // exists and owns a store -> return it, never create a duplicate.
    const existingUser = await this.users.findByAuthUserId(authUserId);
    if (existingUser) {
      const existing = await this.resolveExistingStore(existingUser.id);
      if (existing) {
        return existing;
      }
    }

    try {
      const result = await this.transaction.run(async (tx) => {
        // Re-resolve inside the boundary: a concurrent request may have
        // provisioned the User/Store between the fast-path check and here.
        let user = existingUser ?? (await this.users.findByAuthUserIdTx(tx, authUserId));
        if (!user) {
          user = await this.users.create(tx, {
            authUserId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            email,
          });
        }

        const existing = await this.resolveExistingStoreTx(tx, user.id);
        if (existing) {
          return existing;
        }

        const store = await this.stores.create(tx, { name: dto.storeName, slug, currency });
        const membership = await this.memberships.create(tx, {
          storeId: store.id,
          userId: user.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        });
        await this.subscriptions.startTrial(tx, store.id);

        return this.toCreateMerchantResult(store, membership);
      });
      return result;
    } catch (error) {
      return this.mapOnboardingError(error);
    }
  }

  /**
   * Returns the current authenticated user's merchant state. Used by the
   * frontend to route between onboarding and the dashboard when no tenant
   * context exists yet (a signed-in user without a membership).
   */
  async getStatus(): Promise<OnboardingStatusView> {
    const authUserId = this.requestContext.getCurrent()?.user?.authUserId;
    if (!authUserId) {
      throw new UnauthorizedError('Authentication required.');
    }

    const user = await this.users.findByAuthUserId(authUserId);
    if (!user) {
      return { user: null, store: null, membership: null };
    }

    const memberships = await this.memberships.findActiveMembershipsForUser(user.id);
    if (memberships.length === 0) {
      return { user: this.toUserView(user), store: null, membership: null };
    }

    const membership = memberships[0];
    const store = await this.stores.findById(membership.storeId);
    if (!store) {
      // Fail safe: an orphaned membership must never surface a store.
      return { user: this.toUserView(user), store: null, membership: null };
    }

    return {
      user: this.toUserView(user),
      store: this.toStoreView(store),
      membership: this.toMembershipView(membership),
    };
  }

  /** Fast-path idempotency helper (shared Prisma client). */
  private async resolveExistingStore(userId: string): Promise<CreateMerchantResult | null> {
    const memberships = await this.memberships.findActiveMembershipsForUser(userId);
    if (memberships.length === 0) {
      return null;
    }
    const store = await this.stores.findById(memberships[0].storeId);
    if (!store) {
      return null;
    }
    return this.toCreateMerchantResult(store, memberships[0]);
  }

  /** Transaction-scoped idempotency helper (re-check inside the boundary). */
  private async resolveExistingStoreTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<CreateMerchantResult | null> {
    const memberships = await this.memberships.findActiveMembershipsForUserTx(tx, userId);
    if (memberships.length === 0) {
      return null;
    }
    const store = await this.stores.findByIdTx(tx, memberships[0].storeId);
    if (!store) {
      return null;
    }
    return this.toCreateMerchantResult(store, memberships[0]);
  }

  private toCreateMerchantResult(store: Store, membership: StoreMembership): CreateMerchantResult {
    return {
      store: this.toStoreView(store),
      membership: this.toMembershipView(membership),
    };
  }

  private toStoreView(store: Store): StoreView {
    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      status: store.status,
      currency: store.currency,
      timezone: store.timezone,
    };
  }

  private toMembershipView(membership: StoreMembership): OnboardingMembershipView {
    return {
      id: membership.id,
      storeId: membership.storeId,
      role: membership.role,
      status: membership.status,
    };
  }

  private toUserView(user: User): OnboardingUserView {
    return {
      id: user.id,
      authUserId: user.authUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };
  }

  /**
   * Maps unique-constraint violations to the domain taxonomy. A concurrent
   * request may have provisioned the User between the fast-path check and the
   * transaction; in that case the retry resolves the existing merchant
   * idempotently instead of failing.
   */
  private async mapOnboardingError(error: unknown): Promise<CreateMerchantResult> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = this.prismaTarget(error);
      const authUserId = this.requestContext.getCurrent()?.user?.authUserId;

      if (authUserId && target.includes('auth_user_id')) {
        // Another request created the User row first -> resolve idempotently.
        const user = await this.users.findByAuthUserId(authUserId);
        if (user) {
          const existing = await this.resolveExistingStore(user.id);
          if (existing) {
            return existing;
          }
        }
      }
      if (target.includes('slug')) {
        throw new ConflictError('A store with this slug already exists.');
      }
      if (target.includes('email')) {
        throw new ConflictError('An account with this email already exists.');
      }
    }

    throw error;
  }

  private prismaTarget(error: Prisma.PrismaClientKnownRequestError): string {
    const target = (error.meta as { target?: string[] | string } | undefined)?.target;
    if (Array.isArray(target)) {
      return target.join(',');
    }
    return typeof target === 'string' ? target : '';
  }
}

