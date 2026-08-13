import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/v1/pages request body (docs/API-SPEC.md §25 "Create Page").
 *
 * `slug` is NOT accepted: it is generated from `title` (store-scoped unique,
 * docs/DATABASE.md §7.21) following the exact Catalog convention. `status` is
 * NOT accepted either: a page is created in DRAFT and published via PATCH
 * status (no dedicated publish endpoint is documented for pages).
 */
export class CreatePageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seoDescription?: string;
}
