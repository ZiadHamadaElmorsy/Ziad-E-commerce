/**
 * Typed access to frontend environment configuration.
 *
 * NEXT_PUBLIC_* variables are inlined at build time by Next.js and are safe
 * for the browser bundle. They must never contain secrets (the Supabase anon
 * key is public by design).
 *
 * IMPORTANT (production):
 *   - next.config.ts FAILS the production build when the required
 *     NEXT_PUBLIC_* variables are missing or malformed, so a broken bundle
 *     (empty supabaseUrl / localhost API URL) can never be deployed again.
 *   - The localhost API fallback is deliberately DEVELOPMENT-ONLY. In a
 *     production build a missing NEXT_PUBLIC_API_URL yields an EMPTY string so
 *     misconfiguration is loud (build failure + clear runtime error) instead
 *     of silently calling the developer's machine.
 */
export const appConfig = {
  name: 'Ziad E-commerce',
  apiUrl:
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000/api/v1'),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Public storefront platform domain (mirrors the API STOREFRONT_DOMAIN). */
  storefrontDomain: process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN ?? 'platform-domain.com',
} as const;

export const isSupabaseConfigured = (): boolean =>
  appConfig.supabaseUrl.length > 0 && appConfig.supabaseAnonKey.length > 0;

export const isApiConfigured = (): boolean =>
  appConfig.apiUrl.length > 0 && /^https:\/\//.test(appConfig.apiUrl);
