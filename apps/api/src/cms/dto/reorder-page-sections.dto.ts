import { IsArray, IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /api/v1/pages/:pageId/sections/reorder request body
 * (docs/API-SPEC.md §26 "Reorder Sections"). The API-SPEC example is:
 *
 *   { "sectionIds": ["section-1", "section-3", "section-2"] }
 *
 * The list is the FULL new order of the page's sections (a permutation of the
 * page's existing section ids); it is validated as such in the service layer.
 */
export class ReorderPageSectionsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  sectionIds!: string[];
}
