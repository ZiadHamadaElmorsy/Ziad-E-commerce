import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * GET /api/v1/customers query parameters (docs/API-SPEC.md §20 "List
 * Customers" — supported query parameters: page, limit, search).
 *
 * - pagination defaults page=1, limit=20, maximum limit=100 (API-SPEC §10)
 * - `search` matches the customer's identifying fields (first/last name,
 *   email, phone) case-insensitively — the FINAL documents do not define the
 *   searched fields, so the minimal interpretation of a customer search is
 *   used (reported in the phase report).
 * - no `sort`/`order`/status filters: the API-SPEC documents none for
 *   customers.
 */
export class ListCustomersQueryDto {
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
