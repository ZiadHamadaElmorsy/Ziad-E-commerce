import { Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenError, TenantContextRequiredError } from '../common/errors/domain-exceptions';
import type { TenantContext } from './tenant-context';

/** Default in-memory memoization TTL for a resolved tenant (ms). */
export const DEFAULT_TENANT_RESOLUTION_CACHE_TTL_MS = 60_000;

/** Hard cap on cached tenant resolutions (memory bound; swept on write). */
export const MAX_TENANT_RESOLUTION_CACHE_ENTRIES = 5_000;

interface CachedTenantResolution {
  tenant: TenantContext;
  expiresAt: number;
}

/**
 * Resolves the trusted tenant identity for an authenticated user.
 *
 * The ONLY allowed resolution chain:
 *
 *   Authenticated User -> ACTIVE StoreMembership -> Store
 *
 * A candidate store identifier supplied by the client (X-Store-Id header or
 * `:storeId` route parameter) is used strictly as a *lookup key* to select the
 * membership; it is NEVER treated as an authorization source. If the user has
 * no matching ACTIVE membership the resolution fails closed.
 *
 * PERFORMANCE (Phase 25 — production audit): every authenticated request runs
 * this resolution BEFORE the actual query (one database round-trip). ACTIVE
 * membership/store rows change rarely (store creation, membership role edits),
 * so successful resolutions are memoized in a bounded in-memory cache
 * (default 60s, TENANT_RESOLUTION_CACHE_TTL_MS; 0 disables). Only SUCCESSFUL
 * resolutions are cached — authorization failures (Forbidden /
 * TenantContextRequired) are NEVER cached, so a just-created store or a
 * revoked membership is reflected on the next request.
 */
@Injectable()
export class TenantContextService {
  private readonly cache = new Map<string, CachedTenantResolution>();
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    ttlMs: number = DEFAULT_TENANT_RESOLUTION_CACHE_TTL_MS,
  ) {
    this.ttlMs = Number.isInteger(ttlMs) && (ttlMs as number) >= 0 ? (ttlMs as number) : 0;
  }

  /**
   * @param authUserId        verified identity (from the authentication boundary)
   * @param candidateStoreId  optional client-selected store (lookup key only)
   * @throws ForbiddenError             no membership / no access to the store
   * @throws TenantContextRequiredError multiple stores, none selected
   */
  async resolveForUser(authUserId: string, candidateStoreId?: string): Promise<TenantContext> {
    const cacheKey = this.cacheKey(authUserId, candidateStoreId);

    if (this.ttlMs > 0) {
      const cached = this.readCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const activeMemberships = await this.prisma.storeMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        user: { authUserId },
      },
      include: { store: true },
    });

    let membership = activeMemberships[0];

    if (candidateStoreId) {
      const match = activeMemberships.find((m) => m.storeId === candidateStoreId);
      if (!match) {
        throw new ForbiddenError('You do not have access to the requested store.');
      }
      membership = match;
    } else if (activeMemberships.length === 0) {
      throw new ForbiddenError('No active store membership for this user.');
    } else if (activeMemberships.length > 1) {
      throw new TenantContextRequiredError(
        'Multiple stores are available; a store must be selected.',
      );
    }

    const tenant: TenantContext = {
      membership: {
        id: membership.id,
        storeId: membership.storeId,
        role: membership.role,
        status: membership.status,
      },
      store: {
        id: membership.store.id,
        slug: membership.store.slug,
        name: membership.store.name,
        status: membership.store.status,
      },
    };

    if (this.ttlMs > 0) {
      this.writeCache(cacheKey, tenant);
    }

    return tenant;
  }

  /** Test/ops hook — drops every memoized resolution. */
  clearCache(): void {
    this.cache.clear();
  }

  private cacheKey(authUserId: string, candidateStoreId?: string): string {
    return `${authUserId}|${candidateStoreId ?? ''}`;
  }

  private readCache(key: string): TenantContext | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.tenant;
  }

  private writeCache(key: string, tenant: TenantContext): void {
    if (this.cache.size >= MAX_TENANT_RESOLUTION_CACHE_ENTRIES) {
      this.sweepExpired();
    }
    if (this.cache.size >= MAX_TENANT_RESOLUTION_CACHE_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(key, { tenant, expiresAt: Date.now() + this.ttlMs });
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}
