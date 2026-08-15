/**
 * Guest cart token persistence (Phase 19).
 *
 * The storefront cart is a GUEST cart (docs/DOMAIN-MODEL.md §10.1): the
 * backend creates an opaque `guestToken` on first add-to-cart and every cart
 * operation sends it back via the `X-Guest-Token` header. The token is
 * persisted per store slug in localStorage so the customer's cart survives
 * reloads and page navigation. The token is opaque (server-generated) and only
 * selects a cart INSIDE the resolved store.
 */

const TOKEN_PREFIX = 'ziad.guest.';

export function guestTokenKey(slug: string): string {
  return `${TOKEN_PREFIX}${slug}`;
}

export function getGuestToken(slug: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(guestTokenKey(slug));
    return value && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function setGuestToken(slug: string, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(guestTokenKey(slug), token);
  } catch {
    // localStorage unavailable (private mode / storage disabled) — the cart
    // still works for the current session but is not persisted across reloads.
  }
}

export function clearGuestToken(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(guestTokenKey(slug));
  } catch {
    // ignore
  }
}
