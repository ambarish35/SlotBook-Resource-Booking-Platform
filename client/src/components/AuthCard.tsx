import type { ReactNode } from 'react';

/** The centered card used by Sign in and Register (DESIGN.md §5.2): at most 400 px wide, wordmark above. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="px-4 py-12 md:py-16">
      <div className="mx-auto w-full max-w-100">
        <p className="mb-4 text-center text-title-section text-fg">SlotBook</p>
        <div className="rounded-lg border border-border bg-surface p-4 md:p-5">{children}</div>
      </div>
    </main>
  );
}
