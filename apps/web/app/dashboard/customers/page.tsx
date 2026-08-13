'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { customersApi } from '@/lib/api/customers';
import type { CustomerView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormControls';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { apiErrorMessage } from '@/lib/i18n/api-error';

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [customers, setCustomers] = useState<CustomerView[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get('search') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchDraft, setSearchDraft] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersApi.listCustomers({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      setCustomers(result.data);
      setTotalPages(result.meta.totalPages);
      setTotal(result.meta.total);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'customers.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const updateQuery = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.replace(`/dashboard/customers${params.size > 0 ? `?${params.toString()}` : ''}`);
    },
    [router, searchParams],
  );

  const onSearchChange = (value: string) => {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      updateQuery({ search: value, page: '' });
    }, 400);
  };

  const displayName = (customer: CustomerView) =>
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—';

  return (
    <div className="page">
      <PageHeader
        title={t('customers.title')}
        description={
          total === 1
            ? t('customers.countOne', { count: total })
            : t('customers.countMany', { count: total })
        }
      />

      <Card>
        <div className="filters">
          <div className="filters__search">
            <Input
              aria-label={t('customers.searchPlaceholder')}
              placeholder={t('customers.searchPlaceholder')}
              value={searchDraft}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          {search && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchDraft('');
                router.replace('/dashboard/customers');
              }}
            >
              {t('common.clearFilters')}
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : loading ? (
          <TableSkeleton rows={10} columns={4} />
        ) : customers.length === 0 ? (
          <EmptyState
            icon="☺"
            title={search ? t('customers.emptyFiltered') : t('customers.emptyTitle')}
            description={search ? t('customers.emptyFilteredDesc') : t('customers.emptyDesc')}
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('customers.table.name')}</th>
                  <th>{t('customers.table.email')}</th>
                  <th>{t('customers.table.phone')}</th>
                  <th className="table__actions-head">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link href={`/dashboard/customers/${customer.id}`} className="link">
                        {displayName(customer)}
                      </Link>
                    </td>
                    <td>{customer.email ?? '—'}</td>
                    <td>{customer.phone ?? '—'}</td>
                    <td>
                      <div className="table__actions">
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="btn btn--outline btn--sm"
                        >
                          {t('customers.view')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={(next) => updateQuery({ page: String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
