'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeCategoryPath, storeProductsPath } from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import type { StorefrontCategory } from '@/lib/storefront/types';
import { StorefrontEmpty, StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';

/** Storefront category listing — ACTIVE categories only (real data). */
export default function StoreCategoriesPage() {
  const { slug } = useStorefront();
  const { t } = useI18n();
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setCategories(null);
    setError(null);
    void storefrontApi
      .listCategories(slug, { page: 1, limit: 100 })
      .then((result) => setCategories(result.data))
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : t('storefront.loadFailed'));
      });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) {
    return <StorefrontError message={error} onRetry={load} />;
  }

  if (categories === null) {
    return <StorefrontLoading />;
  }

  return (
    <div className="sf-page">
      <h1>{t('storefront.categories')}</h1>

      {categories.length === 0 ? (
        <StorefrontEmpty
          icon="🗂️"
          title={t('storefront.noCategories')}
          description={t('storefront.noCategoriesDesc')}
        />
      ) : (
        <div className="sf-category-grid">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={storeCategoryPath(slug, category.slug)}
              className="sf-category-card"
            >
              <span className="sf-category-card__name">{category.name}</span>
              {category.description ? (
                <span className="sf-muted sf-text-sm">{category.description}</span>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <p className="sf-section-foot">
        <Link href={storeProductsPath(slug)} className="sf-link">
          {t('storefront.viewAllProducts')}
        </Link>
      </p>
    </div>
  );
}
