import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /api/v1/customers/:customerId/orders query parameters
 * (docs/API-SPEC.md §20 "Get Customer Orders").
 *
 * The API-SPEC documents no specific filters for this endpoint, so only the
 * project-wide collection conventions apply (docs/API-SPEC.md §10):
 * page = 1, limit = 20, maximum limit = 100. Status/date filters belong to
 * the Orders List endpoint (API-SPEC §23) of the future Orders phase.
 */
export class ListCustomerOrdersQueryDto {
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
