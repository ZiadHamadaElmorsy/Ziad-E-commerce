import type { NextConfig } from 'next';

/**
 * Phase 23 — deployment security headers for every web response. HSTS is only
 * sent when the deployment explicitly enables it on HTTPS production
 * (SECURITY_HSTS_ENABLED=true); it must never be sent over plain HTTP.
 */
const hstsEnabled =
  process.env.NODE_ENV === 'production' && process.env.SECURITY_HSTS_ENABLED === 'true';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // Deliberately NO restrictive Content-Security-Policy here: the storefront
  // renders the provider-hosted Paymob Unified Checkout in an iframe and talks
  // to Supabase; a strict CSP would break both. (Phase 23 requirement — do not
  // add unsafe overly-restrictive headers.)
];

if (hstsEnabled) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
