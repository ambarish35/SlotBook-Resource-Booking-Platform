/**
 * Loading indicator (DESIGN.md §3 Motion): 16 px inside buttons, 24 px in regions, always next to text.
 * It spins only when the user hasn't asked for reduced motion; otherwise it is a static ring.
 */
export function Spinner({ size = 16 }: { size?: 16 | 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 motion-safe:animate-spin"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

/** A spinner with its label, for regions that are loading. */
export function LoadingNote({ children = 'Loading…' }: { children?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-copy-14 text-fg-secondary">
      <Spinner size={24} />
      {children}
    </p>
  );
}
