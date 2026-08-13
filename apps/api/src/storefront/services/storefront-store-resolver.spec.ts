import { StoreStatus, SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { StorefrontRepository } from '../repositories/storefront.repository';
import { StorefrontStoreResolver } from './storefront-store-resolver';

describe('StorefrontStoreResolver', () => {
  let storefrontRepository: { findStoreBySlug: jest.Mock };
  let configService: { get: jest.Mock };
  let subscriptions: { resolveStorefrontStatus: jest.Mock };
  let resolver: StorefrontStoreResolver;

  const storeRow = {
    id: 'store-1',
    name: 'My Store',
    slug: 'my-store',
    description: null,
    status: StoreStatus.ACTIVE,
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    storefrontRepository = { findStoreBySlug: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('platform-domain.com') };
    subscriptions = {
      resolveStorefrontStatus: jest.fn().mockResolvedValue(SubscriptionStatus.TRIAL),
    };
    resolver = new StorefrontStoreResolver(
      storefrontRepository as unknown as StorefrontRepository,
      configService as unknown as ConfigService,
      subscriptions as unknown as SubscriptionService,
    );
  });

  function requestWith(headers: Record<string, string | string[] | undefined>) {
    return { headers };
  }

  it('resolves the store from the X-Storefront-Slug header', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);

    const resolved = await resolver.resolve(requestWith({ 'x-storefront-slug': 'my-store' }));

    expect(storefrontRepository.findStoreBySlug).toHaveBeenCalledWith('my-store');
    expect(resolved).toEqual({
      id: 'store-1',
      slug: 'my-store',
      name: 'My Store',
      description: null,
      currency: 'EGP',
      timezone: 'Africa/Cairo',
    });
  });

  it('normalizes the header slug to lowercase', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);

    await resolver.resolve(requestWith({ 'x-storefront-slug': '  My-Store  ' }));

    expect(storefrontRepository.findStoreBySlug).toHaveBeenCalledWith('my-store');
  });

  it('falls back to the Host header subdomain for the storefront platform domain', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);

    await resolver.resolve(requestWith({ host: 'my-store.platform-domain.com' }));

    expect(storefrontRepository.findStoreBySlug).toHaveBeenCalledWith('my-store');
  });

  it('ignores a Host header that is not a storefront subdomain', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);

    // The bare platform domain has no store subdomain.
    await expect(resolver.resolve(requestWith({ host: 'platform-domain.com' }))).rejects.toThrow(
      NotFoundError,
    );
    expect(storefrontRepository.findStoreBySlug).not.toHaveBeenCalled();

    // localhost is never a storefront subdomain.
    await expect(resolver.resolve(requestWith({ host: 'localhost:4000' }))).rejects.toThrow(
      NotFoundError,
    );
    expect(storefrontRepository.findStoreBySlug).not.toHaveBeenCalled();
  });

  it('uses the configured storefront domain for host parsing', async () => {
    configService.get.mockReturnValue('ziad.shop');
    storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);

    await resolver.resolve(requestWith({ host: 'my-store.ziad.shop' }));

    expect(storefrontRepository.findStoreBySlug).toHaveBeenCalledWith('my-store');
  });

  it('fails closed with NOT_FOUND when no slug can be derived', async () => {
    await expect(resolver.resolve(requestWith({}))).rejects.toThrow(NotFoundError);
  });

  it('fails closed with NOT_FOUND for an unknown slug (no existence leak)', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue(null);

    await expect(resolver.resolve(requestWith({ 'x-storefront-slug': 'nope' }))).rejects.toThrow(
      NotFoundError,
    );
  });

  it('fails closed with NOT_FOUND for a non-ACTIVE store', async () => {
    storefrontRepository.findStoreBySlug.mockResolvedValue({
      ...storeRow,
      status: StoreStatus.DISABLED,
    });

    await expect(
      resolver.resolve(requestWith({ 'x-storefront-slug': 'my-store' })),
    ).rejects.toThrow(NotFoundError);
  });

  describe('subscription access overlay (Phase 14)', () => {
    it('resolves the store when the subscription is TRIAL', async () => {
      storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);
      subscriptions.resolveStorefrontStatus.mockResolvedValue(SubscriptionStatus.TRIAL);

      const resolved = await resolver.resolve(requestWith({ 'x-storefront-slug': 'my-store' }));

      expect(subscriptions.resolveStorefrontStatus).toHaveBeenCalledWith('store-1');
      expect(resolved.id).toBe('store-1');
    });

    it('resolves the store when the subscription is ACTIVE', async () => {
      storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);
      subscriptions.resolveStorefrontStatus.mockResolvedValue(SubscriptionStatus.ACTIVE);

      await expect(
        resolver.resolve(requestWith({ 'x-storefront-slug': 'my-store' })),
      ).resolves.toMatchObject({ id: 'store-1' });
    });

    it('fails closed with NOT_FOUND when the subscription is EXPIRED', async () => {
      storefrontRepository.findStoreBySlug.mockResolvedValue(storeRow);
      subscriptions.resolveStorefrontStatus.mockResolvedValue(SubscriptionStatus.EXPIRED);

      await expect(
        resolver.resolve(requestWith({ 'x-storefront-slug': 'my-store' })),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
