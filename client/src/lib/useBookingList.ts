import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from './api';
import type { Booking } from './bookings';
import type { ApiData } from './useApiData';

interface Loaded {
  /** The API path this state belongs to. */
  path: string;
  state: ApiData<Booking[]>;
}

/**
 * One list of bookings. It loads when `path` changes, and `reload` shows the loading state again ("Try again").
 *
 * The state is tagged with the path it was loaded for and only shown for that path: after the page switches from
 * Upcoming to History, the Upcoming rows are never drawn under the History label, not even for one frame (an effect
 * that resets the state runs after the first paint). `refresh` fetches the same list again without a loading state and
 * swaps it in, so a row can change under the user's eyes; it rejects when the request fails and resolves `null` when
 * the list changed meanwhile. `remove` drops a row the server has just confirmed as gone from this list.
 */
export function useBookingList(path: string): {
  state: ApiData<Booking[]>;
  reload: () => void;
  refresh: () => Promise<Booking[] | null>;
  remove: (id: string) => void;
} {
  const [loaded, setLoaded] = useState<Loaded>({ path, state: { status: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  const currentPath = useRef(path);

  useEffect(() => {
    currentPath.current = path;
    let current = true;
    setLoaded((previous) => (previous.path === path && previous.state.status === 'loading' ? previous : { path, state: { status: 'loading' } }));
    apiFetch<Booking[]>(path).then(
      (data) => {
        if (current) setLoaded({ path, state: { status: 'success', data } });
      },
      (error: unknown) => {
        if (current) setLoaded({ path, state: { status: 'error', error: error as ApiError } });
      },
    );
    return () => {
      current = false;
    };
  }, [path, attempt]);

  const refresh = useCallback(async () => {
    const requested = currentPath.current;
    const fresh = await apiFetch<Booking[]>(requested);
    if (currentPath.current !== requested) return null;
    setLoaded((previous) => (previous.path === requested && previous.state.status === 'success' ? { path: requested, state: { status: 'success', data: fresh } } : previous));
    return fresh;
  }, []);

  const remove = useCallback((id: string) => {
    setLoaded((previous) =>
      previous.state.status === 'success'
        ? { path: previous.path, state: { status: 'success', data: previous.state.data.filter((booking) => booking.id !== id) } }
        : previous,
    );
  }, []);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const state: ApiData<Booking[]> = loaded.path === path ? loaded.state : { status: 'loading' };
  return { state, reload, refresh, remove };
}
