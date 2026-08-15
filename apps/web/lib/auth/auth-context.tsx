'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { MeMembership, MeResponse, MeStore, MeUser, OnboardingStatus } from '@/lib/api/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: MeUser | null;
  store: MeStore | null;
  membership: MeMembership | null;
  me: MeResponse | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface UnauthenticatedState {
  status: 'unauthenticated';
  user: null;
  store: null;
  membership: null;
  me: null;
}

interface AuthenticatedState {
  status: 'authenticated';
  user: MeUser | null;
  store: MeStore | null;
  membership: MeMembership | null;
  me: MeResponse | null;
}

interface LoadingState {
  status: 'loading';
  user: null;
  store: null;
  membership: null;
  me: null;
}

type AuthState = (LoadingState | AuthenticatedState | UnauthenticatedState) & {
  error: string | null;
};

/**
 * Real authentication state:
 *
 *   Supabase Auth (email/password) -> Supabase session (persisted) ->
 *   /auth/me (backend, verifies the access token + resolves the store and
 *   membership) -> UI.
 *
 * The access token is managed entirely by the Supabase client and is never
 * stored in React state or rendered anywhere.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    store: null,
    membership: null,
    me: null,
    error: null,
  });

  const refreshMe = useCallback(async () => {
    try {
      const envelope = await api.get<{ data: MeResponse }>('/auth/me');
      const me = envelope.data;
      setState({
        status: 'authenticated',
        user: me.user,
        store: me.store,
        membership: me.membership,
        me,
        error: null,
      });
    } catch (caught) {
      // A signed-in user without an ACTIVE membership cannot resolve a tenant
      // through /auth/me (the global tenant guard fails closed). That is NOT a
      // lost session — a fresh merchant who has not created a store yet (or a
      // multi-store merchant without a selection) is still authenticated.
      const isTenantless =
        caught instanceof ApiError &&
        (caught.code === 'FORBIDDEN' || caught.code === 'TENANT_CONTEXT_REQUIRED');

      if (!isTenantless) {
        setState({
          status: 'unauthenticated',
          user: null,
          store: null,
          membership: null,
          me: null,
          error: null,
        });
        return;
      }

      try {
        const envelope = await api.get<{ data: OnboardingStatus }>('/onboarding/status');
        const status = envelope.data;
        if (status.store && status.membership) {
          // The merchant already owns a store (e.g. multi-store without a
          // selection). The store is server-resolved from the membership row.
          setState({
            status: 'authenticated',
            user: status.user
              ? { authUserId: status.user.authUserId, email: status.user.email }
              : null,
            store: {
              id: status.store.id,
              slug: status.store.slug,
              name: status.store.name,
              status: status.store.status,
            },
            membership: status.membership,
            me: {
              requestId: '',
              user: status.user
                ? { authUserId: status.user.authUserId, email: status.user.email }
                : null,
              store: {
                id: status.store.id,
                slug: status.store.slug,
                name: status.store.name,
                status: status.store.status,
              },
              membership: status.membership,
            },
            error: null,
          });
        } else {
          // Authenticated but has no store yet -> the onboarding flow. The
          // identity comes from the trusted Supabase session, never from React.
          const supabase = getSupabaseBrowserClient();
          const session = (await supabase.auth.getSession()).data.session;
          setState({
            status: 'authenticated',
            user: session
              ? { authUserId: session.user.id, email: session.user.email ?? '' }
              : null,
            store: null,
            membership: null,
            me: null,
            error: null,
          });
        }
      } catch {
        // The fallback also failed — treat it as an invalid session.
        setState({
          status: 'unauthenticated',
          user: null,
          store: null,
          membership: null,
          me: null,
          error: null,
        });
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        await refreshMe();
      } else {
        setState({
          status: 'unauthenticated',
          user: null,
          store: null,
          membership: null,
          me: null,
          error: null,
        });
      }
    };

    void bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session) {
          void refreshMe();
        }
      } else if (event === 'SIGNED_OUT') {
        setState({
          status: 'unauthenticated',
          user: null,
          store: null,
          membership: null,
          me: null,
          error: null,
        });
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setState({
      status: 'unauthenticated',
      user: null,
      store: null,
      membership: null,
      me: null,
      error: null,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status as AuthStatus,
      user: state.user,
      store: state.store,
      membership: state.membership,
      me: state.me,
      error: state.error,
      signIn,
      signOut,
      refreshMe,
    }),
    [state, signIn, signOut, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
