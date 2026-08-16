import { ValidationError } from '../../common/errors/domain-exceptions';
import {
  assertValidCatalogSlug,
  CATALOG_SLUG_PATTERN,
  MAX_CATALOG_SLUG_LENGTH,
  slugify,
  transliterateArabic,
} from './catalog-slug';

describe('catalog slug rule', () => {
  describe('slugify', () => {
    it('converts a human-readable name into a URL-safe slug', () => {
      expect(slugify('Classic T-Shirt')).toBe('classic-t-shirt');
    });

    it("preserves apostrophes/punctuation by collapsing them to hyphens", () => {
      expect(slugify("Men's Classic T-Shirt")).toBe('men-s-classic-t-shirt');
    });

    it('trims surrounding whitespace and lowercases', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('collapses runs of non-alphanumeric characters into single hyphens', () => {
      expect(slugify('Café 123!')).toBe('cafe-123');
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

  describe('transliterateArabic', () => {
    it('maps Arabic letters to Latin letters', () => {
      expect(transliterateArabic('تي شيرت رجالي')).toBe('ty shyrt rjaly');
    });

    it('maps Arabic-Indic digits to western digits', () => {
      expect(transliterateArabic('عطر ٢٠٢٦')).toContain('2026');
      expect(transliterateArabic('عطر ۲۰۲۶')).toContain('2026');
    });

    it('drops tashkeel (Arabic diacritics)', () => {
      expect(transliterateArabic('شَرْبَة')).toBe('shrba');
    });

    it('leaves Latin text, digits and punctuation unchanged', () => {
      expect(transliterateArabic('تي شيرت Nike 2026')).toBe('ty shyrt Nike 2026');
    });
  });

  describe('slugify with multilingual names', () => {
    it.each([
      ['تي شيرت رجالي', 'ty-shyrt-rjaly'],
      ['قميص أبيض', 'qmys-abyd'],
      ['عطر رجالي 2026', 'atr-rjaly-2026'],
      ['تي شيرت Nike', 'ty-shyrt-nike'],
      ["Men's Classic T-Shirt", 'men-s-classic-t-shirt'],
      ['تي شيرت 🎉', 'ty-shyrt'],
    ])('slugifies %j into a valid candidate (%s)', (name, expected) => {
      const candidate = slugify(name);
      expect(candidate).toBe(expected);
      expect(() => assertValidCatalogSlug(candidate)).not.toThrow();
    });

    it('produces the same base slug for duplicate names (uniqueness suffix is the service layer)', () => {
      expect(slugify('قميص أبيض')).toBe(slugify('قميص أبيض'));
    });

    it('keeps digits-only Arabic-Indic names valid (digits are URL-safe)', () => {
      const candidate = slugify('٢٠٢٦');
      expect(candidate).toBe('2026');
      expect(() => assertValidCatalogSlug(candidate)).not.toThrow();
    });
  });

  describe('assertValidCatalogSlug', () => {
    it('accepts lowercase letters, digits and inner hyphens', () => {
      expect(() => assertValidCatalogSlug('classic-t-shirt')).not.toThrow();
      expect(() => assertValidCatalogSlug('t-shirts-2024')).not.toThrow();
    });

    it('accepts every transliterated Arabic candidate', () => {
      for (const name of [
        'تي شيرت رجالي',
        'قميص أبيض',
        'عطر رجالي 2026',
        'تي شيرت Nike',
        "Men's Classic T-Shirt",
      ]) {
        expect(() => assertValidCatalogSlug(slugify(name))).not.toThrow();
      }
    });

    it('rejects a slug produced from a name without letters or digits', () => {
      expect(() => assertValidCatalogSlug(slugify('###'))).toThrow(ValidationError);
      expect(() => assertValidCatalogSlug(slugify('🎉🎉'))).toThrow(ValidationError);
    });

    it('rejects a blank name (no slug candidate)', () => {
      expect(slugify('   ')).toBe('');
      expect(() => assertValidCatalogSlug(slugify('   '))).toThrow(ValidationError);
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

