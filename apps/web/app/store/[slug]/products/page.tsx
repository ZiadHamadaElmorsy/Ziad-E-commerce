'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storefrontApi } from '@/lib/api/storefront';
import type { StorefrontProduct } from '@/lib/storefront/types';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { StorefrontEmpty, StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 12;

/** Storefront product listing — published products only, with search + pagination. */
export default function StoreProductsPage() {
  const { slug } = useStorefront();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [items, setItems] = useState<StorefrontProduct[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(search);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    void storefrontApi
      .listProducts(slug, { page, limit: PAGE_SIZE, search: search || undefined })
      .then((result) => {
        setItems(result.data);
        setTotalPages(result.meta.totalPages);
        setTotal(result.meta.total);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, page, search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set('q', searchInput.trim());
    router.push(`/store/${slug}/products${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (nextPage > 1) params.set('page', String(nextPage));
    router.push(`/store/${slug}/products${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <div className="sf-page">
      <div className="sf-section-head">
        <h1>{t('storefront.products')}</h1>
        {search ? (
          <p className="sf-muted">
            {t('storefront.searchResultsFor', { query: search })} · {total}
          </p>
        ) : null}
      </div>

      <form className="sf-search" onSubmit={submitSearch} role="search">
        <input
          type="search"
          className="sf-search__input"
          placeholder={t('storefront.searchPlaceholder')}
          aria-label={t('storefront.searchPlaceholder')}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit" className="sf-btn sf-btn--primary">
          {t('common.search')}
        </button>
      </form>

      {error ? (
        <StorefrontError message={error} onRetry={() => void load()} />
      ) : items === null ? (
        <StorefrontLoading />
      ) : items.length === 0 ? (
        <StorefrontEmpty
          icon="🔍"
          title={search ? t('storefront.noSearchResults') : t('storefront.noProducts')}
          description={t('storefront.noProductsDesc')}
        />
      ) : (
        <>
          <ProductGrid products={items} />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={goToPage}
          />
        </>
      )}
    </div>
  );
}
