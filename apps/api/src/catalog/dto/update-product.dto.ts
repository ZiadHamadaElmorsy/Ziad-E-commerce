import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/v1/products/:productId request body (docs/API-SPEC.md §16
 * "Update Product").
 *
 * Only the merchant-editable basic fields are accepted. `status` is NOT part
 * of the update request: lifecycle changes go exclusively through the
 * dedicated publish / unpublish / archive endpoints. `slug` is stable and
 * never mutated by an edit (changing it would break SEO URLs).
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;
}
