import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/storefront/categories query parameters.
 *
 * page/limit only (API-SPEC §10); no search/sort is documented for public
 * storefront categories.
 */
export class ListStorefrontCategoriesQueryDto {
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
}
