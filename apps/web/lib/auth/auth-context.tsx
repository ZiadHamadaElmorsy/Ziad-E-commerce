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
import { api } from '@/lib/api/client';
import type { MeMembership, MeResponse, MeStore, MeUser } from '@/lib/api/types';
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
  me: MeResponse;
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
    } catch {
      // The session/token is not valid on the backend -> end the session.
      setState({
        status: 'unauthenticated',
        user: null,
        store: null,
        membership: null,
        me: null,
        error: null,
      });
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
