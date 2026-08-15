/**
 * Per-order lookup token persistence (Phase 23 — public order confirmation
 * security).
 *
 * The lookup token is returned by the checkout / WhatsApp order responses and
 * is REQUIRED to read the order's customer details (email/phone/address) on
 * the public confirmation page. It is stored in `sessionStorage` keyed by the
 * order id — the same browser session that placed the order — and is never
 * placed in the URL, never sent to the payment provider, and never logged.
 *
 * If the token is missing (e.g. the customer opened a shared order link in a
 * fresh browser), the confirmation page renders the PII-free view returned by
 * the API instead of failing.
 */

const STORAGE_PREFIX = 'ziad.order-lookup-token.';

export function saveOrderLookupToken(orderId: string, token: string | null): void {
  if (!token) {
    return;
  }
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${orderId}`, token);
  } catch {
    // storage unavailable (private mode / blocked) — the page still renders
    // the PII-free order view.
  }
}

export function getOrderLookupToken(orderId: string): string | null {
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
  } catch {
    return null;
  }
}

export function clearOrderLookupToken(orderId: string): void {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${orderId}`);
  } catch {
    // ignore
  }
}
