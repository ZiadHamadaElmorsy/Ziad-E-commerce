import { StoreStatus, SubscriptionStatus } from '@prisma/client';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { assertStorefrontAvailable } from './storefront-availability';

describe('storefront availability', () => {
  it('accepts an ACTIVE store', () => {
    expect(() => assertStorefrontAvailable({ status: StoreStatus.ACTIVE })).not.toThrow();
  });

  it.each([StoreStatus.DISABLED, StoreStatus.SUSPENDED])(
    'fails closed with NOT_FOUND for a %s store',
    (status) => {
      expect(() => assertStorefrontAvailable({ status })).toThrow(NotFoundError);
    },
  );

  describe('subscription access overlay (Phase 14)', () => {
    it('accepts an ACTIVE store with a TRIAL subscription', () => {
      expect(() =>
        assertStorefrontAvailable({ status: StoreStatus.ACTIVE }, SubscriptionStatus.TRIAL),
      ).not.toThrow();
    });

    it('accepts an ACTIVE store with an ACTIVE subscription', () => {
      expect(() =>
        assertStorefrontAvailable({ status: StoreStatus.ACTIVE }, SubscriptionStatus.ACTIVE),
      ).not.toThrow();
    });

    it('fails closed with NOT_FOUND when the subscription is EXPIRED (regardless of store status)', () => {
      expect(() =>
        assertStorefrontAvailable({ status: StoreStatus.ACTIVE }, SubscriptionStatus.EXPIRED),
      ).toThrow(NotFoundError);
    });

    it('fails closed with NOT_FOUND when the store is not ACTIVE even with a valid subscription', () => {
      expect(() =>
        assertStorefrontAvailable({ status: StoreStatus.DISABLED }, SubscriptionStatus.ACTIVE),
      ).toThrow(NotFoundError);
    });
  });
});
