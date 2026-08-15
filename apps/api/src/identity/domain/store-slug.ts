import { ValidationError } from '../../common/errors/domain-exceptions';

/**
 * Store slug rule (docs/DATABASE.md §7.2 / §10, API-SPEC §15).
 *
 * The slug is the globally-unique public storefront URL base
 * (`store-slug.platform-domain.com`), so it MUST be URL-safe. The finalized
 * documents require the slug to be globally unique and to be usable as a
 * public URL segment; they do not define an explicit character set. The rule
 * below is therefore the minimal URL-safe interpretation:
 *
 *   - lowercase letters, digits and hyphens only
 *   - must not start or end with a hyphen
 *   - at most 63 characters (DNS label limit)
 *
 * This is a technical validation, not a business rule; it is documented in
 * docs/IMPLEMENTATION-PHASE2-IDENTITY-TENANCY.md and flagged for Product
 * Owner confirmation.
 */
export const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Upper bound derived from the DNS label limit for a public subdomain. */
export const MAX_STORE_SLUG_LENGTH = 63;

/** Lower-cases and trims a raw slug input. */
export function normalizeStoreSlug(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Validates a normalized Store slug.
 *
 * @throws ValidationError when the slug is not a safe public-URL slug.
 */
export function assertValidStoreSlug(input: string): void {
  const slug = normalizeStoreSlug(input);
  if (slug.length === 0 || slug.length > MAX_STORE_SLUG_LENGTH || !STORE_SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      'Store slug must be 1-63 lowercase letters, digits or hyphens and must not start or end with a hyphen.',
    );
  }
}

/**
 * Derives a Store slug candidate from a store name:
 * "Ziad Boutique" -> "ziad-boutique".
 *
 * The result is a *candidate* only — global uniqueness is enforced by the
 * database (`stores.slug` UNIQUE) and surfaces as a CONFLICT so the caller can
 * let the merchant pick a different name/slug.
 */
export function generateStoreSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STORE_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '');
}
