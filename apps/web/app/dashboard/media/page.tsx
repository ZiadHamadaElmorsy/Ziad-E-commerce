'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { mediaApi } from '@/lib/api/media';
import type { MediaView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { DashboardMediaImage } from '@/components/dashboard/DashboardMediaImage';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { formatDate } from '@/lib/utils';

const PAGE_SIZE = 12;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media management (docs/API-SPEC.md §29).
 *
 * Phase 25 adds a REAL paginated media library (GET /api/v1/media): previously
 * uploaded assets are listed server-side (newest first) with thumbnails
 * (lazy-loaded via the authenticated content endpoint) and per-asset delete.
 * Upload remains a direct server upload; after a successful upload or delete
 * the library refreshes in place.
 */
export default function MediaPage() {
  const { t } = useI18n();
  const toast = useToast();

  // --- Upload form ---------------------------------------------------------
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const previewObjectUrl = useRef<string | null>(null);

  // --- Library -------------------------------------------------------------
  const [items, setItems] = useState<MediaView[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLibrary = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mediaApi.listMedia({ page: targetPage, limit: PAGE_SIZE });
        setItems(result.data);
        setTotalPages(result.meta.totalPages);
        setTotal(result.meta.total);
      } catch (caught) {
        setError(apiErrorMessage(caught, t, 'media.libraryLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLibrary(page);
  }, [loadLibrary, page]);

  const handleFileChange = (next: File | null) => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
    }
    setFile(next);
    setUploadError(null);
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await mediaApi.upload(file, altText || undefined);
      toast.success(t('media.uploadedToast'));
      setFile(null);
      setAltText('');
      // Show the newest asset: jump to page 1 of the library.
      if (page !== 1) setPage(1);
      else void loadLibrary(1);
    } catch (caught) {
      setUploadError(apiErrorMessage(caught, t, 'media.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mediaApi.deleteMedia(deleteTarget.id);
      toast.success(t('media.deletedToast'));
      setDeleteTarget(null);
      // If the last item on this page was removed, step back a page.
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        void loadLibrary(page);
      }
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'media.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('media.title')} description={t('media.desc')} />

      {uploadError ? (
        <div className="alert alert--error" role="alert">
          {uploadError}
        </div>
      ) : null}


      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card title={t('media.upload')}>
            <form onSubmit={handleUpload}>
              <div className="form-grid">
                <Field label={t('media.chooseFile')} htmlFor="media-file" required>
                  <Input
                    id="media-file"
                    type="file"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  />
                </Field>
                <Field label={t('media.altText')} htmlFor="media-alt" hint={t('media.altTextHint')}>
                  <Input
                    id="media-alt"
                    value={altText}
                    onChange={(event) => setAltText(event.target.value)}
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button type="submit" disabled={!file} loading={uploading}>
                  {uploading ? t('media.uploading') : t('media.upload')}
                </Button>
              </div>
            </form>
          </Card>

          <Card title={t('media.libraryTitle')} description={t('media.libraryDesc')}>
            {error ? (
              <ErrorState message={error} onRetry={() => void loadLibrary(page)} />
            ) : loading ? (
              <div className="media-grid" aria-busy="true">
                {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                  <div className="media-card media-card--skeleton" key={index} aria-hidden="true">
                    <span className="skeleton skeleton--block" />
                    <span className="skeleton skeleton--line" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon="◧"
                title={t('media.libraryEmpty')}
                description={t('media.libraryEmptyDesc')}
              />
            ) : (
              <>
                <div className="media-grid">
                  {items.map((media) => (
                    <div className="media-card" key={media.id}>
                      <div className="media-card__thumb">
                        {media.mediaType === 'IMAGE' ? (
                          <DashboardMediaImage mediaId={media.id} alt={media.altText} />
                        ) : (
                          <div className="media-thumb media-thumb--placeholder" aria-hidden="true">
                            {media.mediaType === 'VIDEO' ? '▶' : '▤'}
                          </div>
                        )}
                      </div>
                      <div className="media-card__body">
                        <div className="media-card__meta">
                          <StatusBadge status={media.mediaType} />
                          <span className="media-card__size">{formatBytes(media.sizeBytes)}</span>
                        </div>
                        <p className="media-card__alt" title={media.altText ?? undefined}>
                          {media.altText ?? '—'}
                        </p>
                        <p className="media-card__date">
                          {t('media.date')}: {formatDate(media.createdAt)}
                        </p>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(media)}
                        >
                          {t('media.delete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  onPageChange={(next) => setPage(next)}
                />
              </>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('media.deleteConfirmTitle')}
        description={t('media.deleteConfirmDesc')}
        confirmLabel={t('media.delete')}
        loading={deleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
