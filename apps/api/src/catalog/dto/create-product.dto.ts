import { ProductStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/v1/products request body (docs/API-SPEC.md §16 "Create Product").
 *
 * The API-SPEC request is exactly:
 *
 *   { "name": "Classic T-Shirt", "description": "Classic cotton T-shirt",
 *     "status": "DRAFT" }
 *
 * - `name`        required
 * - `description` optional
 * - `status`      optional; DRAFT is the only legal initial status — the
 *   product lifecycle starts at DRAFT (docs/DOMAIN-MODEL.md §7.1) and ACTIVE
 *   is reached through the dedicated publish endpoint.
 *
 * `slug` is NOT accepted: it is generated from `name` (store-scoped unique,
 * docs/DATABASE.md §7.5) because the API-SPEC request has no slug field.
 * The Default ProductVariant is created atomically with the product
 * (docs/DOMAIN-MODEL.md §7.1 invariant: every product MUST have >= 1 variant).
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
