import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/v1/categories request body (docs/API-SPEC.md §18 "Create
 * Category").
 *
 * The API-SPEC request is exactly:
 *
 *   { "name": "T-Shirts", "description": "T-Shirts collection" }
 *
 * `slug` is NOT accepted: it is generated from `name` (store-scoped unique,
 * docs/DATABASE.md §7.7) because the API-SPEC request has no slug field.
 */
export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;
}
