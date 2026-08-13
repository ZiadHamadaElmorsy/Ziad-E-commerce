/**
 * Pure availability/guard helpers for the FINAL inventory invariants
 * (docs/DATABASE.md §13, §32; docs/DOMAIN-MODEL.md §8.1).
 *
 *   available = on_hand_quantity - reserved_quantity
 *
 * `available` is ALWAYS derived and NEVER stored. The database guarantees
 * `CHECK (on_hand_quantity >= reserved_quantity)` so available >= 0.
 *
 * The guarded mutation conditions documented in docs/DATABASE.md §13.3:
 *
 *   (1) adjust : on_hand + delta >= reserved
 *        - preserves the FINAL invariant on_hand >= reserved. This condition
 *          subsumes the documented `on_hand + delta >= 0` because
 *          reserved_quantity >= 0 (its own CHECK constraint).
 *   (2) reserve: on_hand - reserved >= qty      (available >= requested)
 *
 * These pure helpers verify the guarded-update CONTRACT at the unit level.
 * The actual enforcement happens inside the atomic SQL guarded UPDATEs in
 * InventoryRepository — never as an application-side read-then-write decision.
 */
export function computeAvailable(onHandQuantity: number, reservedQuantity: number): number {
  return onHandQuantity - reservedQuantity;
}

/** True when the guarded ADJUST update may proceed (docs/DATABASE.md §13.3). */
export function canAdjust(
  onHandQuantity: number,
  reservedQuantity: number,
  delta: number,
): boolean {
  return onHandQuantity + delta >= reservedQuantity;
}

/** True when the guarded RESERVE update may proceed (docs/DATABASE.md §13.3). */
export function canReserve(
  onHandQuantity: number,
  reservedQuantity: number,
  quantity: number,
): boolean {
  return onHandQuantity - reservedQuantity >= quantity;
}

/** The quantity currently reservable (available = on_hand - reserved). */
export function availableQuantity(onHandQuantity: number, reservedQuantity: number): number {
  return computeAvailable(onHandQuantity, reservedQuantity);
}
