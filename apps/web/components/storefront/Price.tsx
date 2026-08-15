'use client';

import { useStorefront } from '@/lib/storefront/storefront-context';
import { formatMoney } from '@/lib/storefront/format';

/** Renders a money amount in the store's currency (integer minor units). */
export function Price({ value }: { value: number | null | undefined }) {
  const { store } = useStorefront();
  return <span>{formatMoney(value, store?.currency ?? 'EGP')}</span>;
}
