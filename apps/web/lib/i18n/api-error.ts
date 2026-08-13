import { ApiError } from '@/lib/api/client';
import type { TranslateFn } from './i18n-context';
import type { TranslationKey } from './translations';

/**
 * Locale-aware API error rendering.
 *
 * Rules:
 * - Backend error messages are REAL data from the API. In the default
 *   (English) locale they are shown verbatim so the merchant always sees the
 *   exact backend explanation.
 * - In Arabic, known backend error codes map to translated, user-friendly
 *   messages (`errors.<CODE>` keys); if the backend already returned a
 *   message, that message wins (it is the most specific information we have).
 * - Non-API errors fall back to their own message or the caller's fallback.
 *
 * This never swallows errors and never shows raw stack traces.
 */
export function apiErrorMessage(
  error: unknown,
  t: TranslateFn,
  fallbackKey: TranslationKey,
): string {
  const fallback = t(fallbackKey);

  if (error instanceof ApiError) {
    // Network-level failures have no backend envelope.
    if (error.status === 0 || error.code === 'REQUEST_FAILED') {
      return t('errors.NETWORK');
    }
    const generic = t(`errors.${error.code}` as TranslationKey);
    const hasGeneric = generic !== `errors.${error.code}`;
    return error.message || (hasGeneric ? generic : fallback);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
