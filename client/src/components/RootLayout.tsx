import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AuthProvider } from '../lib/auth';

/**
 * Wraps every route. After a route change, focus moves to the new page's `h1` so keyboard and
 * screen-reader users land at the top of the new content (DESIGN.md §5.1). It does nothing on the first load.
 */
function useFocusHeadingOnNavigation() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [pathname]);
}

export function RootLayout() {
  useFocusHeadingOnNavigation();
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
