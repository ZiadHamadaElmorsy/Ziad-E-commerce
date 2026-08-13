import { SubscriptionStatus } from '@prisma/client';
import {
  effectiveSubscriptionStatus,
  isAllowedSubscriptionTransition,
  isSubscriptionExpired,
  SUBSCRIPTION_STATES,
} from './subscription-status';

describe('subscription status lifecycle (DOMAIN-MODEL §16.1, DATABASE §20.2)', () => {
  it('exposes exactly the three FINALIZED states', () => {
    expect(SUBSCRIPTION_STATES).toEqual([
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.EXPIRED,
    ]);
  });

  describe('isAllowedSubscriptionTransition', () => {
    it.each([
      [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, true],
      [SubscriptionStatus.TRIAL, SubscriptionStatus.EXPIRED, true],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED, true],
      [SubscriptionStatus.EXPIRED, SubscriptionStatus.ACTIVE, true],
    ])('allows the FINALIZED transition %s -> %s', (from, to, allowed) => {
      expect(isAllowedSubscriptionTransition(from, to)).toBe(allowed);
    });

    it.each([
      [SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
      [SubscriptionStatus.EXPIRED, SubscriptionStatus.EXPIRED],
      [SubscriptionStatus.EXPIRED, SubscriptionStatus.TRIAL],
      [SubscriptionStatus.TRIAL, 'PAST_DUE' as SubscriptionStatus],
      [SubscriptionStatus.ACTIVE, 'CANCELLED' as SubscriptionStatus],
      [SubscriptionStatus.TRIAL, 'SUSPENDED' as SubscriptionStatus],
    ])('rejects the non-FINALIZED transition %s -> %s', (from, to) => {
      expect(isAllowedSubscriptionTransition(from, to)).toBe(false);
    });

    it('never allows PAST_DUE / CANCELLED / SUSPENDED (not MVP states)', () => {
      for (const state of SUBSCRIPTION_STATES) {
        expect(isAllowedSubscriptionTransition(state, 'PAST_DUE' as SubscriptionStatus)).toBe(
          false,
        );
        expect(isAllowedSubscriptionTransition(state, 'CANCELLED' as SubscriptionStatus)).toBe(
          false,
        );
        expect(isAllowedSubscriptionTransition(state, 'SUSPENDED' as SubscriptionStatus)).toBe(
          false,
        );
      }
    });
  });

  describe('effectiveSubscriptionStatus', () => {
    const now = new Date('2026-08-20T12:00:00Z');

    it('returns the stored status for ACTIVE and EXPIRED rows', () => {
      expect(
        effectiveSubscriptionStatus({ status: SubscriptionStatus.ACTIVE, trialEndsAt: null }, now),
      ).toBe(SubscriptionStatus.ACTIVE);
      expect(
        effectiveSubscriptionStatus({ status: SubscriptionStatus.EXPIRED, trialEndsAt: null }, now),
      ).toBe(SubscriptionStatus.EXPIRED);
    });

    it('keeps TRIAL while the trial end date is in the future', () => {
      expect(
        effectiveSubscriptionStatus(
          { status: SubscriptionStatus.TRIAL, trialEndsAt: new Date('2026-08-25T00:00:00Z') },
          now,
        ),
      ).toBe(SubscriptionStatus.TRIAL);
    });

    it('treats TRIAL as EXPIRED once the trial end date has passed', () => {
      expect(
        effectiveSubscriptionStatus(
          { status: SubscriptionStatus.TRIAL, trialEndsAt: new Date('2026-08-01T00:00:00Z') },
          now,
        ),
      ).toBe(SubscriptionStatus.EXPIRED);
    });

    it('treats TRIAL as EXPIRED exactly at the boundary instant (now >= trial_ends_at)', () => {
      const boundary = new Date('2026-08-20T12:00:00Z');
      expect(
        effectiveSubscriptionStatus(
          { status: SubscriptionStatus.TRIAL, trialEndsAt: boundary },
          now,
        ),
      ).toBe(SubscriptionStatus.EXPIRED);
      expect(
        effectiveSubscriptionStatus(
          { status: SubscriptionStatus.TRIAL, trialEndsAt: new Date('2026-08-20T12:00:00.001Z') },
          now,
        ),
      ).toBe(SubscriptionStatus.TRIAL);
    });

    it('never auto-expires a TRIAL row without a trial end date', () => {
      expect(
        effectiveSubscriptionStatus({ status: SubscriptionStatus.TRIAL, trialEndsAt: null }, now),
      ).toBe(SubscriptionStatus.TRIAL);
    });

    it('does NOT auto-expire an ACTIVE row (expires_at is set on ->EXPIRED, not a future target)', () => {
      expect(
        effectiveSubscriptionStatus({ status: SubscriptionStatus.ACTIVE, trialEndsAt: null }, now),
      ).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('isSubscriptionExpired', () => {
    it('flags an EXPIRED-effective subscription', () => {
      expect(
        isSubscriptionExpired(
          {
            status: SubscriptionStatus.TRIAL,
            trialEndsAt: new Date('2026-08-01T00:00:00Z'),
          },
          new Date('2026-08-20T12:00:00Z'),
        ),
      ).toBe(true);
    });

    it('does not flag TRIAL/ACTIVE subscriptions', () => {
      const now = new Date('2026-08-20T12:00:00Z');
      expect(
        isSubscriptionExpired(
          { status: SubscriptionStatus.TRIAL, trialEndsAt: new Date('2026-08-25T00:00:00Z') },
          now,
        ),
      ).toBe(false);
      expect(
        isSubscriptionExpired({ status: SubscriptionStatus.ACTIVE, trialEndsAt: null }, now),
      ).toBe(false);
    });
  });
});
