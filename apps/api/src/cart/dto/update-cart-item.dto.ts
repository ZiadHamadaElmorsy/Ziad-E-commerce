import { IsInt, Min } from 'class-validator';

/**
 * PATCH /api/v1/cart/items/:itemId request body (docs/API-SPEC.md §21
 * "Update Cart Item"):
 *
 *   { "quantity": 3 }
 *
 * Positive integer only. The FINAL contract defines NO zero-quantity "remove
 * via update" behavior and CHECK (quantity > 0) rejects 0/negative
 * (docs/DATABASE.md §7.15). No other fields are accepted (forbidNonWhitelisted).
 */
export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}
