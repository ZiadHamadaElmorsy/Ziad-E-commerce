'use client';

import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Language switcher — toggles between English (LTR) and العربية (RTL).
 * The selection is persisted and applied to <html lang dir> immediately.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <select
      className="language-switch"
      aria-label="Language / اللغة"
      value={locale}
      onChange={(event) => setLocale(event.target.value === 'ar' ? 'ar' : 'en')}
    >
      <option value="en">English</option>
      <option value="ar">العربية</option>
    </select>
  );
}
