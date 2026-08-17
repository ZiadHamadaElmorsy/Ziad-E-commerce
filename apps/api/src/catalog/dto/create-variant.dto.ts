import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * POST /api/v1/products/:productId/variants request body (docs/API-SPEC.md
 * §17 "Create Variant").
 *
 *   { "name": "Black / Medium", "sku": "TS-BLK-M", "price": 500,
 *     "compareAtPrice": 600, "attributes": { "color": "Black", "size": "M" } }
 *
 * - `attributes` (optional) is a flat string map of variant attributes
 *   (color / size / material ...). The service validates string values.
 * - `price` / `compareAtPrice` are integer minor units (EGP piastres) — money
 *   is NEVER floating point.
 * - an empty `sku` is normalized to NULL by the service.
 */
export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

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
