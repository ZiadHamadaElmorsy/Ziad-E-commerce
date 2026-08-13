import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { SECTION_TYPES, SectionType } from '../domain/cms-section';

/**
 * PATCH /api/v1/pages/:pageId/sections/:sectionId request body
 * (docs/API-SPEC.md §26 "Update Section"). All fields are optional (partial
 * update).
 *
 * - `type` / `content` update the section configuration.
 * - `position` moves the section to the given order; the move shifts the
 *   other sections so the defined order stays dense (0..n-1).
 */
export class UpdatePageSectionDto {
  @IsOptional()
  @IsEnum(SECTION_TYPES)
  type?: SectionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
