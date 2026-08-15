import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { appConfig, isSupabaseConfigured } from '@/lib/config';

/**
 * Supabase browser client used for the real authentication flow.
 *
 * - persistSession + autoRefreshToken keep the merchant signed in and keep
 *   the access token fresh (Supabase handles token refresh automatically).
 * - The access token is read from this client's session and attached to every
 *   backend API request (see lib/api/client.ts). It is NEVER rendered in the
 *   UI.
 *
 * Misconfiguration guard: NEXT_PUBLIC_* values are embedded at BUILD time. If
 * the deployment was compiled without NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, createClient() would receive empty strings
 * and throw the cryptic "supabaseUrl is required". We surface a precise,
 * actionable message instead (values are never logged).
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Ziad Web is missing Supabase configuration. The deployed build was compiled ' +
          'WITHOUT NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Both must be ' +
          'set in the Vercel Production environment and the app REBUILT (they are inlined ' +
          'at build time). Values are never logged for security.',
      );
    }
    client = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return client;
}
