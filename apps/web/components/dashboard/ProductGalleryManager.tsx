'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import { mediaApiUploadWithProgress } from '@/lib/api/media';
import type { ProductMediaView, VariantView } from '@/lib/api/types';
import { DashboardMediaImage } from './DashboardMediaImage';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { LoadingBlock } from '@/components/ui/Modal';
import {
  appendToQueue,
  markDone,
  markError,
  markProgress,
  markUploading,
  removeFromQueue,
  requeue,
  takeNextQueued,
  type UploadQueueItem,
} from './product-gallery-queue';

/** Gallery page size (thumbnails loaded per page — never the whole gallery). */
export const GALLERY_PAGE_SIZE = 24;

/**
 * Merchant product gallery manager (Phase 26).
 *
 * - Multi-file upload with a bounded-concurrency queue (progress, retry).
 * - Paginated, lazily-loaded thumbnail gallery (never renders 1000 images).
 * - Reorder (up/down → batch PUT /products/:id/media/order), set primary,
 *   remove, and attach each image to a variant (product-level fallback).
 */
export function ProductGalleryManager({
  productId,
  variants,
  onChanged,
}: {
  productId: string;
  variants: VariantView[];
  /** Called after any mutation so the parent reloads its product view. */
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [items, setItems] = useState<ProductMediaView[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // gallery mutation in flight

  const activeUploads = useRef(0);
  const queueRef = useRef<UploadQueueItem[]>([]);

  const syncQueue = useCallback((next: UploadQueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      try {
        const result = await catalogApi.listProductMedia(productId, {
          page: targetPage,
          limit: GALLERY_PAGE_SIZE,
        });
        setItems((current) => (append ? [...current, ...result.data] : result.data));
        setPage(targetPage);
        setTotal(result.meta.total);
        setTotalPages(result.meta.totalPages);
        setError(null);
      } catch (caught) {
        setError(apiErrorMessage(caught, t, 'products.gallery.loadFailed'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [productId, t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(1, false);
  }, [loadPage]);

  // --- Upload queue (bounded concurrency) -------------------------------------

  // Plain (unmemoized) pump: it is self-recursive (completing one upload pumps
  // the next), so memoizing it would fail the React Compiler's
  // preserve-manual-memoization rule. Used only through event handlers, so the
  // per-render identity is harmless.
  const pumpQueue = () => {
    const ready = takeNextQueued(queueRef.current, activeUploads.current);
    for (const item of ready) {
      activeUploads.current += 1;
      syncQueue(markUploading(queueRef.current, item.id));
      void (async () => {
        try {
          const uploaded = await mediaApiUploadWithProgress(
            item.file,
            (percent) => syncQueue(markProgress(queueRef.current, item.id, percent)),
            item.altText.trim() || undefined,
          );
          await catalogApi.attachMedia(productId, uploaded.data.id);
          syncQueue(markDone(queueRef.current, item.id));
          toast.success(t('products.gallery.uploadedToast'));
          onChanged?.();
          await loadPage(1, false);
        } catch (caught) {
          syncQueue(
            markError(
              queueRef.current,
              item.id,
              apiErrorMessage(caught, t, 'products.gallery.uploadFailed'),
            ),
          );
        } finally {
          activeUploads.current = Math.max(0, activeUploads.current - 1);
          pumpQueue();
        }
      })();
    }
  };

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const current = queueRef.current;
      const next = appendToQueue(current, files);
      if (next.length === current.length) return;
      syncQueue(next);
      pumpQueue();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncQueue],
  );

  const retryUpload = useCallback(
    (itemId: string) => {
      syncQueue(requeue(queueRef.current, itemId));
      pumpQueue();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncQueue],
  );

  const dismissUpload = useCallback(
    (itemId: string) => {
      syncQueue(removeFromQueue(queueRef.current, itemId));
    },
    [syncQueue],
  );

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      enqueueFiles(Array.from(list));
    },
    [enqueueFiles],
  );

  // --- Gallery mutations ------------------------------------------------------

  const reloadFirstPage = useCallback(async () => {
    await loadPage(1, false);
    onChanged?.();
  }, [loadPage, onChanged]);

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return;
      const reordered = [...items];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const previous = items;
      setItems(reordered);
      setBusy(reordered[target].mediaId);
      try {
        await catalogApi.reorderProductMedia(productId, reordered.map((item) => item.mediaId));
        onChanged?.();
      } catch (caught) {
        setItems(previous);
        toast.error(apiErrorMessage(caught, t, 'products.gallery.reorderFailed'));
      } finally {
        setBusy(null);
      }
    },
    [items, productId, onChanged, t, toast],
  );

  const setPrimary = useCallback(
    async (mediaId: string) => {
      setBusy(mediaId);
      try {
        await catalogApi.updateProductMedia(productId, mediaId, { isPrimary: true });
        await reloadFirstPage();
        toast.success(t('products.gallery.primaryToast'));
      } catch (caught) {
        toast.error(apiErrorMessage(caught, t, 'products.gallery.primaryFailed'));
      } finally {
        setBusy(null);
      }
    },
    [productId, reloadFirstPage, t, toast],
  );

  const remove = useCallback(
    async (mediaId: string) => {
      setBusy(mediaId);
      try {
        await catalogApi.removeMedia(productId, mediaId);
        setItems((current) => current.filter((item) => item.mediaId !== mediaId));
        setTotal((current) => Math.max(0, current - 1));
        onChanged?.();
        toast.success(t('products.gallery.removedToast'));
      } catch (caught) {
        toast.error(apiErrorMessage(caught, t, 'products.gallery.removeFailed'));
      } finally {
        setBusy(null);
      }
    },
    [productId, onChanged, t, toast],
  );

  const attachVariant = useCallback(
    async (mediaId: string, variantId: string) => {
      setBusy(mediaId);
      try {
        await catalogApi.updateProductMedia(productId, mediaId, {
          variantId: variantId || null,
        });
        setItems((current) =>
          current.map((item) =>
            item.mediaId === mediaId ? { ...item, variantId: variantId || null } : item,
          ),
        );
        toast.success(t('products.gallery.variantLinkedToast'));
      } catch (caught) {
        toast.error(apiErrorMessage(caught, t, 'products.gallery.variantLinkFailed'));
      } finally {
        setBusy(null);
      }
    },
    [productId, t, toast],
  );

  const uploadsInFlight = useMemo(
    () => queue.filter((item) => item.status === 'uploading' || item.status === 'queued'),
    [queue],
  );
  const uploading = uploadsInFlight.length > 0;

  return (
    <div className="product-gallery-manager">
      {/* Upload dropzone + queue */}
      <div
        className="image-upload image-upload--dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          id="product-image-files"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          className="image-upload__input"
          onChange={(event) => handleFiles(event.target.files)}
        />
        <label htmlFor="product-image-files" className="image-upload__label">
          <strong>{t('products.gallery.uploadLabel')}</strong>
          <span>{t('products.gallery.uploadHint')}</span>
        </label>
      </div>

      {queue.length > 0 ? (
        <ul className="upload-queue" aria-label={t('products.gallery.uploadQueue')}>
          {queue.map((item) => (
            <li key={item.id} className={`upload-queue__item upload-queue__item--${item.status}`}>
              <span className="upload-queue__name">{item.file.name}</span>
              {item.status === 'done' ? (
                <span className="upload-queue__status">{t('common.done')}</span>
              ) : item.status === 'error' ? (
                <span className="upload-queue__error" role="alert">
                  {item.error ?? t('products.gallery.uploadFailed')}
                </span>
              ) : (
                <span className="upload-queue__status">{t('products.gallery.uploading')}</span>
              )}
              {item.status === 'uploading' || item.status === 'queued' ? (
                <span className="upload-queue__progress">
                  <span style={{ width: `${item.progress}%` }} />
                </span>
              ) : null}
              <span className="upload-queue__actions">
                {item.status === 'error' ? (
                  <Button variant="outline" size="sm" onClick={() => retryUpload(item.id)}>
                    {t('common.retry')}
                  </Button>
                ) : null}
                {item.status === 'error' || item.status === 'done' ? (
                  <Button variant="ghost" size="sm" onClick={() => dismissUpload(item.id)}>
                    {t('common.dismiss')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingBlock label={t('products.gallery.loading')} />
      ) : items.length === 0 && !uploading ? (
        <p className="card__muted">{t('products.gallery.empty')}</p>
      ) : (
        <div className="product-gallery">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`product-gallery__item${item.isPrimary ? ' product-gallery__item--primary' : ''}`}
            >
              <DashboardMediaImage
                mediaId={item.mediaId}
                alt={item.altText ?? t('products.gallery.imageAlt')}
                className="product-gallery__thumb"
              />
              {item.isPrimary ? (
                <span className="product-gallery__badge">{t('products.gallery.primary')}</span>
              ) : null}
              <div className="product-gallery__controls">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('products.gallery.moveUpAria')}
                  disabled={busy !== null || index === 0}
                  onClick={() => void move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('products.gallery.moveDownAria')}
                  disabled={busy !== null || index === items.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </Button>
                {!item.isPrimary ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void setPrimary(item.mediaId)}
                  >
                    {t('products.gallery.setPrimary')}
                  </Button>
                ) : null}
              </div>
              <label className="product-gallery__variant">
                <span>{t('products.gallery.variantLabel')}</span>
                <select
                  className="input input--select"
                  aria-label={t('products.gallery.variantLabel')}
                  value={item.variantId ?? ''}
                  disabled={busy !== null}
                  onChange={(event) => void attachVariant(item.mediaId, event.target.value)}
                >
                  <option value="">{t('products.gallery.variantNone')}</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="product-gallery__remove"
                aria-label={t('products.details.removeImageAria')}
                disabled={busy !== null}
                onClick={() => void remove(item.mediaId)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {page < totalPages ? (
        <div className="form-actions">
          <Button
            variant="outline"
            onClick={() => {
              setLoadingMore(true);
              void loadPage(page + 1, true);
            }}
            loading={loadingMore}
          >
            {t('products.gallery.loadMore', { remaining: total - items.length })}
          </Button>
        </div>
      ) : null}

      <p className="card__muted">
        {t('products.gallery.count', { count: total })}
        {page > 1 ? ` · ${t('common.pageOf', { page, pages: totalPages })}` : ''}
      </p>
    </div>
  );
}
