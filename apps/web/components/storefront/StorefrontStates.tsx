'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { Spinner } from '@/components/ui/Spinner';

/** Storefront loading block. */
export function StorefrontLoading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="sf-state" role="status">
      <Spinner />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

/** Storefront empty state (no products, empty cart, etc.). */
export function StorefrontEmpty({
  icon = '🛍️',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sf-state sf-state--empty">
      <div className="sf-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="sf-state__title">{title}</h2>
      {description ? <p className="sf-state__desc">{description}</p> : null}
      {action ? <div className="sf-state__action">{action}</div> : null}
    </div>
  );
}

/** Storefront error state. */
export function StorefrontError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sf-state sf-state--error" role="alert">
      <div className="sf-state__icon" aria-hidden="true">
        ⚠️
      </div>
      <h2 className="sf-state__title">{t('storefront.loadFailed')}</h2>
      <p className="sf-state__desc">{message}</p>
      {onRetry ? (
        <button type="button" className="sf-btn" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
