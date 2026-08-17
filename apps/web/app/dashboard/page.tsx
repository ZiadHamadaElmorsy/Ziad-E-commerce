'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { dashboardApi } from '@/lib/api/dashboard';
import type {
  DashboardOrderSummary,
  DashboardRecentProduct,
  DashboardStatsView,
} from '@/lib/api/types';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatEgpHtml, formatDate } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Real dashboard metrics (Phase 25 — performance audit).
 *
 * Every number comes from a SINGLE backend request (GET /dashboard/stats):
 * - product counts by status, category count (one grouped query)
 * - order total + recent orders
 * - revenue as a server-side SUM(grand_total) aggregate
 * - recent products (lean projection, no media join)
 *
 * The old implementation fired six parallel collection requests PLUS a
 * browser-side paginated revenue sum (up to 50 sequential requests for a
 * 5,000-order store) — replaced by one request with parallel DB aggregates.
 */
const EMPTY_STATS: DashboardStatsView = {
  products: { total: 0, active: 0, drafts: 0, archived: 0 },
  categories: 0,
  orders: { total: 0, recent: [] },
  revenue: null,
  recentProducts: [],
};

export default function DashboardPage() {
  const { user, store } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStatsView>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.getStats();
      setStats(result.data);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'dashboard.title'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const statCards = [
    { label: t('dashboard.products'), value: stats.products.total, href: '/dashboard/products' },
    {
      label: t('dashboard.activeProducts'),
      value: stats.products.active,
      href: '/dashboard/products?status=ACTIVE',
    },
    {
      label: t('dashboard.totalOrders'),
      value: stats.orders.total,
      href: '/dashboard/orders',
    },
    {
      label: t('dashboard.revenue'),
      value: stats.revenue === null ? '—' : formatEgpHtml(stats.revenue),
      href: '/dashboard/orders',
    },
    {
      label: t('dashboard.drafts'),
      value: stats.products.drafts,
      href: '/dashboard/products?status=DRAFT',
    },
    { label: t('dashboard.categories'), value: stats.categories, href: '/dashboard/categories' },
  ];

  const firstName = user?.email?.split('@')[0] ?? t('userMenu.merchant');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">{t('dashboard.welcome', { name: firstName })}</h1>
          <p className="page-header__description">
            {store
              ? t('dashboard.manageStore', { store: store.name, slug: store.slug })
              : t('dashboard.manageStoreSimple')}
          </p>
        </div>
        {store ? (
          <div className="page-header__actions">
            <Link href={`/store/${store.slug}`} className="btn btn--primary btn--sm" data-testid="view-store">
              {t('dashboard.viewStore')}
            </Link>
          </div>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="page">
          <div className="stat-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="stat-card stat-card--skeleton" key={index} aria-hidden="true">
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--block" />
              </div>
            ))}
          </div>
          <Card title={t('dashboard.recentProducts')}>
            <TableSkeleton rows={5} columns={4} actions={false} />
          </Card>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href} className="stat-card">
                <span className="stat-card__label">{card.label}</span>
                <span className="stat-card__value">{card.value}</span>
              </Link>
            ))}
          </div>

          <Card
            title={t('dashboard.recentProducts')}
            description={t('dashboard.recentProductsDesc')}
            actions={
              <Link href="/dashboard/products/new" className="btn btn--primary btn--sm">
                {t('dashboard.addProduct')}
              </Link>
            }
          >
            {stats.products.total === 0 ? (
              <div className="table-empty">
                <p>{t('dashboard.noProductsYet')}</p>
                <Link href="/dashboard/products/new" className="btn btn--primary btn--sm">
                  {t('dashboard.createFirstProduct')}
                </Link>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('dashboard.product')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('dashboard.total')}</th>
                    <th>{t('common.price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentProducts.map((product: DashboardRecentProduct) => (
                    <tr key={product.id}>
                      <td data-label={t('dashboard.product')}>
                        <Link href={`/dashboard/products/${product.id}`} className="link">
                          {product.name}
                        </Link>
                        <span className="table__muted">/{product.slug}</span>
                      </td>
                      <td data-label={t('common.status')}>
                        <StatusBadge status={product.status} />
                      </td>
                      <td data-label={t('dashboard.total')}>{product.variantsCount}</td>
                      <td data-label={t('common.price')}>{formatEgpHtml(product.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title={t('dashboard.recentOrders')}
            description={t('dashboard.recentOrdersDesc')}
            actions={
              stats.orders.total > 0 ? (
                <Link href="/dashboard/orders" className="btn btn--ghost btn--sm">
                  {t('common.viewAll')}
                </Link>
              ) : null
            }
          >
            {stats.orders.total === 0 ? (
              <div className="table-empty">
                <p>{t('dashboard.noOrdersYet')}</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('dashboard.order')}</th>
                    <th>{t('dashboard.customer')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('dashboard.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.orders.recent.map((order: DashboardOrderSummary) => (
                    <tr key={order.id}>
                      <td data-label={t('dashboard.order')}>
                        <Link href={`/dashboard/orders/${order.id}`} className="link">
                          {order.orderNumber}
                        </Link>
                        <span className="table__muted">{formatDate(order.createdAt)}</span>
                      </td>
                      <td data-label={t('dashboard.customer')}>
                        {order.customerEmail ?? order.customerPhone ?? '—'}
                      </td>
                      <td data-label={t('common.status')}>
                        <StatusBadge status={order.status} />
                      </td>
                      <td data-label={t('dashboard.total')}>{formatEgpHtml(order.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}