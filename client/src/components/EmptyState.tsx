import type { ReactNode } from 'react';

/** DESIGN.md §4: a centered stack at most 464 px wide with a title, one sentence and at most one action. */
export function EmptyState({ title, children, action }: { title: string; children?: string; action?: ReactNode }) {
  return (
    <section className="mx-auto max-w-116 rounded-lg border border-border bg-surface px-4 py-10 text-center md:py-12">
      <h2 className="text-title-section text-fg">{title}</h2>
      {children ? <p className="mt-1 text-copy-14 text-fg-secondary">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
