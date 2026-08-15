'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storefrontApi } from '@/lib/api/storefront';
import { ApiError } from '@/lib/api/client';
import type { StorefrontPage } from '@/lib/storefront/types';
import { SectionRenderer } from '@/components/storefront/SectionRenderer';
import { StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';

/**
 * Customer-facing CMS page (Phase 19). Only PUBLISHED pages are ever returned
 * by the backend; sections render in their configured order with the store
 * theme applied by the storefront shell.
 */
export default function StorePageRoute() {
  const params = useParams<{ slug: string; pageSlug: string }>();
  const pageSlug = params.pageSlug;
  const { slug } = useStorefront();
  const { t } = useI18n();

  const [page, setPage] = useState<StorefrontPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setPage(null);
    setError(null);
    void storefrontApi
      .getPageBySlug(slug, pageSlug)
      .then((result) => setPage(result.data))
      .catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, pageSlug, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return <StorefrontError message={error} onRetry={load} />;
  }

  if (!page) {
    return <StorefrontLoading />;
  }

  return (
    <div className="sf-page sf-page--narrow">
      <h1>{page.title}</h1>
      {page.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}
