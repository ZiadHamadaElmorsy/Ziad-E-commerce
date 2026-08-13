import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/**
 * Base button. Variants map to the design system's `.btn--*` styles:
 * primary (solid), secondary (neutral), danger (destructive), ghost,
 * outline.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn('btn', `btn--${variant}`, `btn--${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      <span>{children}</span>
    </button>
  );
});
