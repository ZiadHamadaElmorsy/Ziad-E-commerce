'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Confirmation dialog for destructive actions (archive, unpublish, remove…).
 * Always shown before the actual API call is fired.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    />
  );
}
