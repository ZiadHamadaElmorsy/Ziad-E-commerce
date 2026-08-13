'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { mediaApi } from '@/lib/api/media';
import type { MediaView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media management (docs/API-SPEC.md §29).
 *
 * The backend exposes upload (raw binary), read (metadata) and delete. There
 * is NO list endpoint, so this page supports the real upload/read/delete flow
 * and clearly states that previously uploaded assets cannot be listed yet.
 * The preview uses the file the merchant just selected (browser object URL) —
 * no fake media data is ever shown.
 */
export default function MediaPage() {
  const { t } = useI18n();
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [uploaded, setUploaded] = useState<MediaView | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const previewObjectUrl = useRef<string | null>(null);

  const handleFileChange = (next: File | null) => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
    }
    setFile(next);
    setPreviewUrl(null);
    setUploaded(null);
    setUploadError(null);
    if (next) {
      previewObjectUrl.current = URL.createObjectURL(next);
      setPreviewUrl(previewObjectUrl.current);
    }
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await mediaApi.upload(file, altText || undefined);
      setUploaded(result.data);
      toast.success(t('media.uploadedToast'));
    } catch (caught) {
      setUploadError(apiErrorMessage(caught, t, 'media.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const runDelete = async () => {
    if (!uploaded) return;
    setDeleting(true);
    try {
      await mediaApi.deleteMedia(uploaded.id);
      toast.success(t('media.deletedToast'));
      setDeleteOpen(false);
      handleFileChange(null);
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'media.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const isImage = uploaded?.mediaType === 'IMAGE';

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

            <p className="card__muted note">{t('media.libraryNote')}</p>
          </Card>

          {uploaded ? (
            <Card title={t('media.uploadedTitle')}>
              <div className="media-preview">
                {isImage && previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={uploaded.altText ?? 'Uploaded asset'}
                    className="media-preview__image"
                  />
                ) : (
                  <div className="media-preview__fallback" aria-hidden="true">
                    {uploaded.mediaType === 'VIDEO' ? '▶' : '▤'}
                  </div>
                )}

                <dl className="meta-list">
                  <div>
                    <dt>{t('media.type')}</dt>
                    <dd>
                      <StatusBadge status={uploaded.mediaType} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t('media.mimeType')}</dt>
                    <dd>{uploaded.mimeType ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('media.size')}</dt>
                    <dd>{formatBytes(uploaded.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>{t('media.altTextValue')}</dt>
                    <dd>{uploaded.altText ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('media.id')}</dt>
                    <dd className="meta-list__mono">{uploaded.id}</dd>
                  </div>
                </dl>

                {!isImage ? <p className="card__muted">{t('media.notPreviewable')}</p> : null}

                <div className="form-actions">
                  <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                    {t('media.delete')}
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="empty-state">
                <div className="empty-state__icon" aria-hidden="true">
                  ◧
                </div>
                <h3 className="empty-state__title">{t('media.emptyTitle')}</h3>
                <p className="empty-state__description">{t('media.emptyDesc')}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={t('media.deleteConfirmTitle')}
        description={t('media.deleteConfirmDesc')}
        confirmLabel={t('media.delete')}
        loading={deleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
