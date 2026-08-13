import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * POST /api/v1/cart/items request body (docs/API-SPEC.md §21 "Add Cart Item"):
 *
 *   { "variantId": "...", "quantity": 2 }
 *
 * - `variantId` references a ProductVariant. Variant/product ownership and
 *   status are resolved server-side from the trusted tenant store — never from
 *   this body (no storeId, no productId, no price are accepted).
 * - `quantity` is a positive integer. The FINAL contract enforces exactly
 *   CHECK (quantity > 0) (docs/DATABASE.md §7.15); no maximum is invented.
 */
export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
