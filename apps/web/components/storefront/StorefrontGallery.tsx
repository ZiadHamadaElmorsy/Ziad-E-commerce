'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storefrontApi } from '@/lib/api/storefront';
import type { StorefrontImage } from '@/lib/storefront/types';
import { StorefrontImage as StorefrontImg } from './StorefrontImage';

/** Storefront gallery page size (thumbnails loaded per page). */
export const STOREFRONT_GALLERY_PAGE_SIZE = 12;

/**
 * Customer-facing product gallery (Phase 26).
 *
 * - Main image + thumbnail strip, next/previous, keyboard navigation.
 * - Variant-aware: when a variant is selected, the gallery shows that
 *   variant's images first, falls back to product-level images, and never
 *   shows another variant's images.
 * - Lazy, paginated thumbnails — a 1000-image product never renders all
 *   thumbnails at once and full-resolution assets load only when selected.
 */
export function StorefrontGallery({
  productSlug,
  productName,
  initialImages,
  totalImages,
  selectedVariantId,
}: {
  productSlug: string;
  productName: string;
  /** First page of the gallery from the product detail response. */
  initialImages: StorefrontImage[];
  totalImages: number;
  /** Currently selected variant id (null = no variant chosen). */
  selectedVariantId: string | null;
}) {
  const { slug } = useStorefront();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<StorefrontImage[]>(initialImages);
  const [hasMore, setHasMore] = useState(initialImages.length < totalImages);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mainIndex, setMainIndex] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Reset local state when the product or initial page changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(initialImages);
    setHasMore(initialImages.length < totalImages);
    setPage(1);
    setMainIndex(0);
  }, [initialImages, totalImages]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await storefrontApi.listProductMedia(slug, productSlug, {
        page: page + 1,
        limit: STOREFRONT_GALLERY_PAGE_SIZE,
      });
      setLoaded((current) => {
        const existing = new Set(current.map((image) => image.id));
        const additions = result.data
          .filter((item) => !existing.has(item.mediaId))
          .map((item) => ({
            id: item.mediaId,
            altText: item.altText,
            variantId: item.variantId,
            isPrimary: item.isPrimary,
            sortOrder: item.sortOrder,
          }));
        return [...current, ...additions];
      });
      setPage((current) => current + 1);
      setHasMore(result.meta.page < result.meta.totalPages);
    } catch {
      // Keep the current page; the next scroll/click retries.
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, slug, productSlug]);

  // Load the next page when the sentinel becomes visible (infinite scroll).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (!hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    });
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore, sentinel]);

  // Variant-aware filtering (product-level fallback, never wrong variant images).
  const gallery = useMemo(() => {
    if (!selectedVariantId) return loaded;
    const variantImages = loaded.filter((image) => image.variantId === selectedVariantId);
    if (variantImages.length > 0) return variantImages;
    return loaded.filter((image) => !image.variantId);
  }, [loaded, selectedVariantId]);

  // Keep the selected image index valid when the variant switch shrinks the
  // gallery (e.g. Black has 4 images, White has 1).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMainIndex((current) => Math.min(current, Math.max(0, gallery.length - 1)));
  }, [gallery.length]);

  const current = gallery[mainIndex] ?? null;

  const clamp = (next: number) => {
    if (gallery.length === 0) return;
    setMainIndex(((next % gallery.length) + gallery.length) % gallery.length);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      clamp(mainIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      clamp(mainIndex + 1);
    }
  };

  if (gallery.length === 0) {
    return <p className="sf-pdp__gallery-empty">{t('storefront.galleryEmpty')}</p>;
  }

  return (
    <div
      className="sf-gallery"
      role="group"
      aria-label={t('storefront.galleryTitle')}
      onKeyDown={onKeyDown}
    >
      <div className="sf-gallery__main">
        <button
          type="button"
          className="sf-gallery__nav sf-gallery__nav--prev"
          aria-label={t('storefront.prevImage')}
          onClick={() => clamp(mainIndex - 1)}
        >
          ‹
        </button>
        <StorefrontImg
          mediaId={current?.id ?? null}
          alt={current?.altText ?? productName}
          className="sf-gallery__image"
        />
        <button
          type="button"
          className="sf-gallery__nav sf-gallery__nav--next"
          aria-label={t('storefront.nextImage')}
          onClick={() => clamp(mainIndex + 1)}
        >
          ›
        </button>
      </div>

      {gallery.length > 1 ? (
        <div className="sf-gallery__thumbs" role="tablist" aria-label={t('storefront.galleryTitle')}>
          {gallery.map((image, index) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              aria-selected={index === mainIndex}
              aria-label={t('storefront.galleryImage', {
                position: index + 1,
                total: gallery.length,
              })}
              className={
                index === mainIndex
                  ? 'sf-gallery__thumb sf-gallery__thumb--active'
                  : 'sf-gallery__thumb'
              }
              onClick={() => setMainIndex(index)}
            >
              <StorefrontImg
                mediaId={image.id}
                alt={image.altText ?? productName}
                className="sf-gallery__thumb-img"
              />
            </button>
          ))}
          <div ref={sentinel} className="sf-gallery__sentinel" aria-hidden="true" />
        </div>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          className="sf-btn sf-btn--outline sf-gallery__more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? t('common.loading') : t('storefront.galleryLoadMore')}
        </button>
      ) : null}

      <p className="sf-muted sf-text-sm">
        {t('storefront.galleryImage', { position: mainIndex + 1, total: gallery.length })}
        {hasMore || totalImages > gallery.length
          ? ` · ${t('products.gallery.count', { count: totalImages })}`
          : ''}
      </p>
    </div>
  );
}
