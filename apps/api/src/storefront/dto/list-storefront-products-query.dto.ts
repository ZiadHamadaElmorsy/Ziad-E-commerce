import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * GET /api/v1/storefront/products query parameters.
 *
 * - pagination defaults page=1, limit=20, maximum limit=100 (API-SPEC §10)
 * - `search` filters ACTIVE products by Product Name (MVP-SCOPE §28,
 *   US-STF-004: "Search uses product name")
 */
export class ListStorefrontProductsQueryDto {
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
  limit: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}
