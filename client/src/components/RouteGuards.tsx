import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth, useSignedInUser } from '../lib/auth';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { Button } from './Button';
import { Message } from './Message';
import { LoadingNote } from './Spinner';

function CenteredScreen({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-116 items-center justify-center px-4 py-12">{children}</div>;
}

/** Shown while the session is restored, and if restoring it failed. */
function SessionGate() {
  const { session, retry } = useAuth();
  if (session.status === 'error') {
    return (
      <CenteredScreen>
        <Message
          variant="danger"
          role="alert"
          title="We couldn't reach SlotBook"
          action={<Button variant="secondary" onClick={retry}>Try again</Button>}
        >
          Check your connection, then try again. If this keeps happening, the server may be down.
        </Message>
      </CenteredScreen>
    );
  }
  return (
    <CenteredScreen>
      <LoadingNote />
    </CenteredScreen>
  );
}

/** A return path is only honored if it is a local page other than the sign-in pages. */
function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/resources';
  if (/^\/(login|register)(?:[/?#]|$)/.test(value)) return '/resources';
  return value;
}

/** Signed-in pages. Visitors go to /login and return to the page they asked for after signing in. */
export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();

  if (session.status === 'loading' || session.status === 'error') return <SessionGate />;
  if (session.status === 'signedOut') {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={session.keepReturnPath ? { from } : null} />;
  }
  return <Outlet />;
}

/** /login and /register. Someone already signed in goes on to their page. */
export function RedirectIfSignedIn() {
  const { session } = useAuth();
  const location = useLocation();

  if (session.status === 'loading' || session.status === 'error') return <SessionGate />;
  if (session.status === 'signedIn') {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeReturnPath(from)} replace />;
  }
  return <Outlet />;
}

/**
 * Admin-only pages. A member sees the 403 page at the same address. This only shapes the UI;
 * the API is the authority and answers 403 itself.
 */
export function RequireAdmin() {
  const user = useSignedInUser();
  return user.role === 'admin' ? <Outlet /> : <ForbiddenPage />;
}
