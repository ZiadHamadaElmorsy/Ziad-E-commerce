import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/v1/variants/:variantId/inventory/adjust request body
 * (docs/API-SPEC.md §19 "Adjust Inventory").
 *
 *   { "quantity": 10, "reason": "INITIAL_STOCK" }
 *
 * - `quantity` is a SIGNED delta applied to on_hand_quantity
 *   (docs/DATABASE.md §13.3): positive adds stock, negative removes it.
 *   `@IsInt()` keeps the value integer (the database defines integer
 *   quantities only — no floating point is ever accepted). Zero is rejected
 *   by the service (a zero adjustment is a no-op and must not create a
 *   movement).
 * - `reason` is required (US-INV-002 — "Adjustment has a reason") and stored
 *   verbatim on the append-only movement.
 */
export class AdjustInventoryDto {
  @IsInt()
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
