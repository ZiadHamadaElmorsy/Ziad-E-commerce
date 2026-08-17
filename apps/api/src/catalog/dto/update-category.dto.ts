import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/v1/categories/:categoryId request body (docs/API-SPEC.md §18
 * "Update Category"). All fields are optional (partial update); `status` is
 * NOT accepted (dedicated archive endpoint only) and `slug` is stable.
 */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;
}
