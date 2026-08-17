import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * GET /api/v1/storefront/products/:slug/media query parameters — paginated
 * storefront gallery (Phase 26). `variantId` filters to the images linked to
 * a specific variant.
 */
export class ListStorefrontProductMediaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 12;

  @IsOptional()
  @IsUUID()
  variantId?: string;
}
