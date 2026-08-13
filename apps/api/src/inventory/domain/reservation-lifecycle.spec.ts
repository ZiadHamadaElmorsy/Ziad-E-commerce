import { ReservationStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import {
  assertReservationTransition,
  invalidTerminalTransitionMessage,
  resolveTerminalTransition,
} from './reservation-lifecycle';

describe('reservation lifecycle (docs/DOMAIN-MODEL.md §8.2, docs/DATABASE.md §14)', () => {
  describe('assertReservationTransition', () => {
    it('allows the two documented transitions only: ACTIVE -> CONSUMED / ACTIVE -> RELEASED', () => {
      expect(() =>
        assertReservationTransition(ReservationStatus.ACTIVE, ReservationStatus.CONSUMED),
      ).not.toThrow();
      expect(() =>
        assertReservationTransition(ReservationStatus.ACTIVE, ReservationStatus.RELEASED),
      ).not.toThrow();
    });

    it('rejects every other transition (STATE_TRANSITION)', () => {
      expect(() =>
        assertReservationTransition(ReservationStatus.CONSUMED, ReservationStatus.ACTIVE),
      ).toThrow(StateTransitionError);
      expect(() =>
        assertReservationTransition(ReservationStatus.RELEASED, ReservationStatus.ACTIVE),
      ).toThrow(StateTransitionError);
      expect(() =>
        assertReservationTransition(ReservationStatus.CONSUMED, ReservationStatus.RELEASED),
      ).toThrow(StateTransitionError);
      expect(() =>
        assertReservationTransition(ReservationStatus.RELEASED, ReservationStatus.CONSUMED),
      ).toThrow(StateTransitionError);
    });
  });

  describe('resolveTerminalTransition', () => {
    it('is a no-op when the reservation is already in the target state (idempotency)', () => {
      expect(
        resolveTerminalTransition(ReservationStatus.RELEASED, ReservationStatus.RELEASED),
      ).toEqual({
        kind: 'noop',
      });
      expect(
        resolveTerminalTransition(ReservationStatus.CONSUMED, ReservationStatus.CONSUMED),
      ).toEqual({
        kind: 'noop',
      });
    });

    it('proceeds when the reservation is ACTIVE', () => {
      expect(
        resolveTerminalTransition(ReservationStatus.ACTIVE, ReservationStatus.RELEASED),
      ).toEqual({
        kind: 'proceed',
      });
      expect(
        resolveTerminalTransition(ReservationStatus.ACTIVE, ReservationStatus.CONSUMED),
      ).toEqual({
        kind: 'proceed',
      });
    });

    it('is invalid when the reservation is in the OTHER terminal state', () => {
      expect(
        resolveTerminalTransition(ReservationStatus.CONSUMED, ReservationStatus.RELEASED),
      ).toEqual({
        kind: 'invalid',
      });
      expect(
        resolveTerminalTransition(ReservationStatus.RELEASED, ReservationStatus.CONSUMED),
      ).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('invalidTerminalTransitionMessage', () => {
    it('explains the forbidden transition', () => {
      expect(invalidTerminalTransitionMessage(ReservationStatus.RELEASED)).toBe(
        'Cannot release a reservation that has already been consumed.',
      );
      expect(invalidTerminalTransitionMessage(ReservationStatus.CONSUMED)).toBe(
        'Cannot consume a reservation that has already been released.',
      );
    });
  });
});
