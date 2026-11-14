import { useState } from 'react';

/**
 * Runs `reset` during the render in which `open` turns true, so a dialog that stays mounted starts every
 * opening with fresh state, and never paints stale values first. This is React's documented way to adjust
 * state when a prop changes (https://react.dev/learn/you-might-not-need-an-effect).
 */
export function useOnOpen(open: boolean, reset: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }
}
