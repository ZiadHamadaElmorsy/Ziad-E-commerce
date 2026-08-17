import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/v1/categories request body (docs/API-SPEC.md §18 "Create
 * Category").
 *
 *   { "name": "T-Shirts", "description": "T-Shirts collection",
 *     "nameAr": "تيشيرتات", "nameEn": "T-Shirts" }
 *
 * `slug` is NOT accepted: it is generated from `name` (store-scoped unique).
 */
export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;
}
