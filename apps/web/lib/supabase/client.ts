import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config';

/**
 * Supabase browser client used for the real authentication flow.
 *
 * - persistSession + autoRefreshToken keep the merchant signed in and keep
 *   the access token fresh (Supabase handles token refresh automatically).
 * - The access token is read from this client's session and attached to every
 *   backend API request (see lib/api/client.ts). It is NEVER rendered in the
 *   UI.
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
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
