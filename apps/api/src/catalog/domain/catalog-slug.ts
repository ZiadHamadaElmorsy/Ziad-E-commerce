import { ValidationError } from '../../common/errors/domain-exceptions';

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
 */
export const CATALOG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Upper bound for SEO URL segments (technical choice; see module docs). */
export const MAX_CATALOG_SLUG_LENGTH = 100;

/**
 * Converts a human-readable name into a URL-safe slug candidate:
 * "Classic T-Shirt" -> "classic-t-shirt".
 *
 * The result is a *candidate* only — store-scoped uniqueness is resolved by
 * the service layer (suffix `-2`, `-3`, ...).
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
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
