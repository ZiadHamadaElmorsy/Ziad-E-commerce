import { CartStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import { assertCartUsable, isCartExpiredDue } from './cart-status';

describe('cart lifecycle (docs/DOMAIN-MODEL.md §10.1, docs/DATABASE.md §17.4)', () => {
  describe('assertCartUsable', () => {
    it('accepts an ACTIVE cart', () => {
      expect(() => assertCartUsable({ status: CartStatus.ACTIVE })).not.toThrow();
    });

    it('rejects an EXPIRED cart with STATE_TRANSITION', () => {
      expect(() => assertCartUsable({ status: CartStatus.EXPIRED })).toThrow(StateTransitionError);
    });

    it('rejects a COMPLETED cart with STATE_TRANSITION', () => {
      expect(() => assertCartUsable({ status: CartStatus.COMPLETED })).toThrow(
        StateTransitionError,
      );
    });
  });

  describe('isCartExpiredDue', () => {
    const now = new Date('2026-08-13T00:00:00Z');

    it('is false when the cart has no expires_at bound', () => {
      expect(isCartExpiredDue({ status: CartStatus.ACTIVE, expiresAt: null }, now)).toBe(false);
    });

    it('is false when the expiry is in the future', () => {
      expect(
        isCartExpiredDue(
          { status: CartStatus.ACTIVE, expiresAt: new Date('2026-08-14T00:00:00Z') },
          now,
        ),
      ).toBe(false);
    });

    it('is true when the expiry has passed', () => {
      expect(
        isCartExpiredDue(
          { status: CartStatus.ACTIVE, expiresAt: new Date('2026-08-12T00:00:00Z') },
          now,
        ),
      ).toBe(true);
    });

    it('is true when the expiry equals now (boundary)', () => {
      expect(isCartExpiredDue({ status: CartStatus.ACTIVE, expiresAt: now }, now)).toBe(true);
    });

    it('is false for a non-ACTIVE cart even when expired (already transitioned)', () => {
      expect(isCartExpiredDue({ status: CartStatus.EXPIRED, expiresAt: now }, now)).toBe(false);
    });
  });
});
