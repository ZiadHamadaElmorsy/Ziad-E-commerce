import { ProductStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * POST /api/v1/products request body (docs/API-SPEC.md §16 "Create Product").
 *
 *   { "name": "Classic T-Shirt", "description": "Classic cotton T-shirt",
 *     "nameAr": "تي شيرت كلاسيك", "nameEn": "Classic T-Shirt",
 *     "status": "DRAFT" }
 *
 * - `name`        required
 * - `nameAr`      optional Arabic label
 * - `nameEn`      optional English label
 * - `description` optional
 * - `status`      optional; DRAFT is the only legal initial status.
 *
 * `slug` is NOT accepted: it is generated from `name` (store-scoped unique).
 * The Default ProductVariant is created atomically with the product.
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
