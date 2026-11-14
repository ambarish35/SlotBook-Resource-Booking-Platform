/**
 * A static placeholder block shaped like content that is loading (DESIGN.md §4): no shimmer.
 * The container that holds skeletons sets aria-busy and a visually hidden "Loading…" label.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-surface-subtle ${className}`} />;
}
