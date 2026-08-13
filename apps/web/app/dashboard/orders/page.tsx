'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { ordersApi } from '@/lib/api/orders';
import type { OrderStatus, OrderSummaryView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { formatEgpHtml, formatDate } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

const PAGE_SIZE = 20;

const STATUS_VALUES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [orders, setOrders] = useState<OrderSummaryView[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? '') as '' | OrderStatus;
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchDraft, setSearchDraft] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.listOrders({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      });
      setOrders(result.data);
      setTotalPages(result.meta.totalPages);
      setTotal(result.meta.total);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'orders.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const updateQuery = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.replace(`/dashboard/orders${params.size > 0 ? `?${params.toString()}` : ''}`);
    },
    [router, searchParams],
  );

  const onSearchChange = (value: string) => {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      updateQuery({ search: value, page: '' });
    }, 400);
  };

  return (
    <div className="page">
      <PageHeader
        title={t('orders.title')}
        description={
          total === 1
            ? t('orders.countOne', { count: total })
            : t('orders.countMany', { count: total })
        }
      />

      <Card>
        <div className="filters">
          <div className="filters__search">
            <Input
              aria-label={t('orders.searchPlaceholder')}
              placeholder={t('orders.searchPlaceholder')}
              value={searchDraft}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <Select
            aria-label={t('orders.filterStatus')}
            value={status}
            onChange={(event) => updateQuery({ status: event.target.value, page: '' })}
          >
            <option value="">{t('orders.allStatuses')}</option>
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </Select>
          {(search || status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchDraft('');
                router.replace('/dashboard/orders');
              }}
            >
              {t('common.clearFilters')}
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : loading ? (
          <TableSkeleton rows={10} columns={6} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="☰"
            title={search || status ? t('orders.emptyFiltered') : t('orders.emptyTitle')}
            description={search || status ? t('orders.emptyFilteredDesc') : t('orders.emptyDesc')}
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orders.table.order')}</th>
                  <th>{t('orders.table.date')}</th>
                  <th>{t('orders.table.customer')}</th>
                  <th>{t('orders.table.status')}</th>
                  <th>{t('orders.table.total')}</th>
                  <th className="table__actions-head">{t('common.actions')}</th>
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
                    <td>{order.customerEmail ?? order.customerPhone ?? '—'}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>{formatEgpHtml(order.grandTotal)}</td>
                    <td>
                      <div className="table__actions">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="btn btn--outline btn--sm"
                        >
                          {t('orders.view')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={(next) => updateQuery({ page: String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
