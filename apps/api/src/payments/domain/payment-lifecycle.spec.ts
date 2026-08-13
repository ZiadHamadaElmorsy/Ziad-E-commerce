import { PaymentStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import { assertPaymentTransition, attemptTimestamps } from './payment-lifecycle';

describe('payment-lifecycle', () => {
  describe('assertPaymentTransition', () => {
    it('allows the documented normal flow PENDING -> PROCESSING -> SUCCEEDED', () => {
      expect(() =>
        assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING),
      ).not.toThrow();
      expect(() =>
        assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED),
      ).not.toThrow();
    });

    it('allows the documented failure flow PENDING -> PROCESSING -> FAILED', () => {
      expect(() =>
        assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING),
      ).not.toThrow();
      expect(() =>
        assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.FAILED),
      ).not.toThrow();
    });

    it('rejects direct PENDING -> SUCCEEDED (must pass through PROCESSING)', () => {
      expect(() => assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.SUCCEEDED)).toThrow(
        StateTransitionError,
      );
    });

    it('rejects direct PENDING -> FAILED (documented failure flow passes PROCESSING)', () => {
      expect(() => assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.FAILED)).toThrow(
        StateTransitionError,
      );
    });

    it('rejects backward and self transitions', () => {
      expect(() =>
        assertPaymentTransition(PaymentStatus.SUCCEEDED, PaymentStatus.PROCESSING),
      ).toThrow(StateTransitionError);
      expect(() => assertPaymentTransition(PaymentStatus.FAILED, PaymentStatus.PENDING)).toThrow(
        StateTransitionError,
      );
      expect(() =>
        assertPaymentTransition(PaymentStatus.PROCESSING, PaymentStatus.PROCESSING),
      ).toThrow(StateTransitionError);
      expect(() =>
        assertPaymentTransition(PaymentStatus.SUCCEEDED, PaymentStatus.SUCCEEDED),
      ).toThrow(StateTransitionError);
    });

    it('protects terminal states: SUCCEEDED/FAILED never move', () => {
      expect(() => assertPaymentTransition(PaymentStatus.SUCCEEDED, PaymentStatus.FAILED)).toThrow(
        StateTransitionError,
      );
      expect(() => assertPaymentTransition(PaymentStatus.FAILED, PaymentStatus.SUCCEEDED)).toThrow(
        StateTransitionError,
      );
    });
  });

  describe('attemptTimestamps', () => {
    it('writes initiated_at on PROCESSING', () => {
      const timestamps = attemptTimestamps(PaymentStatus.PROCESSING);
      expect(timestamps.initiatedAt).toBeInstanceOf(Date);
      expect(timestamps.completedAt).toBeUndefined();
    });

    it('writes completed_at on SUCCEEDED and FAILED', () => {
      expect(attemptTimestamps(PaymentStatus.SUCCEEDED).completedAt).toBeInstanceOf(Date);
      expect(attemptTimestamps(PaymentStatus.FAILED).completedAt).toBeInstanceOf(Date);
      expect(attemptTimestamps(PaymentStatus.SUCCEEDED).initiatedAt).toBeUndefined();
    });
  });
});
