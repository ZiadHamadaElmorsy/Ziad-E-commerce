'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeProductsPath } from '@/lib/storefront/paths';
import { getStorefrontOrder } from '@/lib/api/cart';
import { ApiError } from '@/lib/api/client';
import { getOrderLookupToken } from '@/lib/storefront/order-token';
import type { StorefrontOrderView } from '@/lib/storefront/types';
import { Price } from '@/components/storefront/Price';
import { StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';
import { formatDate } from '@/lib/utils';

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 3000;

/**
 * Customer order confirmation (Phase 19). Uses REAL order + payment data from
 * the storefront order endpoints (webhook-driven payment status). Polls a few
 * times while the payment is still PENDING/PROCESSING so the customer sees the
 * provider confirmation without a manual refresh.
 */
export default function StoreOrderPage() {
  const params = useParams<{ slug: string; orderId: string }>();
  const orderId = params.orderId;
  const { slug } = useStorefront();
  const { t, tStatus } = useI18n();

  const [order, setOrder] = useState<StorefrontOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);

  const load = useCallback(async () => {
    try {
      // Phase 23 — pass the session-scoped lookup token so the customer's own
      // PII is included; without it the API returns a PII-free order view.
      const result = await getStorefrontOrder(slug, orderId, getOrderLookupToken(orderId));
      setOrder(result);
      return result;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('storefront.loadFailed'));
      return null;
    }
  }, [slug, orderId, t]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then(async (first) => {
      if (cancelled) return;
      if (first && (first.paymentStatus === 'PENDING' || first.paymentStatus === 'PROCESSING')) {
        const timer = window.setInterval(async () => {
          pollCount.current += 1;
          const current = await load();
          if (cancelled) return;
          const settled =
            current &&
            (current.paymentStatus === 'SUCCEEDED' || current.paymentStatus === 'FAILED');
          if (settled || pollCount.current >= POLL_ATTEMPTS) {
            window.clearInterval(timer);
          }
        }, POLL_INTERVAL_MS);
        return () => {
          window.clearInterval(timer);
        };
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) {
    return <StorefrontError message={error} onRetry={() => void load()} />;
  }

  if (!order) {
    return <StorefrontLoading />;
  }

  const shippingAddress = order.shippingAddress as Record<string, string>;
  const isWhatsApp = order.channel === 'WHATSAPP';
  const channelLabel = isWhatsApp
    ? t('storefront.channel.WHATSAPP')
    : t('storefront.channel.ONLINE_PAYMENT');
  const paymentLabel =
    order.paymentStatus !== null
      ? tStatus(order.paymentStatus)
      : isWhatsApp
        ? t('storefront.pendingManualConfirm')
        : t('storefront.notInitiated');

  return (
    <div className="sf-page sf-page--narrow">
      <div className="sf-order-confirmation">
        <div className="sf-order-placed__icon" aria-hidden="true">
          ✓
        </div>
        <h1 data-testid="order-confirmation-title">{t('storefront.thankYou')}</h1>
        <p className="sf-order-placed__number">
          {t('storefront.orderNumberLabel')}{' '}
          <strong data-testid="order-number">{order.orderNumber}</strong>
        </p>
        <p className="sf-order-placed__date">{formatDate(order.createdAt)}</p>
      </div>

      <div className="sf-status-cards">
        <div className="sf-status-card">
          <span className="sf-status-card__label">{t('storefront.paymentChannel')}</span>
          <span className="sf-status-card__value" data-testid="order-channel">
            {channelLabel}
          </span>
        </div>
        <div className="sf-status-card">
          <span className="sf-status-card__label">{t('storefront.paymentStatus')}</span>
          <span className="sf-status-card__value" data-testid="payment-status">
            {paymentLabel}
          </span>
        </div>
        <div className="sf-status-card">
          <span className="sf-status-card__label">{t('storefront.orderStatus')}</span>
          <span className="sf-status-card__value" data-testid="order-status">
            {tStatus(order.status)}
          </span>
        </div>
      </div>

      {isWhatsApp ? (
        <p className="sf-alert sf-alert--info" data-testid="whatsapp-confirmation-note">
          {t('storefront.unpaidDesc')}
        </p>
      ) : null}

      {order.paymentFailureMessage ? (
        <p className="sf-alert sf-alert--danger">{order.paymentFailureMessage}</p>
      ) : null}

      <section className="sf-section">
        <h2>{t('storefront.orderSummary')}</h2>
        <ul className="sf-summary-items">
          {order.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.productName}
                {item.variantName && item.variantName !== item.productName ? (
                  <em className="sf-muted"> · {item.variantName}</em>
                ) : null}{' '}
                <em className="sf-muted">× {item.quantity}</em>
              </span>
              <Price value={item.lineTotal} />
            </li>
          ))}
        </ul>
        <dl className="sf-cart-summary__rows">
          <div>
            <dt>{t('storefront.subtotal')}</dt>
            <dd>
              <Price value={order.subtotal} />
            </dd>
          </div>
          <div>
            <dt>{t('storefront.total')}</dt>
            <dd>
              <strong data-testid="order-total">
                <Price value={order.grandTotal} />
              </strong>
            </dd>
          </div>
        </dl>
      </section>

      <section className="sf-section">
        <h2>{t('storefront.customerDetails')}</h2>
        <dl className="sf-meta">
          <div>
            <dt>{t('storefront.phone')}</dt>
            <dd>{order.customerPhone ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('storefront.email')}</dt>
            <dd>{order.customerEmail ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('storefront.shippingAddress')}</dt>
            <dd>
              {shippingAddress.addressLine ?? '—'}
              {shippingAddress.governorate ? `, ${shippingAddress.governorate}` : ''}
              {shippingAddress.city ? `, ${shippingAddress.city}` : ''}
            </dd>
          </div>
        </dl>
      </section>

      <div className="sf-payment__footer">
        <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--primary">
          {t('storefront.continueShopping')}
        </Link>
      </div>
    </div>
  );
}
