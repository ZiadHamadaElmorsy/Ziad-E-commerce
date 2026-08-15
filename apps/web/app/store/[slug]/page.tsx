'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import {
  storeCategoriesPath,
  storeCategoryPath,
  storeProductsPath,
} from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import type { StorefrontCategory, StorefrontProduct } from '@/lib/storefront/types';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { StorefrontEmpty, StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';

/**
 * Storefront home (Phase 19). Real data only: the store's branding, its
 * published products and its active categories, all resolved through the
 * public storefront API for the resolved store.
 */
export default function StoreHomePage() {
  const { slug, store } = useStorefront();
  const { t } = useI18n();

  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setProducts(null);
    setCategories(null);
    setError(null);
    void Promise.all([
      storefrontApi.listProducts(slug, { page: 1, limit: 8 }),
      storefrontApi.listCategories(slug, { page: 1, limit: 20 }),
    ])
      .then(([productResult, categoryResult]) => {
        setProducts(productResult.data);
        setCategories(categoryResult.data);
      })
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

  if (products === null || categories === null) {
    return <StorefrontLoading />;
  }

  return (
    <div className="sf-page">
      <section className="sf-hero">
        <h1>{store?.name ?? t('storefront.store')}</h1>
        {store?.description ? <p className="sf-hero-subtitle">{store.description}</p> : null}
        <div className="sf-hero__actions">
          <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--primary sf-btn--lg">
            {t('storefront.shopNow')}
          </Link>
          <Link href={storeCategoriesPath(slug)} className="sf-btn sf-btn--outline sf-btn--lg">
            {t('storefront.browseCategories')}
          </Link>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="sf-section">
          <div className="sf-section-head">
            <h2>{t('storefront.categories')}</h2>
            <Link href={storeCategoriesPath(slug)} className="sf-link">
              {t('storefront.viewAll')}
            </Link>
          </div>
          <ul className="sf-chip-list">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={storeCategoryPath(slug, category.slug)} className="sf-chip">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sf-section">
        <div className="sf-section-head">
          <h2>{t('storefront.products')}</h2>
          <Link href={storeProductsPath(slug)} className="sf-link">
            {t('storefront.viewAll')}
          </Link>
        </div>
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <StorefrontEmpty
            icon="🛍️"
            title={t('storefront.noProducts')}
            description={t('storefront.noProductsDesc')}
          />
        )}
      </section>
    </div>
  );
}
