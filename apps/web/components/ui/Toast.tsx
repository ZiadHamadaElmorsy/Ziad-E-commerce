'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_ICONS: Record<ToastTone, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

/** Toast notifications (success / error / info), stacked top-right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (message: string) => push('success', message),
        error: (message: string) => push('error', message),
        info: (message: string) => push('info', message),
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn('toast', `toast--${toast.tone}`)}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="toast__icon" aria-hidden="true">
              {TOAST_ICONS[toast.tone]}
            </span>
            <span className="toast__message">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue['toast'] {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return context.toast;
}

/** Convenience wrapper for extracting an actionable message from an error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
