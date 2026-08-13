import { cn } from '@/lib/utils';

/** Shimmer placeholder used for loading states (skeleton rows/cards). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton', className)} />;
}

/**
 * Skeleton table rows for list loading states. Renders `rows` rows with
 * `columns` cells each (plus an optional trailing actions cell).
 */
export function TableSkeleton({
  rows = 4,
  columns = 4,
  actions = true,
  className,
}: {
  rows?: number;
  columns?: number;
  actions?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('skeleton-table', className)} role="status" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-table__row" key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton key={columnIndex} className="skeleton-table__cell" />
          ))}
          {actions ? (
            <Skeleton className="skeleton-table__cell skeleton-table__cell--actions" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
