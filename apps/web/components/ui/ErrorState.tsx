'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';

/**
 * Error state shown when an API request fails. Renders the real backend
 * error message (or a fallback) so API failures are visible in the UI.
 */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">
        ⚠️
      </div>
      <h3 className="error-state__title">{title ?? t('common.somethingWentWrong')}</h3>
      {message ? <p className="error-state__message">{message}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
