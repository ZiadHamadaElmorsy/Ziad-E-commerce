'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeOrderTrackingPath, storeProductsPath } from '@/lib/storefront/paths';
import { getStorefrontOrderTracking } from '@/lib/api/cart';
import { ApiError } from '@/lib/api/client';
import type { CustomerTrackingView } from '@/lib/storefront/types';
import { Price } from '@/components/storefront/Price';
import { StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';
import { formatDate } from '@/lib/utils';

/**
 * Customer delivery tracking (Phase 27 — Part 13).
 *
 * ONE aggregated backend payload: order number/status, payment method + COD
 * amount, the customer-safe tracking number and the delivery timeline
 * (✓ done / ● current / ○ upcoming). The page NEVER renders the shipping
 * provider name, provider ids, raw provider statuses or internal ids.
 */
export default function StoreOrderTrackingPage() {
  const params = useParams<{ slug: string; orderId: string }>();
  const orderId = params.orderId;
  const { slug } = useStorefront();
  const { t } = useI18n();

  const [tracking, setTracking] = useState<CustomerTrackingView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void getStorefrontOrderTracking(slug, orderId)
      .then((result) => setTracking(result))
      .catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, orderId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return <StorefrontError message={error} onRetry={load} />;
  }
  if (!tracking) {
    return <StorefrontLoading />;
  }

  const isCod = tracking.payment.method === 'COD';

  /** Maps a customer-friendly tracking status to its i18n key. */
  const trackingKey = (status: string): TranslationKey =>
    `storefront.tracking.${status}` as TranslationKey;

  return (
    <div className="sf-page sf-page--narrow">
      <h1 className="sf-tracking__title" data-testid="tracking-title">
        {t('storefront.orderNumberLabel')} {tracking.order.orderNumber}
      </h1>

      <section className="sf-section" aria-label={t('storefront.deliveryStatus')}>
        <h2>{t('storefront.deliveryStatus')}</h2>
        <p className="sf-tracking__headline" data-testid="tracking-headline">
          {t(trackingKey(tracking.tracking.status))}
        </p>
        {tracking.tracking.trackingNumber ? (
          <p className="sf-muted">
            {t('storefront.trackingNumber')}{' '}
            <strong data-testid="tracking-number">{tracking.tracking.trackingNumber}</strong>
          </p>
        ) : null}

        <ol className="sf-timeline" data-testid="tracking-timeline">
          {tracking.tracking.timeline.map((entry) => (
            <li
              key={entry.step}
              className={`sf-timeline__step sf-timeline__step--${entry.state}`}
              data-state={entry.state}
            >
              <span className="sf-timeline__marker" aria-hidden="true">
                {entry.state === 'done' ? '✓' : entry.state === 'current' ? '●' : '○'}
              </span>
              <span className="sf-timeline__label">{t(trackingKey(entry.step))}</span>
            </li>
          ))}
        </ol>

        {tracking.tracking.deliveredAt ? (
          <p className="sf-muted" data-testid="tracking-delivered-at">
            {t('storefront.deliveredOn')} {formatDate(tracking.tracking.deliveredAt)}
          </p>
        ) : null}
      </section>

      {isCod ? (
        <section className="sf-section" aria-label={t('storefront.payment')}>
          <h2>{t('storefront.payment')}</h2>
          <dl className="sf-meta">
            <div>
              <dt>{t('storefront.paymentMethod')}</dt>
              <dd data-testid="tracking-payment-method">{t('storefront.cashOnDelivery')}</dd>
            </div>
            <div>
              <dt>{t('storefront.amountToPayOnDelivery')}</dt>
              <dd>
                <strong data-testid="tracking-cod-amount">
                  <Price value={tracking.payment.codAmount} />
                </strong>
              </dd>
            </div>
          </dl>
          <p className="sf-alert sf-alert--info">{t('storefront.codPayWhenArrives')}</p>
        </section>
      ) : null}

      <div className="sf-payment__footer">
        <Link
          href={storeOrderTrackingPath(slug, orderId)}
          className="sf-btn sf-btn--outline"
          onClick={(event) => {
            event.preventDefault();
            load();
          }}
        >
          {t('common.refresh')}
        </Link>
        <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--ghost">
          {t('storefront.continueShopping')}
        </Link>
      </div>
    </div>
  );
}
