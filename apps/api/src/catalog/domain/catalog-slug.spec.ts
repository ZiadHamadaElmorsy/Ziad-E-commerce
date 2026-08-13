import { ValidationError } from '../../common/errors/domain-exceptions';
import {
  assertValidCatalogSlug,
  CATALOG_SLUG_PATTERN,
  MAX_CATALOG_SLUG_LENGTH,
  slugify,
} from './catalog-slug';

describe('catalog slug rule', () => {
  describe('slugify', () => {
    it('converts a human-readable name into a URL-safe slug', () => {
      expect(slugify('Classic T-Shirt')).toBe('classic-t-shirt');
    });

    it('trims surrounding whitespace and lowercases', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('collapses runs of non-alphanumeric characters into single hyphens', () => {
      expect(slugify('Café 123!')).toBe('caf-123');
    });

    it('strips leading and trailing hyphens', () => {
      expect(slugify('-foo-')).toBe('foo');
    });

    it('caps the slug length at the technical maximum', () => {
      const long = 'a'.repeat(200);
      const slug = slugify(long);
      expect(slug.length).toBeLessThanOrEqual(MAX_CATALOG_SLUG_LENGTH);
      expect(slug).toBe('a'.repeat(MAX_CATALOG_SLUG_LENGTH));
    });
  });

  describe('assertValidCatalogSlug', () => {
    it('accepts lowercase letters, digits and inner hyphens', () => {
      expect(() => assertValidCatalogSlug('classic-t-shirt')).not.toThrow();
      expect(() => assertValidCatalogSlug('t-shirts-2024')).not.toThrow();
    });

    it('rejects a slug produced from a name without letters or digits', () => {
      expect(() => assertValidCatalogSlug(slugify('###'))).toThrow(ValidationError);
    });

    it('normalizes uppercase input to lowercase before validating', () => {
      // The validator lowercases first (the stored slug is the normalized
      // form), so an uppercase input is accepted, not rejected.
      expect(() => assertValidCatalogSlug('Classic')).not.toThrow();
    });

    it('rejects leading or trailing hyphens', () => {
      expect(() => assertValidCatalogSlug('-foo')).toThrow(ValidationError);
      expect(() => assertValidCatalogSlug('foo-')).toThrow(ValidationError);
    });

    it('rejects over-long slugs', () => {
      expect(() => assertValidCatalogSlug('a'.repeat(MAX_CATALOG_SLUG_LENGTH + 1))).toThrow(
        ValidationError,
      );
    });

    it('exposes a URL-safe pattern for generated slugs', () => {
      expect(CATALOG_SLUG_PATTERN.test('classic-t-shirt-2')).toBe(true);
      expect(CATALOG_SLUG_PATTERN.test('Classic')).toBe(false);
    });
  });
});
