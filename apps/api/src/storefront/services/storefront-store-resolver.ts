import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { StorefrontRepository } from '../repositories/storefront.repository';
import { assertStorefrontAvailable } from '../domain/storefront-availability';
import { storefrontSlugFromHost } from '../domain/storefront-host';

/** Header carrying the public storefront slug (works in any environment). */
export const STOREFRONT_SLUG_HEADER = 'x-storefront-slug';

/** Default storefront platform domain (DATABASE §7.2: `store-slug.platform-domain.com`). */
export const DEFAULT_STOREFRONT_DOMAIN = 'platform-domain.com';

/** Default in-memory memoization TTL for a resolved storefront store (ms). */
export const DEFAULT_STOREFRONT_RESOLUTION_CACHE_TTL_MS = 60_000;

/** Hard cap on cached storefront resolutions (memory bound; swept on write). */
export const MAX_STOREFRONT_RESOLUTION_CACHE_ENTRIES = 2_000;

interface CachedStorefrontResolution {
  store: StorefrontResolvedStore;
  expiresAt: number;
}

/** A Store resolved for the public storefront (read-only public context). */
export interface StorefrontResolvedStore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
  timezone: string;
}

/**
 * Resolves the Store for a PUBLIC storefront request.
 *
 * DATABASE.md §5.4/§29.2: storefront requests are anonymous; the Store is
 * resolved from the public storefront URL (store slug/domain) — NEVER from a
 * client-supplied Store ID. Two documented-compatible mechanisms are used:
 *
 *   1. `X-Storefront-Slug` header (explicit, deterministic in any environment).
 *   2. Host-header subdomain: `my-store.platform-domain.com` -> slug `my-store`
 *      when the host ends with the configured storefront platform domain
 *      (Phase 21: STOREFRONT_HOST_RESOLUTION_ENABLED, default on in
 *      production). Root domain / www / localhost / foreign hosts are never
 *      treated as storefronts.
 *
 * Resolution is fail-closed: an unknown slug, a missing host header, or a
 * non-ACTIVE store all surface as NOT_FOUND (no existence leak), matching the
 * public `anon` RLS policy set that exposes only ACTIVE storefront data.
 *
 * Subscription access overlay (Phase 14, DOMAIN-MODEL §6.3): after the Store
 * resolves, the effective subscription status is evaluated READ-ONLY through
 * the subscription domain; an EXPIRED subscription disables the storefront
 * regardless of Store status (also NOT_FOUND — no existence leak). The public
 * path performs no writes: the merchant path performs the lazy expiry
 * transition on access.
 */
@Injectable()
export class StorefrontStoreResolver {
  private readonly cache = new Map<string, CachedStorefrontResolution>();
  private readonly ttlMs: number;

  constructor(
    private readonly storefrontRepository: StorefrontRepository,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionService,
  ) {
    const ttl = this.config.get<{ storefrontCacheTtlMs?: number }>('performance')
      ?.storefrontCacheTtlMs;
    this.ttlMs =
      Number.isInteger(ttl) && (ttl as number) >= 0 ? (ttl as number) : 0;
  }

  async resolve(request: Pick<Request, 'headers'>): Promise<StorefrontResolvedStore> {
    const slug = this.resolveSlug(request);
    if (!slug) {
      throw new NotFoundError('The storefront was not found.');
    }

    if (this.ttlMs > 0) {
      const cached = this.readCache(slug);
      if (cached) {
        return cached;
      }
    }

    const store = await this.storefrontRepository.findStoreBySlug(slug);
    if (!store) {
      throw new NotFoundError('The storefront was not found.');
    }

    const subscriptionStatus = await this.subscriptions.resolveStorefrontStatus(store.id);

    assertStorefrontAvailable(store, subscriptionStatus);

    const resolved: StorefrontResolvedStore = {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      currency: store.currency,
      timezone: store.timezone,
    };

    if (this.ttlMs > 0) {
      this.writeCache(slug, resolved);
    }

    return resolved;
  }

  /** Test/ops hook — drops every memoized resolution. */
  clearCache(): void {
    this.cache.clear();
  }

  private readCache(slug: string): StorefrontResolvedStore | null {
    const entry = this.cache.get(slug);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(slug);
      return null;
    }
    return entry.store;
  }

  private writeCache(slug: string, store: StorefrontResolvedStore): void {
    if (this.cache.size >= MAX_STOREFRONT_RESOLUTION_CACHE_ENTRIES) {
      this.sweepExpired();
    }
    if (this.cache.size >= MAX_STOREFRONT_RESOLUTION_CACHE_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(slug, { store, expiresAt: Date.now() + this.ttlMs });
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private resolveSlug(request: Pick<Request, 'headers'>): string | undefined {
    const header = request.headers?.[STOREFRONT_SLUG_HEADER];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim().toLowerCase();
    }

    // Host-based production resolution is gated by
    // STOREFRONT_HOST_RESOLUTION_ENABLED (default on in production) so local
    // development hosts (localhost / 127.0.0.1) are never interpreted as
    // storefronts unless explicitly configured.
    const hostResolutionEnabled = this.config.get<boolean>('storefrontHostResolutionEnabled');
    if (hostResolutionEnabled === false) {
      return undefined;
    }

    const host = request.headers?.host;
    if (typeof host !== 'string' || host.trim().length === 0) {
      return undefined;
    }

    const platformDomain = this.config.get<string>('storefrontDomain') ?? DEFAULT_STOREFRONT_DOMAIN;
    return storefrontSlugFromHost(host, platformDomain);
  }
}
