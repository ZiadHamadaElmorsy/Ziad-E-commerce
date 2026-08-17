'use client';

import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';

/**
 * Responsive filter toolbar (Phase 27).
 *
 * On desktop the search field and the filter controls render in one row. On
 * small screens the non-search controls collapse behind a "Filters" toggle
 * (full-width drawer) instead of squeezing several selects into a 320px row.
 * Search state, pagination and server-side filtering are untouched — this is
 * purely presentational.
 */
export function FilterBar({
  search,
  children,
  activeCount = 0,
  onClear,
}: {
  /** Optional full-width search input (stays visible on every breakpoint). */
  search?: ReactNode;
  /** Filter controls (status/category selects, etc.). */
  children: ReactNode;
  /** Number of active filters shown in the toggle label, e.g. 2 → "Filters (2)". */
  activeCount?: number;
  /** When provided, a "Clear filters" action is rendered (desktop inline). */
  onClear?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const clear = onClear ? (
    <Button variant="ghost" onClick={onClear}>
      {t('common.clearFilters')}
    </Button>
  ) : null;

  return (
    <div className="filters">
      {search ? <div className="filters__search">{search}</div> : null}

      <div className="filter-drawer" data-open={open ? 'true' : undefined}>
        <button
          type="button"
          className="filter-drawer__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {t('common.filters')}
          {activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        <div className="filter-drawer__panel">
          {children}
          {clear}
        </div>
      </div>
    </div>
  );
}
