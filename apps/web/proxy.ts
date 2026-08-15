import { NextRequest, NextResponse } from 'next/server';
import { storefrontSlugForHost } from '@/lib/storefront/host';

/** Public storefront platform domain (mirrors the API's STOREFRONT_DOMAIN). */
const STOREFRONT_DOMAIN = process.env.STOREFRONT_DOMAIN ?? 'platform-domain.com';

/**
 * Storefront host proxy (Phase 21 — production storefront domains).
 *
 * Rewrites `{storeSlug}.{STOREFRONT_DOMAIN}/*` to `/store/{storeSlug}/*` so the
 * storefront renders under the merchant's own domain while the browser URL is
 * preserved (`NextResponse.rewrite`, never a redirect).
 *
 * Routing only — tenant resolution stays server-side on the API:
 *   - The storefront client sends `X-Storefront-Slug` to the API, which
 *     resolves the Store via the existing StorefrontStoreResolver.
 *   - Unknown store slugs fail closed with the storefront 404 (same as the
 *     `/store/[slug]` path).
 *
 * Safe by construction:
 *   - Root domain / www alias / localhost / foreign hosts are never rewritten.
 *   - `/store/[slug]` development paths and the marketing site are untouched.
 *   - `_next` static assets and the API host are excluded from the matcher.
 */
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  const slug = storefrontSlugForHost(host, STOREFRONT_DOMAIN);
  if (!slug) {
    return NextResponse.next();
  }

  // The storefront's internal links are `/store/{slug}/...`. On a wildcard
  // subdomain those links resolve on the same host, so strip an existing
  // `/store/{slug}` prefix to avoid double-nesting.
  let pathname = request.nextUrl.pathname;
  const existingPrefix = `/store/${slug}`;
  if (pathname === existingPrefix) {
    pathname = '/';
  } else if (pathname.startsWith(`${existingPrefix}/`)) {
    pathname = pathname.slice(existingPrefix.length);
  }
  if (pathname === '/') {
    pathname = '';
  }

  const url = request.nextUrl.clone();
  url.pathname = `/store/${slug}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Exclude Next.js internals, static assets, and the API (served separately).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
