import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * GET /api/v1/orders query parameters (docs/API-SPEC.md §23 "List Orders" —
 * supported filters: page, limit, status, search, dateFrom, dateTo).
 *
 * - pagination defaults page=1, limit=20, maximum limit=100 (API-SPEC §10)
 * - `status` filters by the FINAL order lifecycle status enum
 * - `search` matches the order's identifying snapshot fields (order_number,
 *   customer_email, customer_phone) case-insensitively — the FINAL documents
 *   do not define the searched fields, so the minimal identifying-fields
 *   interpretation is used (reported in the phase report)
 * - `dateFrom`/`dateTo` filter by created_at (ISO-8601 date strings) — the
 *   FINAL documents do not define the exact field/format (reported in the
 *   phase report)
 * - no `sort`/`order`: the API-SPEC documents none for orders; results are
 *   ordered by created_at descending (matching the customer order-history
 *   projection).
 */
export class ListOrdersQueryDto {
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
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
