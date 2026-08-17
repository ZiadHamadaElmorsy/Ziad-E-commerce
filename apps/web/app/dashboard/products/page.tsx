'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import type { CategoryView, ProductStatus, ProductView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { FilterBar } from '@/components/ui/FilterBar';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatEgpHtml } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import type { TranslationKey } from '@/lib/i18n/translations';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: '' | ProductStatus; labelKey: TranslationKey }> = [
  { value: '', labelKey: 'products.allStatuses' },
  { value: 'DRAFT', labelKey: 'status.DRAFT' },
  { value: 'ACTIVE', labelKey: 'status.ACTIVE' },
  { value: 'ARCHIVED', labelKey: 'status.ARCHIVED' },
];

interface PendingAction {
  type: 'publish' | 'unpublish' | 'archive';
  product: ProductView;
}

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const toast = useToast();

  const [products, setProducts] = useState<ProductView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? '') as '' | ProductStatus;
  const categoryId = searchParams.get('categoryId') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchDraft, setSearchDraft] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories once for the filter dropdown.
  useEffect(() => {
    catalogApi
      .listCategories({ page: 1, limit: 100 })
      .then((result) => setCategories(result.data))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await catalogApi.listProducts({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        categoryId: categoryId || undefined,
      });
      setProducts(result.data);
      setTotalPages(result.meta.totalPages);
      setTotal(result.meta.total);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'products.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, categoryId, t]);

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
      router.replace(`/dashboard/products${params.size > 0 ? `?${params.toString()}` : ''}`);
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

  const runAction = async () => {
    if (!pendingAction) return;
    const { type, product } = pendingAction;
    setActing(true);
    try {
      if (type === 'publish') await catalogApi.publishProduct(product.id);
      if (type === 'unpublish') await catalogApi.unpublishProduct(product.id);
      if (type === 'archive') await catalogApi.archiveProduct(product.id);
      toast.success(
        type === 'publish'
          ? t('products.publishedToast')
          : type === 'unpublish'
            ? t('products.unpublishedToast')
            : t('products.archivedToast'),
      );
      setPendingAction(null);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const selectedCategoryLabel = useMemo(
    () => categories.find((category) => category.id === categoryId)?.name,
    [categories, categoryId],
  );

  return (
    <div className="page">
      <PageHeader
        title={t('products.title')}
        description={
          total === 1
            ? t('products.countOne', { count: total })
            : t('products.countMany', { count: total })
        }
        actions={
          <Link href="/dashboard/products/new" className="btn btn--primary btn--md">
            {t('products.add')}
          </Link>
        }
      />

      <Card>
        <FilterBar
          search={
            <Input
              aria-label={t('products.searchPlaceholder')}
              placeholder={t('products.searchPlaceholder')}
              value={searchDraft}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          }
          activeCount={(status ? 1 : 0) + (categoryId ? 1 : 0)}
          onClear={
            search || status || categoryId
              ? () => {
                  setSearchDraft('');
                  router.replace('/dashboard/products');
                }
              : undefined
          }
        >
          <Select
            aria-label={t('products.filterStatus')}
            value={status}
            onChange={(event) => updateQuery({ status: event.target.value, page: '' })}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('products.filterCategory')}
            value={categoryId}
            onChange={(event) => updateQuery({ categoryId: event.target.value, page: '' })}
          >
            <option value="">{t('products.allCategories')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </FilterBar>

        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : loading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : products.length === 0 ? (
          <EmptyState
            title={
              search || status || categoryId
                ? t('products.emptyFiltered')
                : t('products.emptyTitle')
            }
            description={
              search || status || categoryId
                ? t('products.emptyFilteredDesc')
                : t('products.emptyDesc')
            }
            action={
              !(search || status || categoryId) ? (
                <Link href="/dashboard/products/new" className="btn btn--primary btn--md">
                  {t('products.create')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products.table.name')}</th>
                  <th>{t('products.table.status')}</th>
                  <th>{t('products.table.variants')}</th>
                  <th>{t('products.table.price')}</th>
                  <th className="table__actions-head">{t('products.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const activeVariants = product.variants.filter((v) => v.status === 'ACTIVE');
                  const minPrice = activeVariants.length
                    ? Math.min(...activeVariants.map((v) => v.price))
                    : null;
                  return (
                    <tr key={product.id}>
                      <td data-label={t('products.table.name')}>
                        <Link href={`/dashboard/products/${product.id}`} className="link">
                          {product.name}
                        </Link>
                        <div className="table__muted">/{product.slug}</div>
                      </td>
                      <td data-label={t('products.table.status')}>
                        <StatusBadge status={product.status} />
                      </td>
                      <td data-label={t('products.table.variants')}>
                        {activeVariants.length > 0
                          ? t('products.activeVariants', { count: activeVariants.length })
                          : product.variants.length > 0
                            ? t('products.archivedVariants', { count: product.variants.length })
                            : '—'}
                      </td>
                      <td data-label={t('products.table.price')}>{formatEgpHtml(minPrice)}</td>

                      <td data-label="">
                        <div className="table__actions">
                          <Link
                            href={`/dashboard/products/${product.id}`}
                            className="btn btn--outline btn--sm"
                          >
                            {t('products.view')}
                          </Link>
                          {product.status === 'DRAFT' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setPendingAction({ type: 'publish', product })}
                            >
                              {t('common.publish')}
                            </Button>
                          ) : null}
                          {product.status === 'ACTIVE' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setPendingAction({ type: 'unpublish', product })}
                            >
                              {t('common.unpublish')}
                            </Button>
                          ) : null}
                          {product.status !== 'ARCHIVED' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setPendingAction({ type: 'archive', product })}
                            >
                              {t('common.archive')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={(next) => updateQuery({ page: String(next) })}
              infoExtra={
                selectedCategoryLabel
                  ? `${t('products.filterCategory')}: ${selectedCategoryLabel}`
                  : undefined
              }
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'archive'
            ? t('products.archiveConfirmTitle')
            : pendingAction?.type === 'publish'
              ? t('products.publishConfirmTitle')
              : t('products.unpublishConfirmTitle')
        }
        description={
          pendingAction?.type === 'archive'
            ? t('products.archiveConfirmDesc', { name: pendingAction?.product.name ?? '' })
            : pendingAction?.type === 'publish'
              ? t('products.publishConfirmDesc', { name: pendingAction?.product.name ?? '' })
              : t('products.unpublishConfirmDesc', { name: pendingAction?.product.name ?? '' })
        }
        confirmLabel={
          pendingAction?.type === 'archive'
            ? t('common.archive')
            : pendingAction?.type === 'publish'
              ? t('common.publish')
              : t('common.unpublish')
        }
        tone={pendingAction?.type === 'archive' ? 'danger' : 'primary'}
        loading={acting}
        onConfirm={() => void runAction()}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
