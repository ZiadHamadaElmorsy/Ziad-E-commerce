'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';
import { Spinner } from './Spinner';

/**
 * Accessible modal dialog. Renders through a portal-like overlay inside the
 * component tree, locks body scroll while open, closes on Escape, and manages
 * focus (moves it into the dialog on open and restores it on close).
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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    // Focus the dialog so keyboard/screen-reader users land inside it.
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
      previouslyFocusedRef.current?.focus?.();
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
            ref={closeButtonRef}
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
