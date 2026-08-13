'use client';

import { useEffect, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';
import { Spinner } from './Spinner';

/**
 * Accessible modal dialog. Renders through a portal-like overlay inside the
 * component tree and locks body scroll while open.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-width={width}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{title}</h2>
            {description ? <p className="modal__description">{description}</p> : null}
          </div>
          <button
            type="button"
            className="modal__close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Inline loading block with a spinner. */
export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loading-block" role="status">
      <Spinner />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export { Button };
