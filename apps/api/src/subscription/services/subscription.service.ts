import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ForbiddenError,
  NotFoundError,
  StateTransitionError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import {
  effectiveSubscriptionStatus,
  isAllowedSubscriptionTransition,
} from '../domain/subscription-status';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { SubscriptionView, toSubscriptionView } from '../subscription.types';

/** Default trial duration (days) when SUBSCRIPTION_TRIAL_DAYS is not configured.
 *  BRD BR-SUB-001: the exact duration is a product decision and MUST be
 *  configurable rather than hard-coded — this is only the boot default. */
export const DEFAULT_TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Message returned for merchant writes on an EXPIRED subscription. */
export const EXPIRED_WRITE_MESSAGE =
  'This store\u2019s subscription has expired. The merchant dashboard is read-only until the subscription is renewed.';

/**
 * Subscription application service (docs/API-SPEC.md §30, docs/DOMAIN-MODEL.md
 * §16.1, docs/DATABASE.md §7.4/§20).
 *
 * Implements the FINALIZED lifecycle (TRIAL -> ACTIVE, TRIAL -> EXPIRED,
 * ACTIVE -> EXPIRED, EXPIRED -> ACTIVE) with guarded conditional transitions
 * (DATABASE §26.2), the configurable free trial (US-SUB-001, BR-SUB-001), and
 * the expiry access overlay (dashboard read-only / storefront disabled /
 * data preserved — BR-SUB-003, US-SUB-002).
 *
 * - Every store-scoped read/write derives storeId from the trusted tenant
 *   context (never client input) and every transition write runs inside
 *   TransactionService.runWithTenant so RLS sees the correct tenant.
 * - Lazy expiry evaluation: a TRIAL row whose `trial_ends_at` has elapsed is
 *   transitioned TRIAL -> EXPIRED idempotently on access (the same lazy
 *   evaluation pattern the MVP uses for inventory reservations — DATABASE
 *   §14.2). A periodic sweep job is NOT documented for subscriptions.
 * - ACTIVE has no documented automatic expiry date: DATABASE §7.4 defines
 *   `expires_at` as "set on ->EXPIRED" (it records the expiration moment), and
 *   the MVP billing/payment model is deferred (MVP-SCOPE §30, DATABASE §20.4).
 *   ACTIVE -> EXPIRED is implemented as an explicit guarded capability; its
 *   production trigger (e.g. a future billing boundary) is an OPEN DECISION.
 * - No billing, no recurring charges, no invoices, no plan management — none
 *   of that is documented for the MVP.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly subscriptions: SubscriptionRepository,
    private readonly transaction: TransactionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the TRIAL subscription row for a newly created Store inside the
   * SAME transaction as the Store + OWNER membership (US-SUB-001: trial is
   * associated with the Store, has a start date and an expiration date, and
   * its status is tracked). Caller supplies the transaction client.
   */
  async startTrial(tx: Prisma.TransactionClient, storeId: string, now = new Date()): Promise<void> {
    const trialDays = this.resolveTrialDays();
    await this.subscriptions.create(tx, {
      storeId,
      status: SubscriptionStatus.TRIAL,
      trialStartedAt: now,
      trialEndsAt: new Date(now.getTime() + trialDays * MS_PER_DAY),
    });
  }

  /**
   * GET /api/v1/subscription — current subscription for the trusted store
   * (resolved from the tenant context, never from client input). Applies lazy
   * expiry evaluation so the reported status is always effective.
   */
  async getCurrent(now = new Date()): Promise<SubscriptionView> {
    const storeId = requireStoreId(this.requestContext);
    return this.getCurrentForStore(storeId, now);
  }

  /** Internal store-scoped read (explicit storeId — used by tests/callers). */
  async getCurrentForStore(storeId: string, now = new Date()): Promise<SubscriptionView> {
    const subscription = await this.subscriptions.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError('The subscription was not found.');
    }
    const current = await this.applyLazyExpiry(subscription, now);
    return toSubscriptionView(current);
  }

  /**
   * Merchant access overlay (BR-SUB-003 / US-SUB-002): blocks WRITE operations
   * when the effective subscription status is EXPIRED (dashboard read-only).
   * Read operations are never evaluated here (the guard skips them). A store
   * without a subscription row is unrestricted, mirroring the database default
   * `status DEFAULT 'TRIAL'` (DATABASE §7.4).
   */
  async assertMerchantWriteAllowed(storeId: string, now = new Date()): Promise<void> {
    const subscription = await this.subscriptions.findByStoreId(storeId);
    if (!subscription) {
      return;
    }
    const current = await this.applyLazyExpiry(subscription, now);
    if (current.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenError(EXPIRED_WRITE_MESSAGE);
    }
  }

  /**
   * Storefront access overlay (DOMAIN-MODEL §6.3): read-only effective-status
   * evaluation used by the public storefront resolver. Deliberately performs
   * NO write — the public path stays read-only by construction; the merchant
   * path performs the lazy TRIAL -> EXPIRED transition on access.
   */
  async resolveStorefrontStatus(storeId: string, now = new Date()): Promise<SubscriptionStatus> {
    const subscription = await this.subscriptions.findByStoreId(storeId);
    if (!subscription) {
      return SubscriptionStatus.TRIAL;
    }
    return effectiveSubscriptionStatus(subscription, now);
  }

  /**
   * TRIAL -> ACTIVE or EXPIRED -> ACTIVE (reactivation, DOMAIN-MODEL §16.1).
   * Guarded conditional UPDATE; a concurrent transition fails closed. The
   * production trigger (e.g. a billing confirmation) is NOT documented for the
   * MVP and is therefore NOT exposed as an endpoint — this is the internal
   * lifecycle capability only.
   */
  async activate(storeId: string, now = new Date()): Promise<SubscriptionView> {
    const subscription = await this.requireSubscription(storeId);

    const target = SubscriptionStatus.ACTIVE;
    if (!isAllowedSubscriptionTransition(subscription.status, target)) {
      throw new StateTransitionError(`Transition ${subscription.status} -> ACTIVE is not allowed.`);
    }

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.subscriptions.updateGuarded(tx, storeId, subscription.status, {
        status: target,
        activatedAt: now,
      }),
    );

    if (result.count === 0) {
      return toSubscriptionView(await this.resolveConcurrentTransition(subscription, storeId));
    }
    return toSubscriptionView({ ...subscription, status: target, activatedAt: now });
  }

  /**
   * TRIAL -> EXPIRED or ACTIVE -> EXPIRED. Guarded conditional UPDATE. The
   * TRIAL variant is triggered automatically by lazy expiry evaluation; the
   * ACTIVE variant has no documented MVP trigger (see class docs).
   */
  async markExpired(storeId: string, now = new Date()): Promise<SubscriptionView> {
    const subscription = await this.requireSubscription(storeId);

    if (subscription.status === SubscriptionStatus.EXPIRED) {
      return toSubscriptionView(subscription);
    }

    if (!isAllowedSubscriptionTransition(subscription.status, SubscriptionStatus.EXPIRED)) {
      throw new StateTransitionError(
        `Transition ${subscription.status} -> EXPIRED is not allowed.`,
      );
    }

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.subscriptions.updateGuarded(tx, storeId, subscription.status, {
        status: SubscriptionStatus.EXPIRED,
        expiresAt: now,
      }),
    );

    if (result.count === 0) {
      return toSubscriptionView(await this.resolveConcurrentTransition(subscription, storeId));
    }
    return toSubscriptionView({
      ...subscription,
      status: SubscriptionStatus.EXPIRED,
      expiresAt: now,
    });
  }

  /**
   * Idempotent lazy expiry: only a TRIAL row whose `trial_ends_at` has elapsed
   * is transitioned TRIAL -> EXPIRED. Repeated evaluation is a no-op after the
   * first transition (guarded UPDATE semantics, DATABASE §26.2). ACTIVE and
   * EXPIRED rows are never auto-transitioned here.
   */
  private async applyLazyExpiry(subscription: Subscription, now: Date): Promise<Subscription> {
    if (subscription.status !== SubscriptionStatus.TRIAL) {
      return subscription;
    }
    if (subscription.trialEndsAt === null || now.getTime() < subscription.trialEndsAt.getTime()) {
      return subscription;
    }

    const expiresAt = now;
    const result = await this.transaction.runWithTenant(subscription.storeId, (tx) =>
      this.subscriptions.updateGuarded(tx, subscription.storeId, subscription.status, {
        status: SubscriptionStatus.EXPIRED,
        expiresAt,
      }),
    );

    if (result.count === 0) {
      // A concurrent request already performed the transition — re-read.
      const fresh = await this.subscriptions.findByStoreId(subscription.storeId);
      return fresh ?? subscription;
    }
    return { ...subscription, status: SubscriptionStatus.EXPIRED, expiresAt };
  }

  private async requireSubscription(storeId: string): Promise<Subscription> {
    const subscription = await this.subscriptions.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError('The subscription was not found.');
    }
    return subscription;
  }

  /** Fails closed on a concurrent transition (guarded UPDATE affected 0 rows). */
  private async resolveConcurrentTransition(
    previous: Subscription,
    storeId: string,
  ): Promise<Subscription> {
    const fresh = await this.subscriptions.findByStoreId(storeId);
    if (!fresh) {
      throw new NotFoundError('The subscription was not found.');
    }
    if (fresh.status === previous.status) {
      throw new StateTransitionError(
        'The subscription changed concurrently; the requested transition was not applied.',
      );
    }
    return fresh;
  }

  private resolveTrialDays(): number {
    const configured = this.config.get<number>('subscriptionTrialDays');
    if (configured === undefined || configured === null) {
      return DEFAULT_TRIAL_DAYS;
    }
    return configured;
  }
}
