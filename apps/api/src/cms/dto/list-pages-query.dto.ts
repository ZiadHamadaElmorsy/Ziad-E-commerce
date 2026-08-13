import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/pages query parameters (docs/API-SPEC.md §25 "List Pages" +
 * §10 pagination). page/limit only — the API-SPEC declares no other filters
 * for the pages collection.
 */
export class ListPagesQueryDto {
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
