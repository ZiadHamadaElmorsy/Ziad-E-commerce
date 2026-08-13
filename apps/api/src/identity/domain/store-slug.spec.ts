import { ValidationError } from '../../common/errors/domain-exceptions';
import { assertValidStoreSlug, normalizeStoreSlug } from './store-slug';

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
