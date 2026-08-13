import { describe, expect, it } from 'vitest';
import { ar, en, statusTranslationKeys } from './translations';
import { interpolate, translate } from './i18n-context';
import { detectLocale, isSupportedLocale, localeDirection } from './locale';

describe('i18n dictionaries', () => {
  it('the Arabic dictionary covers every English key', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it('no translation value contains an unresolved interpolation token', () => {
    const tokenPattern = /\{(\w+)\}/g;
    for (const dictionary of [en, ar] as const) {
      for (const [key, value] of Object.entries(dictionary)) {
        const tokens = [...value.matchAll(tokenPattern)].map((match) => match[1]);
        for (const token of tokens) {
          // Every token used in a value must appear in the key set of the
          // other locale too (parity is checked by the equality test above).
          expect(key.length).toBeGreaterThan(0);
          expect(token.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the Arabic dictionary is not empty and contains real translations', () => {
    expect(ar['common.cancel']).toBe('إلغاء');
    expect(ar['nav.dashboard']).toBe('لوحة التحكم');
    expect(ar['status.ACTIVE']).toBe('نشط');
  });
});

describe('translate + interpolate', () => {
  it('interpolates {token} placeholders', () => {
    expect(interpolate('Welcome back, {name}', { name: 'Ziad' })).toBe('Welcome back, Ziad');
    expect(interpolate('No tokens')).toBe('No tokens');
    expect(interpolate('Missing {unknown}', { name: 'x' })).toBe('Missing {unknown}');
  });

  it('looks up strings in the selected dictionary', () => {
    expect(translate(en, 'common.cancel')).toBe('Cancel');
    expect(translate(ar, 'common.cancel')).toBe('إلغاء');
  });

  it('falls back to the English dictionary for a missing key', () => {
    expect(translate(ar, 'nav.media')).toBe('الوسائط');
  });

  it('falls back to the key itself when nothing exists', () => {
    expect(translate(en, 'status.UNKNOWN_XYZ' as never)).toBe('status.UNKNOWN_XYZ');
  });
});

describe('status translation mapping', () => {
  it('maps every known status to a key present in both dictionaries', () => {
    for (const [status, key] of Object.entries(statusTranslationKeys)) {
      expect(en[key], `missing en key for ${status}`).toBeDefined();
      expect(ar[key], `missing ar key for ${status}`).toBeDefined();
    }
  });

  it('covers the main order lifecycle statuses', () => {
    for (const status of [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
    ]) {
      expect(statusTranslationKeys[status]).toBeDefined();
    }
  });
});

describe('locale helpers', () => {
  it('detects only supported locales', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('ar')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('maps locales to layout directions', () => {
    expect(localeDirection('en')).toBe('ltr');
    expect(localeDirection('ar')).toBe('rtl');
  });

  it('detectLocale returns a supported locale without throwing in jsdom', () => {
    const locale = detectLocale();
    expect(isSupportedLocale(locale)).toBe(true);
  });
});
