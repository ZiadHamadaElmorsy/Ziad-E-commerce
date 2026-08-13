'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from './Button';

/**
 * Reusable pagination bar (page info + previous/next buttons).
 * `page` is 1-based; pass `onPageChange` to update the query state.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  infoExtra,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  infoExtra?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="pagination">
      <span className="pagination__info">
        {t('common.pageOf', { page, pages: Math.max(totalPages, 1), total })}
        {infoExtra ? ` · ${infoExtra}` : ''}
      </span>
      <div className="pagination__buttons">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('common.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
