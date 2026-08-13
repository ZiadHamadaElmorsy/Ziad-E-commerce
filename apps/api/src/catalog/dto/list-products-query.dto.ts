import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * GET /api/v1/products query parameters (docs/API-SPEC.md §16 "List Products"
 * — supported query parameters: page, limit, search, status, categoryId,
 * sort, order).
 *
 * - pagination defaults page=1, limit=20, maximum limit=100 (API-SPEC §10)
 * - `status` filters by the real product lifecycle status
 *   (DRAFT | ACTIVE | ARCHIVED). The API-SPEC example `?status=published`
 *   predates the FINAL domain lifecycle and has no mapping (reported).
 * - `sort`/`order` are limited to approved fields (API-SPEC §12):
 *   createdAt | name, asc | desc.
 */
export class ListProductsQueryDto {
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

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sort: 'createdAt' | 'name' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
