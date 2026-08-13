/**
 * Locale detection + persistence helpers.
 *
 * The preference is stored in localStorage (`ziad.locale`) and applied to the
 * `<html>` element (lang + dir) before React hydrates via the inline script in
 * app/layout.tsx — this avoids an RTL/LTR flash on reload.
 */

export type Locale = 'en' | 'ar';

export const LOCALE_STORAGE_KEY = 'ziad.locale';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ar'];

export function isSupportedLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'ar';
}

/** Direction for a given locale. */
export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Reads the persisted locale (falling back to the browser language). */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // localStorage unavailable (privacy mode) — fall through.
  }
  const language = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Persists the locale preference. */
export function persistLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Best-effort persistence.
  }
}

/** Applies the locale to the <html> element (lang + dir). */
export function applyLocaleToDocument(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection(locale);
}
