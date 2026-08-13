import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * POST /api/v1/products/:productId/variants request body (docs/API-SPEC.md
 * §17 "Create Variant").
 *
 * The API-SPEC request is exactly:
 *
 *   { "name": "Black / Medium", "sku": "TS-BLK-M", "price": 500,
 *     "compareAtPrice": 600 }
 *
 * - `price` / `compareAtPrice` are integer minor units (EGP piastres) — money
 *   is NEVER floating point (docs/DOMAIN-MODEL.md §7.2, docs/DATABASE.md §7.6).
 * - `costPrice` is intentionally NOT accepted: the API-SPEC create request
 *   has no cost price field (reported).
 * - `status` is NOT accepted: variants are created ACTIVE (DB default).
 * - an empty `sku` is normalized to NULL by the service so multiple
 *   SKU-less variants remain valid under the store-scoped UNIQUE(store_id, sku).
 */
export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sku?: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number;
}
