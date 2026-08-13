import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { SECTION_TYPES, SectionType } from '../domain/cms-section';

/**
 * POST /api/v1/pages/:pageId/sections request body (docs/API-SPEC.md §26
 * "Add Section"). The API-SPEC example is:
 *
 *   { "type": "HERO", "position": 0, "content": {} }
 *
 * - `type` uses the documented UPPERCASE section types and is mapped to the
 *   FINAL lowercase database section_type values (DATABASE §7.22).
 * - `position` is the desired order (mapped to `sort_order`, default 0);
 *   inserting at a position shifts the following sections down so the
 *   defined order is preserved (US-CMS-002/003).
 * - `content` is the free-form JSON object stored in the JSONB column
 *   (DATABASE §33 #11; no per-type content schema is documented).
 */
export class CreatePageSectionDto {
  @IsEnum(SECTION_TYPES)
  type!: SectionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number = 0;

  @IsObject()
  content!: Record<string, unknown>;
}
