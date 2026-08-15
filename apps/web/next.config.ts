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

/**
 * Production build-time environment validation.
 *
 * NEXT_PUBLIC_* values are INLINED into the browser bundle during `next build`.
 * If a required variable is missing at build time, Supabase receives an empty
 * URL and the browser throws "supabaseUrl is required", while a missing
 * NEXT_PUBLIC_API_URL silently falls back to localhost — both were observed in
 * the Vercel Production deployment (2026-08).
 *
 * This check FAILS the production build so a broken bundle can never ship
 * again, and logs ONLY booleans (never secrets, never the actual values).
 *
 * `next build` sets NODE_ENV=production before loading this file, so this runs
 * on every production build (Vercel included). `next dev` (NODE_ENV=development)
 * is intentionally not blocked so local development without env files works.
 */
if (process.env.NODE_ENV === 'production') {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

  // SAFE diagnostic — booleans only. Appears in the Vercel build log.
  console.log('[env:check] NEXT_PUBLIC_SUPABASE_URL present:', supabaseUrl.length > 0);
  console.log('[env:check] NEXT_PUBLIC_SUPABASE_ANON_KEY present:', supabaseAnonKey.length > 0);
  console.log('[env:check] NEXT_PUBLIC_API_URL present:', apiUrl.length > 0);

  const missing: string[] = [];
  if (supabaseUrl.length === 0) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (supabaseAnonKey.length === 0) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (apiUrl.length === 0) missing.push('NEXT_PUBLIC_API_URL');

  // Placeholder-shaped values (from .env.example) are treated as missing.
  // NOTE: real Supabase project URLs legitimately end in .supabase.co, so the
  // URL check targets the .env.example placeholder string only.
  const urlPlaceholder = supabaseUrl === 'https://YOUR-PROJECT.supabase.co';
  const anonPlaceholder = /YOUR-ANON-KEY|REPLACE/i.test(supabaseAnonKey);
  const apiPlaceholder = /YOUR-|REPLACE|example\.com/i.test(apiUrl);

  if (missing.length > 0) {
    throw new Error(
      `[env:check] Production build FAILED: missing NEXT_PUBLIC_* environment variables: ` +
        `${missing.join(', ')}. These are inlined into the browser bundle at build time; ` +
        `without them Supabase throws "supabaseUrl is required" at runtime. Add them to the ` +
        `Vercel Production environment (Project -> Settings -> Environment Variables, apply to ` +
        `Production) and trigger a NEW production deployment.`,
    );
  }
  if (urlPlaceholder || anonPlaceholder || apiPlaceholder) {
    throw new Error(
      `[env:check] Production build FAILED: a NEXT_PUBLIC_* variable still holds a placeholder ` +
        `value (e.g. YOUR-PROJECT.supabase.co / YOUR-ANON-KEY / example.com). Replace it with ` +
        `the real value.`,
    );
  }
  if (!/^https:\/\//.test(apiUrl)) {
    throw new Error(
      `[env:check] Production build FAILED: NEXT_PUBLIC_API_URL must be an https:// URL ` +
        `(production web must never talk to http://localhost).`,
    );
  }
  if (!/\/api\/v1$/.test(apiUrl)) {
    throw new Error(
      `[env:check] Production build FAILED: NEXT_PUBLIC_API_URL must end with /api/v1 — the ` +
        `NestJS API only serves under the api/v1 global prefix (verified: ` +
        `https://ziad-e-commerce-api.onrender.com/api/v1/health/ready returns 200 while ` +
        `https://ziad-e-commerce-api.onrender.com/health/ready returns 404). ` +
        `Current value: ${apiUrl.replace(/^https:\/\/[^/]+/, 'https://<host>')}`,
    );
  }
  console.log('[env:check] Production build environment validated OK.');
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
