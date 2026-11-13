import type { ReactNode } from 'react';

export type LozengeTone = 'accent' | 'neutral' | 'success' | 'warning';

const tones: Record<LozengeTone, string> = {
  accent: 'bg-accent-subtle text-accent-hover',
  neutral: 'bg-surface-subtle text-fg-secondary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
};

/** A status pill (DESIGN.md §4 Badges): one or two words, never interactive, never truncated. */
export function Lozenge({ tone, children }: { tone: LozengeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 text-label-12 whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}
