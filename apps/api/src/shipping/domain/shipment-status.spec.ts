import { ShipmentStatus } from '@prisma/client';
import { StateTransitionError } from '../../common/errors/domain-exceptions';
import {
  assertShipmentTransition,
  isShipmentTerminal,
} from './shipment-status';

describe('shipment lifecycle (Phase 27 — Part 7/9)', () => {
  it('allows the documented forward delivery chain', () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.CREATED, ShipmentStatus.HANDED_TO_COURIER),
    ).not.toThrow();
    expect(() =>
      assertShipmentTransition(ShipmentStatus.HANDED_TO_COURIER, ShipmentStatus.AT_DELIVERY_CENTER),
    ).not.toThrow();
    expect(() =>
      assertShipmentTransition(ShipmentStatus.AT_DELIVERY_CENTER, ShipmentStatus.OUT_FOR_DELIVERY),
    ).not.toThrow();
    expect(() =>
      assertShipmentTransition(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED),
    ).not.toThrow();
  });

  it('allows rejection/failure/return paths', () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.CREATED, ShipmentStatus.REJECTED),
    ).not.toThrow();
    expect(() =>
      assertShipmentTransition(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED),
    ).not.toThrow();
    expect(() =>
      assertShipmentTransition(ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.RETURNED),
    ).not.toThrow();
  });

  it('rejects illegal and backward transitions', () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.DELIVERED, ShipmentStatus.CREATED),
    ).toThrow(StateTransitionError);
    expect(() =>
      assertShipmentTransition(ShipmentStatus.AT_DELIVERY_CENTER, ShipmentStatus.CREATED),
    ).toThrow(StateTransitionError);
    expect(() =>
      assertShipmentTransition(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.CREATED),
    ).toThrow(StateTransitionError);
  });

  it('rejects self-transitions (no-op handled by the caller as idempotent)', () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.CREATED, ShipmentStatus.CREATED),
    ).toThrow(StateTransitionError);
  });

  it('treats DELIVERED / CANCELLED / RETURNED as terminal', () => {
    expect(isShipmentTerminal(ShipmentStatus.DELIVERED)).toBe(true);
    expect(isShipmentTerminal(ShipmentStatus.CANCELLED)).toBe(true);
    expect(isShipmentTerminal(ShipmentStatus.RETURNED)).toBe(true);
    expect(isShipmentTerminal(ShipmentStatus.CREATED)).toBe(false);
    expect(isShipmentTerminal(ShipmentStatus.OUT_FOR_DELIVERY)).toBe(false);
  });
});
