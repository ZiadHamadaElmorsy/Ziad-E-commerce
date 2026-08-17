'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import type { CategoryView, ProductView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatEgpHtml } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

export default function CategoryDetailsPage() {
  const params = useParams<{ categoryId: string }>();
  const categoryId = params.categoryId;
  const { t } = useI18n();
  const toast = useToast();

  const [category, setCategory] = useState<CategoryView | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryResult, productsResult] = await Promise.all([
        catalogApi.getCategory(categoryId),
        catalogApi.listProducts({ categoryId, page: 1, limit: 100 }),
      ]);
      const loaded = categoryResult.data;
      setCategory(loaded);
      setName(loaded.name);
      setNameAr(loaded.nameAr ?? '');
      setNameEn(loaded.nameEn ?? '');
      setDescription(loaded.description ?? '');
      setProducts(productsResult.data);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'categories.details.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [categoryId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!category) return;
    setNameError(undefined);

    if (!name.trim()) {
      setNameError(t('categories.details.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const result = await catalogApi.updateCategory(category.id, {
        name: name.trim(),
        nameAr: nameAr.trim() || null,
        nameEn: nameEn.trim() || null,
        description: description.trim() ? description.trim() : null,
      });
      setCategory(result.data);
      toast.success(t('categories.details.updatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'categories.details.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runArchive = async () => {
    if (!category) return;
    setActing(true);
    try {
      await catalogApi.archiveCategory(category.id);
      toast.success(t('categories.details.archivedToast'));
      setArchiveOpen(false);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'categories.details.archiveFailed'));
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingBlock label={t('categories.details.loading')} />
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="page">
        <ErrorState
          message={error ?? t('categories.details.notFound')}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: t('nav.dashboard'), href: '/dashboard' },
          { label: t('nav.categories'), href: '/dashboard/categories' },
          { label: category.name },
        ]}
      />
      <PageHeader
        title={category.name}
        description={`/${category.slug}`}
        actions={
          <>
            {category.status !== 'ARCHIVED' ? (
              <Button variant="danger" onClick={() => setArchiveOpen(true)}>
                {t('common.archive')}
              </Button>
            ) : null}
            <Link href="/dashboard/categories" className="btn btn--ghost btn--md">
              {t('common.backTo', { target: t('categories.title') })}
            </Link>
          </>
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <form onSubmit={handleSave} noValidate>
            <Card title={t('common.details')}>
              <div className="form-grid">
                <Field label={t('common.name')} htmlFor="category-name" required error={nameError}>
                  <Input
                    id="category-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('categories.nameAr')}
                  htmlFor="category-name-ar"
                  hint={t('products.details.nameArHint')}
                >
                  <Input
                    id="category-name-ar"
                    value={nameAr}
                    onChange={(event) => setNameAr(event.target.value)}
                    dir="rtl"
                  />
                </Field>
                <Field
                  label={t('categories.nameEn')}
                  htmlFor="category-name-en"
                  hint={t('products.details.nameEnHint')}
                >
                  <Input
                    id="category-name-en"
                    value={nameEn}
                    onChange={(event) => setNameEn(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('common.description')}
                  htmlFor="category-description"
                  hint={t('products.new.descriptionHint')}
                >
                  <Textarea
                    id="category-description"
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button type="submit" loading={saving}>
                  {saving ? t('categories.details.saving') : t('common.saveChanges')}
                </Button>
              </div>
            </Card>
          </form>

          <Card
            title={t('categories.details.productsTitle')}
            description={
              products.length === 1
                ? t('categories.details.productsDescOne', { count: products.length })
                : t('categories.details.productsDescMany', { count: products.length })
            }
          >
            {products.length === 0 ? (
              <EmptyState
                icon="◈"
                title={t('categories.details.productsEmpty')}
                description={t('categories.details.productsEmptyDesc')}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('categories.details.productsTitle')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const activeVariant = product.variants.find((v) => v.status === 'ACTIVE');
                    return (
                      <tr key={product.id}>
                        <td data-label={t('categories.details.productsTitle')}>
                          <Link href={`/dashboard/products/${product.id}`} className="link">
                            {product.name}
                          </Link>
                          <div className="table__muted">/{product.slug}</div>
                        </td>
                        <td data-label={t('common.status')}>
                          <StatusBadge status={product.status} />
                        </td>
                        <td data-label={t('common.price')}>{formatEgpHtml(activeVariant?.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title={t('common.overview')}>
            <dl className="meta-list">
              <div>
                <dt>{t('categories.details.slug')}</dt>
                <dd>{category.slug}</dd>
              </div>
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge status={category.status} />
                </dd>
              </div>
              <div>
                <dt>{t('categories.details.products')}</dt>
                <dd>{products.length}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title={t('categories.archiveConfirmTitle')}
        description={
          category ? t('categories.archiveConfirmDesc', { name: category.name }) : undefined
        }
        confirmLabel={t('common.archive')}
        loading={acting}
        onConfirm={() => void runArchive()}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  );
}
