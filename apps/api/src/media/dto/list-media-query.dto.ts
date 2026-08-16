import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/media query parameters (Phase 25 — media library pagination).
 * Same pagination contract as every collection endpoint (docs/API-SPEC.md §7/§10):
 * page=1, limit=20 by default, maximum limit=100.
 */
export class ListMediaQueryDto {
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
