/**
 * Rate limiting buckets (Phase 21 — production hardening).
 *
 * The middleware classifies each request into exactly one bucket from its
 * path. Different buckets carry different limits so sensitive surfaces
 * (checkout, payment creation, auth) are throttled harder than normal public
 * reads (storefront browsing, media). Values are configurable through
 * environment variables (see configuration.ts `rateLimit`).
 */

export type RateLimitBucket =
  | 'auth'
  | 'storefront-read'
  | 'cart'
  | 'checkout'
  | 'payment'
  | 'order-lookup'
  | 'media'
  | 'webhook'
  | 'merchant-api';

/** A bucket that is exempt from rate limiting (liveness probes must never 429). */
export const EXEMPT_BUCKET = 'health' as const;

/** Resolves the rate-limit bucket for a request path (URL path only, no query). */
export function bucketForPath(path: string): RateLimitBucket | typeof EXEMPT_BUCKET {
  const url = path.split('?')[0];
  const segments = url.split('/').filter(Boolean);

  // The API global prefix is `/api/v1`; strip it defensively when present.
  if (segments[0] === 'api' && segments[1] === 'v1') {
    segments.splice(0, 2);
  }

  const [resource, first, second, third] = segments;

  if (resource === undefined) {
    return 'merchant-api';
  }

  switch (resource) {
    case 'health':
      return EXEMPT_BUCKET;
    case 'webhooks':
      return 'webhook';
    case 'auth':
    case 'onboarding':
      return 'auth';
    case 'checkout':
      return 'checkout';
    case 'orders':
      return second === 'payments' || third === 'payments' ? 'payment' : 'order-lookup';
    case 'storefront':
      if (first === undefined) {
        return 'storefront-read';
      }
      if (first === 'cart') {
        return 'cart';
      }
      if (first === 'checkout') {
        return 'checkout';
      }
      if (first === 'media') {
        return 'media';
      }
      if (first === 'orders') {
        return second === 'payments' || third === 'payments' ? 'payment' : 'order-lookup';
      }
      // products / categories / pages / theme / navigation -> public read.
      return 'storefront-read';
    default:
      return 'merchant-api';
  }
}
