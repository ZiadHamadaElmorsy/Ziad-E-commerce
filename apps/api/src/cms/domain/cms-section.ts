import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Page section types (docs/MVP-SCOPE.md §25, docs/BRD.md BR-CMS-002,
 * docs/PRD.md §29, docs/DATABASE.md §7.22).
 *
 * The API-SPEC §26 request example uses the UPPERCASE form (`"type": "HERO"`);
 * the FINAL database stores the lowercase section_type values
 * (hero / banner / featured_products / category_grid / text / image). The API
 * contract therefore accepts the documented uppercase values and maps them to
 * the DB values.
 */
export const SECTION_TYPES = [
  'HERO',
  'BANNER',
  'FEATURED_PRODUCTS',
  'CATEGORY_GRID',
  'TEXT',
  'IMAGE',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_TYPE_TO_DB: Record<SectionType, string> = {
  HERO: 'hero',
  BANNER: 'banner',
  FEATURED_PRODUCTS: 'featured_products',
  CATEGORY_GRID: 'category_grid',
  TEXT: 'text',
  IMAGE: 'image',
};

export function isSectionType(value: string): value is SectionType {
  return (SECTION_TYPES as readonly string[]).includes(value);
}

/** Maps an API section type to its FINAL database section_type value. */
export function toDbSectionType(type: SectionType): string {
  return SECTION_TYPE_TO_DB[type];
}

/**
 * Section content is a free-form JSON object (docs/DATABASE.md §33 #11 —
 * JSONB accepted for presentation content; NO per-section-type content schema
 * is defined by the source documents). Only the object shape is validated.
 */
export function assertValidSectionContent(content: unknown): void {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    throw new ValidationError('Section content must be a JSON object.');
  }
}
