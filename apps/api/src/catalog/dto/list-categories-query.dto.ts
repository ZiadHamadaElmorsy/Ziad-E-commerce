import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * GET /api/v1/categories query parameters (docs/API-SPEC.md §18 "List
 * Categories" + §10 pagination).
 *
 * `search` filters by name/slug within the store (server-side) so the
 * product editor's category selector never downloads the whole catalog.
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
