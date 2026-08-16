import { ValidationError } from '../../common/errors/domain-exceptions';
import { transliterateArabic } from '../../common/transliteration';

export { transliterateArabic };

/**
 * Catalog slug rule (docs/DATABASE.md §8 — products.slug and categories.slug
 * are "SEO URLs"; §10 — UNIQUE within store).
 *
 * The FINAL documents define the slug as a store-scoped SEO URL but do not
 * define an explicit character set (the same gap that Phase 2 resolved for
 * stores.slug). This rule is therefore the minimal URL-safe interpretation:
 *
 *   - lowercase letters, digits and hyphens only
 *   - must not start or end with a hyphen
 *   - at most 100 characters
 *
 * It is a technical validation, not a business rule, and is reported as an
 * OPEN DECISION in the Phase 3 implementation report.
 *
 * Product names are multilingual (Arabic / English / mixed / numbers). The
 * slug generator therefore TRANSLITERATES Arabic script to Latin before
 * producing the URL-safe candidate, so a pure-Arabic product name like
 * "تي شيرت رجالي" yields a valid, human-readable slug such as
 * "ty-shyrt-rjaly" instead of failing validation. The slug remains a separate
 * technical field: the stored product `name` is never modified.
 */
export const CATALOG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Upper bound for SEO URL segments (technical choice; see module docs). */
export const MAX_CATALOG_SLUG_LENGTH = 100;

/**
 * Converts a human-readable name into a URL-safe slug candidate:
 * "Classic T-Shirt" -> "classic-t-shirt",
 * "تي شيرت رجالي" -> "ty-shyrt-rjaly",
 * "Men's Classic T-Shirt" -> "mens-classic-t-shirt".
 *
 * Arabic script is transliterated to Latin first; accented Latin letters are
 * decomposed (NFKD) and their diacritics stripped (Café -> cafe). Non-letter /
 * non-digit runs collapse to single hyphens.
 *
 * The result is a *candidate* only — store-scoped uniqueness is resolved by
 * the service layer (suffix `-2`, `-3`, ...). A name with no letters or
 * digits at all (e.g. "###") yields an empty candidate and is rejected by
 * assertValidCatalogSlug.
 */
export function slugify(input: string): string {
  const transliterated = transliterateArabic(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return transliterated
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CATALOG_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates a normalized catalog slug.
 *
 * @throws ValidationError when the slug is empty, too long or not URL-safe.
 */
export function assertValidCatalogSlug(input: string): void {
  const slug = input.trim().toLowerCase();
  if (
    slug.length === 0 ||
    slug.length > MAX_CATALOG_SLUG_LENGTH ||
    !CATALOG_SLUG_PATTERN.test(slug)
  ) {
    throw new ValidationError(
      'The generated slug is invalid; the name must produce 1-100 lowercase letters, digits or hyphens.',
    );
  }
}

