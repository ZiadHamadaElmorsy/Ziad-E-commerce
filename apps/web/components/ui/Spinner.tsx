import { cn } from '@/lib/utils';

/** Inline spinner used inside buttons and loading states. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('spinner', className)} />;
}
