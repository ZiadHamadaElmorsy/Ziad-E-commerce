'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { customersApi } from '@/lib/api/customers';
import type { CustomerOrderView, CustomerView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate, formatEgpHtml } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

const PAGE_SIZE = 10;

export default function CustomerDetailsPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { t } = useI18n();

  const [customer, setCustomer] = useState<CustomerView | null>(null);
  const [orders, setOrders] = useState<CustomerOrderView[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [customerResult, ordersResult] = await Promise.all([
        customersApi.getCustomer(customerId),
        customersApi.listCustomerOrders(customerId, { page, limit: PAGE_SIZE }),
      ]);
      setCustomer(customerResult.data);
      setOrders(ordersResult.data);
      setTotalPages(ordersResult.meta.totalPages);
      setTotalOrders(ordersResult.meta.total);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'customers.details.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [customerId, page, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const displayName = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'
    : '—';

  if (loading && !customer) {
    return (
      <div className="page">
        <LoadingBlock label={t('customers.details.loading')} />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="page">
        <ErrorState
          message={error ?? t('customers.details.notFound')}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={displayName}
        description={customer.email ?? '—'}
        actions={
          <Link href="/dashboard/customers" className="btn btn--ghost btn--md">
            {t('common.backTo', { target: t('customers.title') })}
          </Link>
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card
            title={t('customers.details.orderHistory')}
            description={
              totalOrders === 1
                ? t('customers.details.orderHistoryDescOne', { count: totalOrders })
                : t('customers.details.orderHistoryDescMany', { count: totalOrders })
            }
          >
            {loading ? (
              <TableSkeleton rows={5} columns={4} actions={false} />
            ) : orders.length === 0 ? (
              <EmptyState
                icon="☰"
                title={t('customers.details.noOrders')}
                description={t('customers.details.noOrdersDesc')}
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('customers.details.order')}</th>
                      <th>{t('customers.details.date')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('customers.details.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <Link href={`/dashboard/orders/${order.id}`} className="link">
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                        <td>{formatEgpHtml(order.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={totalOrders}
                  onPageChange={setPage}
                />
              </>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title={t('common.overview')}>
            <dl className="meta-list">
              <div>
                <dt>{t('customers.details.name')}</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>{t('customers.details.email')}</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('customers.details.phone')}</dt>
                <dd>{customer.phone ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
