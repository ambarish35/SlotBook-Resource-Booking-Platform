import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './api';

export type ApiData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'success'; data: T };

/**
 * Loads `GET /api{path}` when the component mounts or the path changes, and again whenever `reload`
 * is called ("Try again"). A response that arrives after the path changed, or after unmount, is ignored.
 */
export function useApiData<T>(path: string): { state: ApiData<T>; reload: () => void } {
  const [state, setState] = useState<ApiData<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState((previous) => (previous.status === 'loading' ? previous : { status: 'loading' }));
    apiFetch<T>(path).then(
      (data) => {
        if (current) setState({ status: 'success', data });
      },
      (error: unknown) => {
        if (current) setState({ status: 'error', error: error as ApiError });
      },
    );
    return () => {
      current = false;
    };
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { state, reload };
}
