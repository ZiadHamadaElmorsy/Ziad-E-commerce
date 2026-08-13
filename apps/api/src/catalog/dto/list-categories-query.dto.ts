import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/categories query parameters (docs/API-SPEC.md §18 "List
 * Categories" + §10 pagination). page/limit only — the API-SPEC does not
 * declare search/sort/order for categories.
 */
export class ListCategoriesQueryDto {
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
