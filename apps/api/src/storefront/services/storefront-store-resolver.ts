import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { StorefrontRepository } from '../repositories/storefront.repository';
import { assertStorefrontAvailable } from '../domain/storefront-availability';

/** Header carrying the public storefront slug (works in any environment). */
export const STOREFRONT_SLUG_HEADER = 'x-storefront-slug';

/** Default storefront platform domain (DATABASE §7.2: `store-slug.platform-domain.com`). */
export const DEFAULT_STOREFRONT_DOMAIN = 'platform-domain.com';

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
 *      when the host ends with the configured storefront platform domain.
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
  constructor(
    private readonly storefrontRepository: StorefrontRepository,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  async resolve(request: Pick<Request, 'headers'>): Promise<StorefrontResolvedStore> {
    const slug = this.resolveSlug(request);
    if (!slug) {
      throw new NotFoundError('The storefront was not found.');
    }

    const store = await this.storefrontRepository.findStoreBySlug(slug);
    if (!store) {
      throw new NotFoundError('The storefront was not found.');
    }

    const subscriptionStatus = await this.subscriptions.resolveStorefrontStatus(store.id);

    assertStorefrontAvailable(store, subscriptionStatus);

    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      currency: store.currency,
      timezone: store.timezone,
    };
  }

  private resolveSlug(request: Pick<Request, 'headers'>): string | undefined {
    const header = request.headers?.[STOREFRONT_SLUG_HEADER];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim().toLowerCase();
    }

    const host = request.headers?.host;
    if (typeof host === 'string' && host.trim().length > 0) {
      return this.slugFromHost(host);
    }

    return undefined;
  }

  private slugFromHost(host: string): string | undefined {
    const platformDomain = this.config.get<string>('storefrontDomain') ?? DEFAULT_STOREFRONT_DOMAIN;
    // Strip the port (e.g. `my-store.platform-domain.com:3000`).
    const hostname = host.split(':')[0].toLowerCase();
    const suffix = `.${platformDomain.toLowerCase()}`;
    if (!hostname.endsWith(suffix)) {
      return undefined;
    }
    const slug = hostname.slice(0, -suffix.length);
    return slug.length > 0 && !slug.includes('.') ? slug : undefined;
  }
}
