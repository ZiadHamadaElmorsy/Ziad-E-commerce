/**
 * Storefront host-based routing (Phase 21 — production storefront domains).
 *
 * The production storefront URL strategy is `https://{storeSlug}.{STOREFRONT_DOMAIN}`.
 * This pure helper derives the storefront slug for a request Host header so
 * the Next.js middleware can rewrite `slug.yourdomain.com/*` to
 * `/store/slug/*` (the browser URL is preserved via `NextResponse.rewrite`).
 *
 * The authoritative store resolution stays server-side on the API
 * (StorefrontStoreResolver + `X-Storefront-Slug`); this function only routes
 * the web app. Rules mirror `apps/api/src/storefront/domain/storefront-host.ts`:
 * root domain / www / localhost / foreign hosts are never storefronts.
 */

/** Store slug label pattern (mirrors the Store slug rules: lowercase a-z, 0-9, hyphens). */
const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Returns the storefront slug for a Host header, or null when it is not one. */
export function storefrontSlugForHost(
  host: string | null,
  platformDomain: string,
): string | null {
  if (!host) {
    return null;
  }

  const domain = normalizeDomain(platformDomain);
  if (!domain) {
    return null;
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (hostname === domain || hostname === `www.${domain}`) {
    return null;
  }

  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) {
    return null;
  }

  return STORE_SLUG_PATTERN.test(slug) ? slug : null;
}

/** Normalizes a platform domain: strips scheme/port/trailing dot, lowercases. */
function normalizeDomain(platformDomain: string): string | null {
  let raw = platformDomain.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  raw = raw.replace(/^[a-z]+:\/\//, '');
  try {
    return new URL(`http://${raw}`).hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
}
