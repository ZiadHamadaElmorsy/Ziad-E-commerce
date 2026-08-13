import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/variants/:variantId/inventory/movements query parameters.
 *
 * The API-SPEC §19 "Get Inventory Movements" endpoint documents no specific
 * filters, so only the project-wide collection conventions apply
 * (docs/API-SPEC.md §10): page = 1, limit = 20, maximum limit = 100.
 */
export class ListMovementsQueryDto {
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
