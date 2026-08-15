/**
 * Typed access to frontend environment configuration.
 *
 * NEXT_PUBLIC_* variables are inlined at build time by Next.js and are safe
 * for the browser bundle. They must never contain secrets (the Supabase anon
 * key is public by design).
 */
export const appConfig = {
  name: 'Ziad E-commerce',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Public storefront platform domain (mirrors the API STOREFRONT_DOMAIN). */
  storefrontDomain: process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN ?? 'platform-domain.com',
} as const;

export const isSupabaseConfigured = (): boolean =>
  appConfig.supabaseUrl.length > 0 && appConfig.supabaseAnonKey.length > 0;
