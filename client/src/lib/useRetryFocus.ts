import { useCallback, useEffect, useRef } from 'react';
import type { ApiData } from './useApiData';

/**
 * Moves focus after the user presses "Try again", because the button that had focus disappears
 * when the page changes state (DESIGN.md §7: after the user's own action, focus moves to the result).
 * Call the returned function just before reloading. Once the reload settles, `onSuccess` or `onError`
 * runs once; they should only focus things, so they may close over refs and nothing else.
 */
export function useRetryFocus(status: ApiData<unknown>['status'], onSuccess: () => void, onError: () => void): () => void {
  const retrying = useRef(false);
  const handlers = useRef({ onSuccess, onError });
  handlers.current = { onSuccess, onError };

  useEffect(() => {
    if (!retrying.current || status === 'loading') return;
    retrying.current = false;
    if (status === 'success') handlers.current.onSuccess();
    else handlers.current.onError();
  }, [status]);

  return useCallback(() => {
    retrying.current = true;
  }, []);
}
