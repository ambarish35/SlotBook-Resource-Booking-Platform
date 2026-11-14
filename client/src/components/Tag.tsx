import type { ReactNode } from 'react';

/** A metadata tag (DESIGN.md §4 Badges): "Room", "Projector". Never interactive. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2 text-label-12 whitespace-nowrap text-fg-secondary">
      {children}
    </span>
  );
}

/** A count pill, such as the number of active filters on the mobile "Filters" button. */
export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-surface-subtle px-1.5 text-label-12 text-fg-secondary tabular-nums">
      {children}
    </span>
  );
}
