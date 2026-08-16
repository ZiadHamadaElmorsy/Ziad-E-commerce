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
/**
 * Canonical production origin of the web app. Used ONLY as the centralized
 * production fallback for authentication redirect URLs when
 * NEXT_PUBLIC_APP_URL is not set at build time (e.g. the env var has not been
 * added to a fresh Vercel environment yet). It lives here — never in
 * individual pages — so there is a single source of truth for "where the app
 * lives".
 */
export const PRODUCTION_APP_URL = 'https://ziad-e-commerce-web-sigma.vercel.app';

export const appConfig = {
  name: 'Ziad E-commerce',
  apiUrl:
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000/api/v1'),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Public storefront platform domain (mirrors the API STOREFRONT_DOMAIN). */
  storefrontDomain: process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN ?? 'platform-domain.com',
  /**
   * Canonical public origin of the web app. Single source of truth for
   * authentication redirect URLs (e.g. the email-confirmation link), so the
   * production confirmation flow can never point at localhost.
   *
   *   - Local development: http://localhost:3000
   *   - Production:        https://ziad-e-commerce-web-sigma.vercel.app
   *
   * NEXT_PUBLIC_APP_URL is inlined at build time and takes precedence; the
   * environment-aware fallback keeps production correct even before the
   * variable is added to a fresh deployment environment.
   */
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : 'http://localhost:3000'),
  /**
   * Public support phone number shown on the authentication screens. Public by
   * design (a support line is not a secret). The default is a clearly fake
   * placeholder until the merchant supplies the real number.
   */
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? '+20 100 000 0000',
} as const;

export const isSupabaseConfigured = (): boolean =>
  appConfig.supabaseUrl.length > 0 && appConfig.supabaseAnonKey.length > 0;

export const isApiConfigured = (): boolean =>
  appConfig.apiUrl.length > 0 && /^https:\/\//.test(appConfig.apiUrl);

/**
 * Path the browser lands on after the Supabase email-confirmation redirect.
 *
 * This is an EXISTING route (the login page mounts AuthProvider and the
 * Supabase client detects the PKCE `code` in the URL via
 * `detectSessionInUrl: true`, exchanges it, and the login page routes the
 * now-authenticated merchant to their home). It is deliberately not a new
 * `/auth/callback` route — there is no server-side exchange in this app.
 */
export const authCallbackPath = '/login' as const;

/**
 * Absolute email-confirmation redirect URL passed as `options.emailRedirectTo`
 * to `supabase.auth.signUp`. Environment-aware: it always uses the build-time
 * canonical app URL, so production confirmation emails point at the production
 * origin and local development keeps pointing at localhost.
 */
export const emailConfirmationRedirectUrl = (): string =>
  `${appConfig.appUrl}${authCallbackPath}`;

/**
 * Builds the `tel:` href for the support phone. Returns null when the
 * configured value is still a placeholder (no usable digits — e.g.
 * `+20XXXXXXX`), in which case the phone renders as plain text.
 */
export function supportPhoneHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const prefix = phone.trim().startsWith('+') ? '+' : '';
  return `tel:${prefix}${digits}`;
}
