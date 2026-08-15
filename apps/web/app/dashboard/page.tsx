'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { catalogApi } from '@/lib/api/catalog';
import { ordersApi } from '@/lib/api/orders';
import type { OrderSummaryView, ProductView } from '@/lib/api/types';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatEgpHtml, formatDate } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Real dashboard metrics. Every number comes from the backend:
 * - product/category counts from the catalog collection meta
 * - order count + recent orders from GET /orders
 * - revenue is the sum of grandTotal across ALL real orders (paginated).
 *   No metric is hardcoded; anything the backend cannot provide is omitted.
 */
const REVENUE_MAX_PAGES = 50; // safety cap (50 pages × 100 orders)

interface DashboardStats {
  products: { total: number; active: number; drafts: number; archived: number };
  categories: number;
  orders: { total: number; recent: OrderSummaryView[] };
  revenue: number | null;
  revenueCapped: boolean;
  recentProducts: ProductView[];
}

const EMPTY_STATS: DashboardStats = {
  products: { total: 0, active: 0, drafts: 0, archived: 0 },
  categories: 0,
  orders: { total: 0, recent: [] },
  revenue: null,
  revenueCapped: false,
  recentProducts: [],
};

/** Sums grandTotal across all orders via the real paginated API. */
async function fetchTotalRevenue(): Promise<{ revenue: number | null; capped: boolean }> {
  let total = 0;
  let page = 1;
  while (page <= REVENUE_MAX_PAGES) {
    const result = await ordersApi.listOrders({ page, limit: 100 });
    for (const order of result.data) {
      total += order.grandTotal;
    }
    if (page >= result.meta.totalPages) break;
    page += 1;
  }
  return { revenue: total, capped: page > REVENUE_MAX_PAGES };
}

export default function DashboardPage() {
  const { user, store } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsAll, productsActive, productsDraft, productsArchived, categories, orders] =
        await Promise.all([
          catalogApi.listProducts({ page: 1, limit: 5 }),
          catalogApi.listProducts({ status: 'ACTIVE', page: 1, limit: 1 }),
          catalogApi.listProducts({ status: 'DRAFT', page: 1, limit: 1 }),
          catalogApi.listProducts({ status: 'ARCHIVED', page: 1, limit: 1 }),
          catalogApi.listCategories({ page: 1, limit: 1 }),
          ordersApi.listOrders({ page: 1, limit: 5 }),
        ]);
      setStats({
        products: {
          total: productsAll.meta.total,
          active: productsActive.meta.total,
          drafts: productsDraft.meta.total,
          archived: productsArchived.meta.total,
        },
        categories: categories.meta.total,
        orders: {
          total: orders.meta.total,
          recent: orders.data,
        },
        revenue: null,
        revenueCapped: false,
        recentProducts: productsAll.data,
      });
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'dashboard.title'));
    } finally {
      setLoading(false);
    }

    // Revenue is a real paginated sum of ALL orders. It is computed in the
    // background so the rest of the dashboard renders immediately; until it
    // resolves the revenue card shows "—".
    try {
      const { revenue, capped } = await fetchTotalRevenue();
      setStats((current) => ({ ...current, revenue, revenueCapped: capped }));
    } catch {
      // Revenue remains null -> the UI shows '—' (not available).
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
                  {stats.recentProducts.map((product: ProductView) => {
                    const activeVariant = product.variants.find((v) => v.status === 'ACTIVE');
                    return (
                      <tr key={product.id}>
                        <td>
                          <Link href={`/dashboard/products/${product.id}`} className="link">
                            {product.name}
                          </Link>
                          <span className="table__muted">/{product.slug}</span>
                        </td>
                        <td>
                          <StatusBadge status={product.status} />
                        </td>
                        <td>{product.variants.length}</td>
                        <td>{formatEgpHtml(activeVariant?.price)}</td>
                      </tr>
                    );
                  })}
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
                  {stats.orders.recent.map((order: OrderSummaryView) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/dashboard/orders/${order.id}`} className="link">
                          {order.orderNumber}
                        </Link>
                        <span className="table__muted">{formatDate(order.createdAt)}</span>
                      </td>
                      <td>{order.customerEmail ?? order.customerPhone ?? '—'}</td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>{formatEgpHtml(order.grandTotal)}</td>
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
