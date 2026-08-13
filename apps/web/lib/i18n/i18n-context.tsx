'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ar, en, statusTranslationKeys, type TranslationKey } from './translations';
import {
  applyLocaleToDocument,
  detectLocale,
  localeDirection,
  persistLocale,
  type Locale,
} from './locale';

/** Replaces `{token}` placeholders in a translated string. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** Pure translation lookup for a given dictionary. */
export function translate(
  dictionary: Record<TranslationKey, string>,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionary[key] ?? en[key] ?? key;
  return interpolate(template, params);
}

export type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  /** Looks up a translated string (locale-aware). */
  t: TranslateFn;
  /** Renders a backend status enum value as a localized label. */
  tStatus: (status: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/** Initial locale state: default English, switched to the persisted locale on mount. */
function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    return detectLocale();
  } catch {
    return 'en';
  }
}

/**
 * Internationalization provider.
 *
 * - English (LTR) and Arabic (RTL) dictionaries (lib/i18n/translations.ts).
 * - Persists the preference in localStorage and mirrors it onto
 *   `<html lang dir>` so layout direction actually changes.
 * - `t(key, params)` renders the localized string with `{token}` interpolation.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
    applyLocaleToDocument(next);
  }, []);

  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = locale === 'ar' ? ar : en;
    const t: TranslateFn = (key, params) => translate(dictionary, key, params);
    const tStatus = (status: string) => {
      const key = statusTranslationKeys[status];
      return key ? translate(dictionary, key) : status;
    };
    return {
      locale,
      dir: localeDirection(locale),
      isRTL: locale === 'ar',
      setLocale,
      t,
      tStatus,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider.');
  }
  return context;
}
