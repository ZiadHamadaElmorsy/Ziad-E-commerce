import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/** Text input styled by the design system. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('input', className)} {...props} />;
  },
);

/** Textarea styled by the design system. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('input', 'input--textarea', className)} {...props} />;
});

/** Select styled by the design system. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn('input', 'input--select', className)} {...props}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** Form field wrapper: label + hint + control + validation error. */
export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : ''}
      </label>
      {children}
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}
