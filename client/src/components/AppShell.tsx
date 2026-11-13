import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useSignedInUser } from '../lib/auth';
import { Button } from './Button';
import { MenuIcon, CloseIcon } from './icons';
import { Lozenge } from './Lozenge';
import { Message } from './Message';

const navItems = [
  { to: '/resources', label: 'Resources', adminOnly: false },
  { to: '/bookings', label: 'My bookings', adminOnly: false },
  { to: '/admin/resources', label: 'Manage resources', adminOnly: true },
];

/** Top bar and page container shared by every signed-in screen (DESIGN.md §5.1). */
export function AppShell() {
  const user = useSignedInUser();
  const { signOut } = useAuth();
  const location = useLocation();
  // The mobile menu is open only for the location it was opened on, so any navigation closes it:
  // a link in the menu, the Back button, anything.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const menuOpen = menuOpenedAt === location.key;
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  const items = navItems.filter((item) => !item.adminOnly || user.role === 'admin');

  useEffect(() => {
    if (signOutFailed) failureRef.current?.focus();
  }, [signOutFailed]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      await signOut(); // on success the route guard sends the user to /login
    } catch {
      setSignOutFailed(true);
      setSigningOut(false);
    }
  }

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-full items-center border-b-2 px-1 text-label-14 ${
      isActive ? 'border-accent text-fg' : 'border-transparent text-fg-secondary hover:text-fg'
    }`;
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center border-l-2 px-4 text-label-14 ${
      isActive ? 'border-accent bg-surface-subtle text-fg' : 'border-transparent text-fg-secondary'
    }`;

  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-3 py-2 text-label-14 text-accent shadow-raised focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50"
      >
        Skip to main content
      </a>
      <header
        className="border-b border-border bg-surface"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            setMenuOpenedAt(null);
            menuButtonRef.current?.focus();
          }
        }}
      >
        <div className="mx-auto flex min-h-14 max-w-content items-center gap-6 px-4 md:px-6">
          <Link to="/resources" className="rounded-md text-title-card text-fg">
            SlotBook
          </Link>

          <nav aria-label="Main" className="hidden h-14 items-stretch gap-6 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={desktopLink}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="min-w-0 text-copy-14 break-words text-fg">{user.name}</span>
            {user.role === 'admin' ? <Lozenge tone="accent">Admin</Lozenge> : null}
            <Button variant="subtle" onClick={handleSignOut} loading={signingOut} loadingLabel="Signing out…">
              Sign out
            </Button>
          </div>

          <Button
            ref={menuButtonRef}
            variant="subtle"
            className="ml-auto md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpenedAt(menuOpen ? null : location.key)}
          >
            {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            Menu
          </Button>
        </div>

        {menuOpen ? (
          <div id="mobile-menu" className="border-t border-border pb-2 md:hidden">
            <nav aria-label="Main">
              <ul>
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={mobileLink}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border px-4 pt-3">
              <span className="min-w-0 text-copy-14 break-words text-fg">{user.name}</span>
              {user.role === 'admin' ? <Lozenge tone="accent">Admin</Lozenge> : null}
            </div>
            <div className="px-4 pt-2">
              <Button variant="secondary" fullWidth onClick={handleSignOut} loading={signingOut} loadingLabel="Signing out…">
                Sign out
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-content px-4 py-6 md:px-6 md:py-8">
        {signOutFailed ? (
          <div className="mb-6">
            <Message ref={failureRef} variant="danger" title="We couldn't sign you out">
              Check your connection and try again. You are still signed in.
            </Message>
          </div>
        ) : null}
        <Outlet />
      </main>
    </>
  );
}
