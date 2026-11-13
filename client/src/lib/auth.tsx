import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch, setSessionExpiredHandler } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'admin';
}

export type Session =
  | { status: 'loading' }
  /** The API could not be reached or failed while restoring the session. */
  | { status: 'error' }
  /** `keepReturnPath` is false after a deliberate sign-out, so the next sign-in doesn't return to the old page. */
  | { status: 'signedOut'; keepReturnPath: boolean }
  | { status: 'signedIn'; user: User };

interface AuthContextValue {
  session: Session;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Try restoring the session again after an error. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the session. It is restored on load from GET /api/auth/me; the session itself lives in an
 * httpOnly cookie that scripts can't read, so the client only ever learns who is signed in from the API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<User>('/auth/me').then(
      (user) => {
        if (active) setSession({ status: 'signedIn', user });
      },
      (error: unknown) => {
        if (!active) return;
        setSession(
          error instanceof ApiError && error.status === 401
            ? { status: 'signedOut', keepReturnPath: true }
            : { status: 'error' },
        );
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  // Any later 401 UNAUTHENTICATED (an expired session, say) ends the session; the route guard then
  // sends the user to sign in and brings them back to the page they were on.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSession((current) => (current.status === 'signedIn' ? { status: 'signedOut', keepReturnPath: true } : current));
    });
    return () => setSessionExpiredHandler(undefined);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await apiFetch<User>('/auth/login', { method: 'POST', body: { email, password } });
    setSession({ status: 'signedIn', user });
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const user = await apiFetch<User>('/auth/register', { method: 'POST', body: input });
    setSession({ status: 'signedIn', user });
  }, []);

  // If the request fails the cookie is still valid, so the user stays signed in and the caller shows the error.
  const signOut = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setSession({ status: 'signedOut', keepReturnPath: false });
  }, []);

  const retry = useCallback(() => {
    setSession({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  const value = useMemo(() => ({ session, signIn, register, signOut, retry }), [session, signIn, register, signOut, retry]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in user. Only valid below the RequireAuth route guard. */
export function useSignedInUser(): User {
  const { session } = useAuth();
  if (session.status !== 'signedIn') throw new Error('useSignedInUser must be used below <RequireAuth>');
  return session.user;
}
