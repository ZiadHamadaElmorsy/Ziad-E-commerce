import { OrderStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import { assertOrderTransition, transitionTimestamps } from './order-lifecycle';

describe('order lifecycle (docs/DOMAIN-MODEL.md §12.3, docs/DATABASE.md §15.2)', () => {
  it('allows the exact documented normal path PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED', () => {
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).not.toThrow();
    expect(() =>
      assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING),
    ).not.toThrow();
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).not.toThrow();
    expect(() => assertOrderTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).not.toThrow();
  });

  it('allows cancellation only from PENDING or CONFIRMED', () => {
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)).not.toThrow();
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).not.toThrow();
  });

  it('allows RETURNED only from CONFIRMED, PROCESSING or SHIPPED (Phase 28 — F-10)', () => {
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.RETURNED)).not.toThrow();
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.RETURNED)).not.toThrow();
    expect(() => assertOrderTransition(OrderStatus.SHIPPED, OrderStatus.RETURNED)).not.toThrow();
  });

  it('rejects RETURNED from PENDING, DELIVERED or CANCELLED (terminal protection)', () => {
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.RETURNED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.DELIVERED, OrderStatus.RETURNED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.RETURNED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.RETURNED, OrderStatus.RETURNED)).toThrow(
      StateTransitionError,
    );
  });

  it('rejects forward-state skipping', () => {
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.PROCESSING)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.SHIPPED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.DELIVERED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.SHIPPED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.DELIVERED)).toThrow(
      StateTransitionError,
    );
  });

  it('rejects arbitrary / self transitions', () => {
    expect(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.PENDING)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.CONFIRMED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.PROCESSING)).toThrow(
      StateTransitionError,
    );
  });

  it('rejects backward transitions (terminal states never move backwards)', () => {
    expect(() => assertOrderTransition(OrderStatus.CONFIRMED, OrderStatus.PENDING)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.CONFIRMED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.SHIPPED, OrderStatus.PROCESSING)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.DELIVERED, OrderStatus.SHIPPED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.DELIVERED, OrderStatus.PENDING)).toThrow(
      StateTransitionError,
    );
  });

  it('rejects cancellation from non-cancellable states (terminal protection)', () => {
    expect(() => assertOrderTransition(OrderStatus.PROCESSING, OrderStatus.CANCELLED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.CANCELLED)).toThrow(
      StateTransitionError,
    );
  });

  it('rejects any transition out of the CANCELLED terminal state', () => {
    expect(() => assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.PENDING)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toThrow(
      StateTransitionError,
    );
    expect(() => assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.PROCESSING)).toThrow(
      StateTransitionError,
    );
  });

  it('transitionTimestamps sets returned_at only on -> RETURNED', () => {
    const returned = transitionTimestamps(OrderStatus.RETURNED);
    expect(returned.returnedAt).toBeInstanceOf(Date);
    expect(returned.confirmedAt).toBeUndefined();
    expect(returned.cancelledAt).toBeUndefined();

    const shipped = transitionTimestamps(OrderStatus.SHIPPED);
    expect(shipped.returnedAt).toBeUndefined();
  });

  it('transitionTimestamps sets confirmed_at only on -> CONFIRMED and cancelled_at only on -> CANCELLED', () => {
    const confirmed = transitionTimestamps(OrderStatus.CONFIRMED);
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    expect(confirmed.cancelledAt).toBeUndefined();

    const cancelled = transitionTimestamps(OrderStatus.CANCELLED);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.confirmedAt).toBeUndefined();

    const processing = transitionTimestamps(OrderStatus.PROCESSING);
    expect(processing.confirmedAt).toBeUndefined();
    expect(processing.cancelledAt).toBeUndefined();
  });
});
