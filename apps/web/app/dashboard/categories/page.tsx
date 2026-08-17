'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import type { CategoryView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';

export default function CategoriesPage() {
  const { t } = useI18n();
  const toast = useToast();

  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CategoryView | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await catalogApi.listCategories({ page: 1, limit: 100 });
      setCategories(result.data);
      setTotal(result.meta.total);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'categories.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const runArchive = async () => {
    if (!archiveTarget) return;
    setActing(true);
    try {
      await catalogApi.archiveCategory(archiveTarget.id);
      toast.success(t('categories.archiveToast'));
      setArchiveTarget(null);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'categories.archiveFailed'));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('categories.title')}
        description={
          total === 1
            ? t('categories.countOne', { count: total })
            : t('categories.countMany', { count: total })
        }
        actions={
          <Link href="/dashboard/categories/new" className="btn btn--primary btn--md">
            {t('categories.add')}
          </Link>
        }
      />

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : loading ? (
          <TableSkeleton rows={8} columns={4} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon="❖"
            title={t('categories.emptyTitle')}
            description={t('categories.emptyDesc')}
            action={
              <Link href="/dashboard/categories/new" className="btn btn--primary btn--md">
                {t('categories.create')}
              </Link>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('categories.table.category')}</th>
                <th>{t('categories.table.slug')}</th>
                <th>{t('categories.table.status')}</th>
                <th className="table__actions-head">{t('categories.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td data-label={t('categories.table.category')}>
                    <Link href={`/dashboard/categories/${category.id}`} className="link">
                      {category.name}
                    </Link>
                    {category.description ? (
                      <div className="table__muted">{category.description}</div>
                    ) : null}
                  </td>
                  <td className="table__muted" data-label={t('categories.table.slug')}>
                    /{category.slug}
                  </td>
                  <td data-label={t('categories.table.status')}>
                    <StatusBadge status={category.status} />
                  </td>
                  <td data-label="">
                    <div className="table__actions">
                      <Link
                        href={`/dashboard/categories/${category.id}`}
                        className="btn btn--outline btn--sm"
                      >
                        {t('categories.view')}
                      </Link>
                      {category.status !== 'ARCHIVED' ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setArchiveTarget(category)}
                        >
                          {t('categories.archive')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={archiveTarget !== null}
        title={t('categories.archiveConfirmTitle')}
        description={
          archiveTarget
            ? t('categories.archiveConfirmDesc', { name: archiveTarget.name })
            : undefined
        }
        confirmLabel={t('common.archive')}
        loading={acting}
        onConfirm={() => void runArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
