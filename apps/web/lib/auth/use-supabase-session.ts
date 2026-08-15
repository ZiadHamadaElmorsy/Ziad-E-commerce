'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Lightweight session observer for PUBLIC (marketing) surfaces.
 *
 * Unlike AuthProvider this never calls the backend: it only tracks whether a
 * Supabase session exists. That is enough for the marketing navbar to swap its
 * primary CTA ("Start Selling" -> "Go to Dashboard") for a signed-in merchant
 * without dragging the full tenant-resolution machinery into public pages.
 *
 * The session object is only used as a truthy flag; the access token is never
 * rendered anywhere.
 */
export function useSupabaseSession(): { loading: boolean; session: Session | null } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch(() => {
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { loading, session };
}
