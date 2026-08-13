import { PageStatus } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/v1/pages/:pageId request body (docs/API-SPEC.md §25 "Update
 * Page"). All fields are optional (partial update).
 *
 * - `status` accepts DRAFT | PUBLISHED only: DRAFT -> PUBLISHED publishes,
 *   PUBLISHED -> DRAFT unpublishes (idempotent same-status no-op). ARCHIVED is
 *   rejected here — the dedicated archive endpoint
 *   (POST /pages/:pageId/archive) owns the ARCHIVED transition.
 * - `slug` is stable after creation (store-scoped SEO URL, DATABASE §7.21);
 *   renaming the title never silently rewrites public URLs.
 */
export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seoDescription?: string;

  @IsOptional()
  @IsIn([PageStatus.DRAFT, PageStatus.PUBLISHED])
  status?: PageStatus;
}
