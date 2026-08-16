import { ValidationError } from '../../common/errors/domain-exceptions';
import { assertValidStoreSlug, generateStoreSlug, normalizeStoreSlug } from './store-slug';

describe('store-slug rule', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeStoreSlug('  My-Store  ')).toBe('my-store');
    expect(normalizeStoreSlug('MY-STORE')).toBe('my-store');
  });

  it.each(['my-store', 'shop', 'a1-b2', 'x'])('accepts the slug "%s"', (slug) => {
    expect(() => assertValidStoreSlug(slug)).not.toThrow();
  });

  it.each(['', ' ', '-leading', 'trailing-', 'has space', 'sym_bol', 'a'.repeat(64)])(
    'rejects the slug "%s"',
    (slug) => {
      expect(() => assertValidStoreSlug(slug)).toThrow(ValidationError);
    },
  );

  it('accepts uppercase input after normalization', () => {
    expect(() => assertValidStoreSlug('  UPPER  ')).not.toThrow();
  });
});

describe('generateStoreSlug (Phase 17 onboarding)', () => {
  it('derives a URL-safe slug from a store name', () => {
    expect(generateStoreSlug('Ziad Boutique')).toBe('ziad-boutique');
    expect(generateStoreSlug('  My Store!! ')).toBe('my-store');
    expect(generateStoreSlug('قهوة الصباح')).toBe('qhwa-alsbah');
    expect(generateStoreSlug('عطر رجالي 2026')).toBe('atr-rjaly-2026');
  });

  it('produces a valid slug for pure-Arabic store names (Arabic onboarding works)', () => {
    const slug = generateStoreSlug('قهوة الصباح');
    expect(() => assertValidStoreSlug(slug)).not.toThrow();
  });

  it('caps the generated slug at the DNS label limit (63)', () => {
    const long = 'a'.repeat(80);
    expect(generateStoreSlug(long).length).toBe(63);
    expect(() => assertValidStoreSlug(generateStoreSlug(long))).not.toThrow();
  });
});
