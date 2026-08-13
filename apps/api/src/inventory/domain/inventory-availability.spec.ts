import {
  availableQuantity,
  canAdjust,
  canReserve,
  computeAvailable,
} from './inventory-availability';

describe('inventory availability (docs/DATABASE.md §13)', () => {
  describe('available = on_hand - reserved (derived, never stored)', () => {
    it('computes the derived available quantity', () => {
      expect(computeAvailable(10, 3)).toBe(7);
      expect(computeAvailable(10, 10)).toBe(0);
      expect(computeAvailable(0, 0)).toBe(0);
    });
  });

  describe('guarded ADJUST condition (on_hand + delta >= reserved)', () => {
    it('allows a delta that keeps on_hand at or above reserved', () => {
      // on_hand=10, reserved=3, delta=-7 -> on_hand becomes 3 == reserved.
      expect(canAdjust(10, 3, -7)).toBe(true);
      // Positive deltas always pass.
      expect(canAdjust(10, 3, 5)).toBe(true);
    });

    it('rejects a delta that would break on_hand >= reserved (the FINAL CHECK)', () => {
      // on_hand=10, reserved=3, delta=-8 -> on_hand becomes 2 < reserved=3.
      expect(canAdjust(10, 3, -8)).toBe(false);
      // The documented condition `on_hand + delta >= 0` is subsumed: reserved
      // is non-negative, so `>= reserved` is the stronger, invariant-preserving
      // guard that must be enforced by the atomic UPDATE.
      expect(canAdjust(5, 5, -1)).toBe(false);
    });
  });

  describe('guarded RESERVE condition (available >= quantity)', () => {
    it('allows a reservation up to the remaining available quantity', () => {
      expect(canReserve(10, 3, 7)).toBe(true);
      expect(canReserve(10, 0, 10)).toBe(true);
    });

    it('rejects a reservation beyond the remaining available quantity', () => {
      expect(canReserve(10, 3, 8)).toBe(false);
      expect(canReserve(10, 10, 1)).toBe(false);
    });
  });

  it('exposes the remaining reservable quantity', () => {
    expect(availableQuantity(10, 3)).toBe(7);
  });
});
