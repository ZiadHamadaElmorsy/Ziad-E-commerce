import { Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma, Store } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ConflictError,
  NotFoundError,
  TenantContextRequiredError,
  UnauthorizedError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { assertValidStoreSlug, normalizeStoreSlug } from '../domain/store-slug';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { StoreView } from '../identity.types';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';
import { StoreRepository } from '../repositories/store.repository';
import { UserRepository } from '../repositories/user.repository';

/** Default currency (MVP-SCOPE / BRD / USER-STORIES: "Currency defaults to EGP"). */
const DEFAULT_CURRENCY = 'EGP';

/**
 * Identity & Tenancy application service.
 *
 * Implements the Phase 2 Store lifecycle on top of the FINAL database
 * contract and the Phase 1 foundation:
 *
 *   - Store creation      = atomic (Store + exactly one ACTIVE OWNER
 *                           StoreMembership + the TRIAL Subscription) inside
 *                           one transaction (US-SUB-001, DOMAIN-MODEL §16.1).
 *   - Current store read  = resolves the store from the TRUSTED tenant
 *                           context (membership -> store), never from a
 *                           client-supplied store_id.
 *   - Current store patch = tenant-safe, cross-tenant updates impossible.
 *
 * Authorization sources:
 *   - identity comes from the authentication boundary (request context)
 *   - tenant + role come from the database membership (tenant context)
 *   - client input is NEVER treated as an authorization source.
 */
@Injectable()
export class StoreService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly users: UserRepository,
    private readonly stores: StoreRepository,
    private readonly memberships: StoreMembershipRepository,
    private readonly transaction: TransactionService,
    private readonly subscriptions: SubscriptionService,
    private readonly tenants: TenantContextService,
  ) {}

  /**
   * Creates a Store and its OWNER StoreMembership atomically.
   *
   * Transaction boundary:
   *
   *   1. resolve the authenticated user        (before the transaction;
   *      a failed lookup cannot leave partial state)
   *   2. validate the request DTO              (global ValidationPipe)
   *   3. validate the slug                     (domain rule)
   *   4. create the Store
   *   5. create the OWNER ACTIVE membership
   *   6. commit — any failure above rolls everything back
   *
   * A store is never created without its OWNER membership, and slug
   * uniqueness conflicts surface as CONFLICT through the domain error
   * taxonomy (Prisma internals are never exposed).
   */
  async createStore(dto: CreateStoreDto): Promise<StoreView> {
    const authUserId = this.requestContext.getCurrent()?.user?.authUserId;
    if (!authUserId) {
      throw new UnauthorizedError('Authentication required.');
    }

    // Step 1 — resolve the authenticated user to the application User row.
    const user = await this.users.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundError('No application user exists for the authenticated identity.');
    }

    // Step 3 — slug rule (normalized + validated in the domain layer).
    const slug = normalizeStoreSlug(dto.slug);
    assertValidStoreSlug(slug);
    const currency = dto.currency ? dto.currency.toUpperCase() : DEFAULT_CURRENCY;

    try {
      // Steps 4-6 — one transaction: Store + OWNER membership + TRIAL
      // subscription (US-SUB-001: the trial is associated with the Store,
      // carries start/expiration dates and its status is tracked).
      const store = await this.transaction.run(async (tx) => {
        const created = await this.stores.create(tx, { name: dto.name, slug, currency });
        await this.memberships.create(tx, {
          storeId: created.id,
          userId: user.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        });
        await this.subscriptions.startTrial(tx, created.id);
        return created;
      });
      return this.toView(store);
    } catch (error) {
      throw this.mapStoreWriteError(error);
    }
  }

  /**
   * Returns the Store resolved from the trusted Phase 1 tenant context
   * (Authenticated User -> ACTIVE StoreMembership -> Store).
   */
  async getCurrentStore(): Promise<StoreView> {
    const storeId = this.requestContext.getCurrent()?.store?.id;
    if (!storeId) {
      throw new TenantContextRequiredError('A store tenant context is required.');
    }

    const store = await this.stores.findById(storeId);
    if (!store) {
      throw new NotFoundError('The current store could not be found.');
    }
    return this.toView(store);
  }

  /**
   * Updates the current store using the TRUSTED tenant context.
   *
   * The target store id comes exclusively from the resolved context
   * (membership -> store); a client cannot direct this update at another
   * tenant. Only fields defined by the API-SPEC and supported by the FINAL
   * database contract (`name`) are accepted.
   */
  async updateCurrentStore(dto: UpdateStoreDto): Promise<StoreView> {
    const storeId = this.requestContext.getCurrent()?.store?.id;
    if (!storeId) {
      throw new TenantContextRequiredError('A store tenant context is required.');
    }
    const authUserId = this.requestContext.getCurrent()?.user?.authUserId;

    try {
      // Tenant-scoped transaction: RLS sees the correct tenant for the write.
      const updated = await this.transaction.runWithTenant(storeId, async (tx) =>
        this.stores.update(tx, storeId, { name: dto.name }),
      );
      // Phase 25 — invalidate the memoized tenant context so the very next
      // /auth/me (and every tenant-bound read) returns the NEW store name. The
      // tenant TTL cache would otherwise serve the stale store row for up to
      // the full window (caught by the web E2E store-edit test).
      if (authUserId) {
        this.tenants.invalidateForUser(authUserId);
      }
      return this.toView(updated);
    } catch (error) {
      throw this.mapStoreWriteError(error);
    }
  }

  private toView(store: Store): StoreView {
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

  /**
   * Maps known Prisma write errors to the domain error taxonomy. Anything
   * unrecognized is rethrown untouched (AllExceptionsFilter renders it as a
   * generic INTERNAL_SERVER_ERROR — Prisma internals never reach clients).
   */
  private mapStoreWriteError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // stores.slug has a global UNIQUE index; P2002 on create is the slug.
        return new ConflictError('A store with this slug already exists.');
      }
      if (error.code === 'P2025') {
        return new NotFoundError('The store could not be found.');
      }
    }
    return error;
  }
}
