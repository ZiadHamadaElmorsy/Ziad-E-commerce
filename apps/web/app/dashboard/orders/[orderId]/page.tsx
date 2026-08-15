'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { ordersApi } from '@/lib/api/orders';
import { paymentsApi, newIdempotencyKey } from '@/lib/api/payments';
import type { OrderStatus, OrderView, PaymentView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatEgpHtml, formatDate, titleCase } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/** The documented order lifecycle transitions (DOMAIN-MODEL §12.3). */
const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Ordered, human-meaningful address snapshot keys (DATABASE §7.17). */
const ADDRESS_KEYS = [
  'firstName',
  'lastName',
  'phone',
  'country',
  'governorate',
  'city',
  'addressLine',
  'building',
  'apartment',
  'postalCode',
];

function AddressList({ address }: { address: Record<string, unknown> | null }) {
  const { t } = useI18n();
  if (!address) {
    return <p className="card__muted">{t('orders.details.noShippingAddress')}</p>;
  }
  const entries = ADDRESS_KEYS.map((key) => ({
    key,
    value: address[key],
  })).filter((entry) => typeof entry.value === 'string' && entry.value.length > 0);
  if (entries.length === 0) {
    return <p className="card__muted">{t('orders.details.noShippingAddress')}</p>;
  }
  return (
    <dl className="meta-list">
      {entries.map((entry) => (
        <div key={entry.key}>
          <dt>{titleCase(entry.key)}</dt>
          <dd>{String(entry.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function OrderDetailsPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { t } = useI18n();
  const toast = useToast();

  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetStatus, setTargetStatus] = useState<'' | OrderStatus>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const [initiating, setInitiating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.getOrder(orderId);
      setOrder(result.data);
      setPaymentLoaded(false);
      // The payment may not exist yet -> 404 is a normal "no payment" state.
      try {
        const paymentResult = await paymentsApi.getPayment(orderId);
        setPayment(paymentResult.data);
        setCheckoutUrl(paymentResult.data.providerCheckoutUrl);
      } catch {
        setPayment(null);
      } finally {
        setPaymentLoaded(true);
      }
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'orders.details.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const allowedNext = order ? ALLOWED_NEXT[order.status] : [];

  const handleStatusSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!targetStatus) return;
    setConfirmOpen(true);
  };

  const runStatusTransition = async () => {
    if (!order || !targetStatus) return;
    setActing(true);
    try {
      const result = await ordersApi.updateOrderStatus(order.id, targetStatus);
      setOrder(result.data);
      toast.success(t('orders.details.statusUpdatedToast'));
      setConfirmOpen(false);
      setTargetStatus('');
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'orders.details.statusUpdateFailed'));
    } finally {
      setActing(false);
    }
  };

  const runInitiatePayment = async () => {
    if (!order) return;
    setInitiating(true);
    try {
      const result = await paymentsApi.createPayment(order.id, newIdempotencyKey());
      setPayment(result.data);
      setCheckoutUrl(result.data.providerCheckoutUrl);
      toast.success(t('orders.details.paymentInitiatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'orders.details.paymentFailedToast'));
    } finally {
      setInitiating(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingBlock label={t('orders.details.loading')} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page">
        <ErrorState message={error ?? t('orders.details.notFound')} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={order.orderNumber}
        description={`${t('orders.details.placedAt')} ${formatDate(order.createdAt)}`}
        actions={
          <Link href="/dashboard/orders" className="btn btn--ghost btn--md">
            {t('common.backTo', { target: t('orders.title') })}
          </Link>
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card
            title={t('orders.details.itemsTitle')}
            description={
              order.items.length === 1
                ? t('orders.details.itemsDescOne', { count: order.items.length })
                : t('orders.details.itemsDescMany', { count: order.items.length })
            }
          >
            {order.items.length === 0 ? (
              <p className="card__muted">—</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('orders.details.itemProduct')}</th>
                    <th>{t('orders.details.itemVariant')}</th>
                    <th>{t('orders.details.itemSku')}</th>
                    <th>{t('orders.details.itemUnitPrice')}</th>
                    <th>{t('orders.details.itemQty')}</th>
                    <th>{t('orders.details.itemLineTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td>{item.variantName}</td>
                      <td>{item.sku ?? '—'}</td>
                      <td>{formatEgpHtml(item.unitPrice)}</td>
                      <td>{item.quantity}</td>
                      <td>{formatEgpHtml(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <dl className="meta-list meta-list--grid totals">
              <div>
                <dt>{t('orders.details.subtotal')}</dt>
                <dd>{formatEgpHtml(order.subtotal)}</dd>
              </div>
              <div>
                <dt>{t('orders.details.discount')}</dt>
                <dd>{formatEgpHtml(order.discountTotal)}</dd>
              </div>
              <div>
                <dt>{t('orders.details.shipping')}</dt>
                <dd>{formatEgpHtml(order.shippingTotal)}</dd>
              </div>
              <div>
                <dt>{t('orders.details.tax')}</dt>
                <dd>{formatEgpHtml(order.taxTotal)}</dd>
              </div>
              <div className="totals__grand">
                <dt>{t('orders.details.grandTotal')}</dt>
                <dd>{formatEgpHtml(order.grandTotal)}</dd>
              </div>
            </dl>
          </Card>

          <Card
            title={t('orders.details.reservations')}
            description={
              order.reservations.length === 1
                ? t('orders.details.reservationsDescOne', { count: order.reservations.length })
                : t('orders.details.reservationsDescMany', { count: order.reservations.length })
            }
          >
            {order.reservations.length === 0 ? (
              <p className="card__muted">{t('orders.details.noReservations')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('orders.details.itemVariant')}</th>
                    <th>{t('orders.details.itemQty')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.reservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.variantId}</td>
                      <td>{reservation.quantity}</td>
                      <td>
                        <StatusBadge status={reservation.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title={t('orders.details.orderNumber')}>
            <dl className="meta-list">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge status={order.status} />
                </dd>
              </div>
              <div>
                <dt>{t('orders.details.channel')}</dt>
                <dd data-testid="order-detail-channel">
                  {order.channel === 'WHATSAPP'
                    ? t('orders.channel.WHATSAPP')
                    : t('orders.channel.ONLINE_PAYMENT')}
                </dd>
              </div>
              <div>
                <dt>{t('orders.details.placedAt')}</dt>
                <dd>{formatDate(order.createdAt)}</dd>
              </div>
              <div>
                <dt>{t('orders.details.updatedAt')}</dt>
                <dd>{formatDate(order.updatedAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card title={t('orders.details.customerTitle')}>
            <dl className="meta-list">
              <div>
                <dt>{t('orders.details.customerEmail')}</dt>
                <dd>{order.customerEmail ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('orders.details.customerPhone')}</dt>
                <dd>{order.customerPhone ?? '—'}</dd>
              </div>
            </dl>
            {order.customerId ? (
              <Link
                href={`/dashboard/customers/${order.customerId}`}
                className="btn btn--outline btn--sm"
              >
                {t('orders.details.customerLink')}
              </Link>
            ) : null}
          </Card>

          <Card title={t('orders.details.shippingTitle')}>
            <AddressList address={order.shippingAddress} />
          </Card>
          {order.billingAddress ? (
            <Card title={t('orders.details.billingTitle')}>
              <AddressList address={order.billingAddress} />
            </Card>
          ) : null}
        </aside>
      </div>

      <Card
        title={t('orders.details.updateStatus')}
        description={t('orders.details.updateStatusDesc')}
      >
        {allowedNext.length === 0 ? (
          <p className="card__muted">{t('common.notAvailable')}</p>
        ) : (
          <form className="form-inline" onSubmit={handleStatusSubmit}>
            <Select
              aria-label={t('orders.details.selectStatus')}
              value={targetStatus}
              onChange={(event) => setTargetStatus(event.target.value as '' | OrderStatus)}
            >
              <option value="">{t('orders.details.selectStatus')}</option>
              {allowedNext.map((next) => (
                <option key={next} value={next}>
                  {t(`status.${next}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={!targetStatus}>
              {t('orders.details.updateStatus')}
            </Button>
          </form>
        )}
      </Card>

      <Card title={t('orders.details.paymentTitle')} description={t('orders.details.paymentDesc')}>
        {!paymentLoaded ? (
          <LoadingBlock label={t('common.loading')} />
        ) : payment === null && order.channel === 'WHATSAPP' ? (
          // Phase 22 — WhatsApp orders are paid manually: no online payment can
          // be initiated for them; the merchant confirms + collects payment.
          <p className="card__muted" data-testid="whatsapp-unpaid-note">
            {t('orders.details.whatsappUnpaid')}
          </p>
        ) : payment === null ? (
          <>
            <p className="card__muted">{t('orders.details.noPayment')}</p>
            <div className="form-actions">
              <Button onClick={() => void runInitiatePayment()} loading={initiating}>
                {initiating ? t('orders.details.initiating') : t('orders.details.initiatePayment')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <dl className="meta-list meta-list--grid">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge status={payment.status} />
                </dd>
              </div>
              <div>
                <dt>{t('orders.details.paymentProvider')}</dt>
                <dd>{payment.provider}</dd>
              </div>
              <div>
                <dt>{t('orders.details.paymentAmount')}</dt>
                <dd>{formatEgpHtml(payment.amount)}</dd>
              </div>
              <div>
                <dt>{t('orders.details.paymentReference')}</dt>
                <dd>{payment.providerReference ?? '—'}</dd>
              </div>
            </dl>

            {checkoutUrl ? (
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary btn--md"
              >
                {t('orders.details.openCheckout')}
              </a>
            ) : (
              <div className="form-actions">
                <Button
                  onClick={() => void runInitiatePayment()}
                  loading={initiating}
                  variant="secondary"
                >
                  {initiating
                    ? t('orders.details.initiating')
                    : t('orders.details.initiatePayment')}
                </Button>
              </div>
            )}

            <h3 className="card__subtitle">{t('orders.details.paymentAttempts')}</h3>
            {payment.attempts.length === 0 ? (
              <p className="card__muted">{t('orders.details.noAttempts')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.status')}</th>
                    <th>{t('orders.details.paymentAmount')}</th>
                    <th>{t('orders.details.paymentReference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td>{formatEgpHtml(attempt.amount)}</td>
                      <td>{attempt.providerReference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={t('orders.details.statusConfirmTitle')}
        description={
          order && targetStatus
            ? t('orders.details.statusConfirmDesc', {
                number: order.orderNumber,
                from: t(`status.${order.status}`),
                to: t(`status.${targetStatus}`),
              })
            : undefined
        }
        confirmLabel={t('orders.details.updateStatus')}
        loading={acting}
        onConfirm={() => void runStatusTransition()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
