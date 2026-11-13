import { Link, Outlet } from 'react-router';

/** Top bar and page container shared by every screen (DESIGN.md §5.1). */
export function AppShell() {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-3 py-2 text-label-14 text-accent shadow-raised focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50"
      >
        Skip to main content
      </a>
      <header className="h-14 border-b border-border bg-surface">
        <div className="mx-auto flex h-full max-w-content items-center px-4 md:px-6">
          <Link to="/" className="rounded-md text-title-card text-fg">
            SlotBook
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-content px-4 py-6 md:px-6 md:py-8">
        <Outlet />
      </main>
    </>
  );
}
