/**
 * Storefront money formatting (Phase 19).
 *
 * The backend renders money as integer minor units (EGP piastres). This helper
 * converts to the store's ISO 4217 currency for display. The storefront treats
 * ALL currencies as 2-decimal minor units (the platform currency is EGP today;
 * the helper is currency-aware for the merchant-configured store currency).
 */
export function formatMoney(piastres: number | null | undefined, currency = 'EGP'): string {
  if (piastres === null || piastres === undefined) {
    return '—';
  }
  const major = piastres / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}
