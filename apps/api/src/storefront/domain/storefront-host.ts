/**
 * Storefront host-to-slug resolution (Phase 21 — production storefront
 * domains, docs/DATABASE.md §7.2).
 *
 * The production storefront URL strategy is:
 *
 *   https://{storeSlug}.{STOREFRONT_DOMAIN}        e.g. ziad-fashion.yourdomain.com
 *
 * This module extracts the storefront slug from a request Host header for the
 * configured platform domain. It is a PURE function with no I/O so it is
 * exhaustively unit-testable and safe to use in the resolver and (mirrored)
 * in the web middleware.
 *
 * Safety rules:
 *   - The root domain (`yourdomain.com`) and `www` alias are NOT storefronts.
 *   - A subdomain slug must be a single label (no dots) and match the store
 *     slug pattern, so `a.b.yourdomain.com` never resolves to store `a.b`.
 *   - Host headers are parsed with the WHATWG URL parser (port / IPv6
 *     brackets / whitespace handled safely); malformed hosts fail closed.
 *   - Everything is lowercased; IDN hosts must already be punycode (browsers
 *     send punycode in the Host header).
 *   - Unknown/foreign hosts return undefined -> the caller fails closed with
 *     404 (no existence leak).
 */

/** Store slug label pattern (mirrors the Store slug rules: lowercase a-z, 0-9, hyphens). */
const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Extracts the storefront slug from a Host header, or undefined when the host
 * is not a storefront subdomain of `platformDomain`.
 *
 * @param host           the raw `Host` header (may include a port)
 * @param platformDomain the configured STOREFRONT_DOMAIN (may include scheme/port)
 */
export function storefrontSlugFromHost(
  host: string | undefined,
  platformDomain: string,
): string | undefined {
  if (!host || typeof host !== 'string' || host.trim().length === 0) {
    return undefined;
  }

  const domain = normalizeDomain(platformDomain);
  if (!domain) {
    return undefined;
  }

  let hostname: string;
  try {
    // `new URL` parses host:port, IPv6 brackets and rejects malformed hosts.
    const url = new URL(`http://${host.trim()}`);
    hostname = url.hostname.toLowerCase();
  } catch {
    return undefined;
  }

  // Never treat the root domain or its www alias as a store.
  if (hostname === domain || hostname === `www.${domain}`) {
    return undefined;
  }

  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) {
    return undefined;
  }

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) {
    return undefined;
  }
  return STORE_SLUG_PATTERN.test(slug) ? slug : undefined;
}

/** Normalizes a configured platform domain: lowercases, strips scheme/port/trailing dot. */
function normalizeDomain(platformDomain: string): string | undefined {
  let raw = platformDomain.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  raw = raw.replace(/^[a-z]+:\/\//, '');
  try {
    return new URL(`http://${raw}`).hostname.replace(/\.$/, '');
  } catch {
    return undefined;
  }
}
