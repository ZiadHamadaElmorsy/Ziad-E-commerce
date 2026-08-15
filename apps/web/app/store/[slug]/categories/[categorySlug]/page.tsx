'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeCategoriesPath } from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import type { StorefrontProduct } from '@/lib/storefront/types';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { StorefrontEmpty, StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';

/** Storefront category page — the category's ACTIVE products (real data). */
export default function StoreCategoryPage() {
  const params = useParams<{ slug: string; categorySlug: string }>();
  const categorySlug = params.categorySlug;
  const { slug } = useStorefront();
  const { t } = useI18n();

  const [category, setCategory] = useState<{
    name: string;
    description: string | null;
  } | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setCategory(null);
    setProducts(null);
    setError(null);
    void storefrontApi
      .getCategoryBySlug(slug, categorySlug)
      .then((result) => {
        setCategory({ name: result.data.name, description: result.data.description });
        setProducts(result.data.products);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, categorySlug, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return <StorefrontError message={error} onRetry={load} />;
  }

  if (category === null || products === null) {
    return <StorefrontLoading />;
  }

  return (
    <div className="sf-page">
      <p className="sf-breadcrumbs">
        <Link href={storeCategoriesPath(slug)}>{t('storefront.categories')}</Link>
        <span aria-hidden="true"> / </span>
        <span>{category.name}</span>
      </p>
      <h1>{category.name}</h1>
      {category.description ? <p className="sf-muted">{category.description}</p> : null}

      {products.length === 0 ? (
        <StorefrontEmpty
          icon="🗂️"
          title={t('storefront.categoryEmpty')}
          description={t('storefront.noProductsDesc')}
        />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
