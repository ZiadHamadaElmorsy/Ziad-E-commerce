import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * PATCH /api/v1/variants/:variantId request body (docs/API-SPEC.md §17
 * "Update Variant").
 *
 * All fields are optional (partial update). `status` is NOT accepted:
 * lifecycle changes go exclusively through the dedicated archive endpoint.
 */
export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number | null;
}
