import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { configureApi } from '@/lib/api/client';
import { env } from '@/lib/env';
import { getSupabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<{ needsConfirmation: boolean }>;
  sendMagicLink: (email: string, next?: string) => Promise<void>;
  signInWithGoogle: (next?: string) => Promise<void>;
  /** Finishes a magic-link, confirmation or OAuth redirect on /auth/callback. */
  completeSignIn: (url: URL) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** A failed /auth/callback, with Supabase's error code (otp_expired, flow_state_not_found, …). */
export class AuthCallbackError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthCallbackError';
    this.code = code;
  }
}

/** Supabase reports redirect errors in the query (PKCE) or in the hash (email links, implicit flow). */
export function callbackError(url: URL): AuthCallbackError | null {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);
  const error = get('error');
  const code = get('error_code');
  const description = get('error_description');
  if (!error && !code && !description) return null;
  return new AuthCallbackError(code || error || 'unknown', description || 'Sign-in failed.');
}

const callbackUrl = (next?: string) =>
  `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;

const toUser = (s: Session | null): AuthUser | null =>
  s ? { id: s.user.id, email: s.user.email ?? '', name: (s.user.user_metadata?.full_name ?? s.user.user_metadata?.name) as string | undefined } : null;

/* ------------------------------------------------------------------ */
/* Mock mode: a local session flag; the mock API decides who you are.  */
/* ------------------------------------------------------------------ */

const MOCK_KEY = 'truplexy.mock.session';
const mockSignedIn = () => {
  try {
    return localStorage.getItem(MOCK_KEY) === '1';
  } catch {
    return false;
  }
};
const setMockSignedIn = (v: boolean) => {
  try {
    if (v) localStorage.setItem(MOCK_KEY, '1');
    else localStorage.removeItem(MOCK_KEY);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (env.useMocks) {
      const on = mockSignedIn();
      configureApi({ getToken: async () => (mockSignedIn() ? 'mock-token' : null), onUnauthorized: () => setStatus('signedOut') });
      setUser(on ? { id: 'mock', email: 'demo@truplexy.dev' } : null);
      setStatus(on ? 'signedIn' : 'signedOut');
      return;
    }

    if (!env.supabaseUrl || !env.supabaseKey) {
      setStatus('signedOut');
      return;
    }

    let unsub = () => {};
    let cancelled = false;
    void getSupabase().then(async (sb) => {
      configureApi({
        // getSession refreshes the token when it is about to expire.
        getToken: async (opts) => {
          if (opts?.refresh) {
            const { data } = await sb.auth.refreshSession();
            return data.session?.access_token ?? null;
          }
          const { data } = await sb.auth.getSession();
          return data.session?.access_token ?? null;
        },
        onUnauthorized: () => void sb.auth.signOut(),
      });
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setUser(toUser(data.session));
      setStatus(data.session ? 'signedIn' : 'signedOut');
      const sub = sb.auth.onAuthStateChange((_event, session) => {
        setUser(toUser(session));
        setStatus(session ? 'signedIn' : 'signedOut');
        if (!session) qc.clear();
      });
      unsub = () => sub.data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [qc]);

  const value = useMemo<AuthValue>(() => {
    if (env.useMocks) {
      const signIn = async () => {
        setMockSignedIn(true);
        setUser({ id: 'mock', email: 'demo@truplexy.dev' });
        setStatus('signedIn');
      };
      return {
        status,
        user,
        signInWithPassword: signIn,
        signUp: async () => (await signIn(), { needsConfirmation: false }),
        sendMagicLink: signIn,
        signInWithGoogle: signIn,
        completeSignIn: async (url) => {
          const err = callbackError(url);
          if (err) throw err;
          await signIn();
        },
        signOut: async () => {
          setMockSignedIn(false);
          qc.clear();
          setUser(null);
          setStatus('signedOut');
        },
      };
    }

    const fail = (e: { message: string } | null) => {
      if (e) throw new Error(e.message);
    };
    return {
      status,
      user,
      signInWithPassword: async (email, password) => {
        const sb = await getSupabase();
        fail((await sb.auth.signInWithPassword({ email, password })).error);
      },
      signUp: async (email, password, name) => {
        const sb = await getSupabase();
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl(), data: name ? { full_name: name } : undefined },
        });
        fail(error);
        return { needsConfirmation: !data.session };
      },
      sendMagicLink: async (email, next) => {
        const sb = await getSupabase();
        fail((await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(next) } })).error);
      },
      signInWithGoogle: async (next) => {
        const sb = await getSupabase();
        fail((await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } })).error);
      },
      completeSignIn: async (url) => {
        const redirectError = callbackError(url);
        if (redirectError) throw redirectError;
        const sb = await getSupabase();
        const failAs = (e: { message: string; code?: string } | null) => {
          if (e) throw new AuthCallbackError(e.code ?? 'unknown', e.message);
        };
        const tokenHash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');
        const code = url.searchParams.get('code');
        if (tokenHash && type) {
          failAs((await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' })).error);
        } else if (code) {
          failAs((await sb.auth.exchangeCodeForSession(code)).error);
        } else if (!(await sb.auth.getSession()).data.session) {
          // Nothing to complete and no session: the link lost its code (cut off when copied, or opened bare).
          throw new AuthCallbackError('missing_code', 'This link is missing its sign-in code.');
        }
      },
      signOut: async () => {
        const sb = await getSupabase();
        await sb.auth.signOut();
        qc.clear();
      },
    };
  }, [status, user, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
