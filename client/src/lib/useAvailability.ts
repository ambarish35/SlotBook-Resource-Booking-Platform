import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import type { Availability, Booking } from './bookings';
import { type ApiData, useApiData } from './useApiData';

/**
 * A resource's slots for one IST date. Loads when the resource or date changes; `reload` shows the loading state
 * again ("Try again"). The grid is a snapshot (DESIGN.md §5.6): `refresh` fetches a fresh one and swaps it in without
 * a loading state, `applyBooking` marks slots a confirmed booking took.
 */
export function useAvailability(
  resourceId: string,
  date: string,
): {
  state: ApiData<Availability>;
  reload: () => void;
  /** Resolves with the fresh snapshot, or `null` if the resource or date changed meanwhile (then it is dropped). */
  refresh: () => Promise<Availability | null>;
  applyBooking: (booking: Booking) => void;
} {
  const path = `/resources/${encodeURIComponent(resourceId)}/availability?date=${date}`;
  const { state, reload, mutate } = useApiData<Availability>(path);

  // The path the page is showing now, so a response for an earlier resource or date is recognised and dropped.
  const currentPath = useRef(path);
  useEffect(() => {
    currentPath.current = path;
  }, [path]);

  const refresh = useCallback(async () => {
    const requested = currentPath.current;
    const fresh = await apiFetch<Availability>(requested);
    if (currentPath.current !== requested) return null;
    mutate(() => fresh);
    return fresh;
  }, [mutate]);

  // The booking response is the authority. Until a refresh brings everyone else's changes, the grid already shows
  // the new booking as taken and "Your booking", so those slots never look free and clickable for a moment.
  // A slot that has started stays Past.
  const applyBooking = useCallback(
    (booking: Booking) => {
      const booked = new Set(booking.slotStarts);
      mutate((data) => ({
        ...data,
        slots: data.slots.map((slot) =>
          booked.has(slot.start)
            ? { ...slot, status: slot.status === 'past' ? 'past' : 'unavailable', mine: true }
            : slot,
        ),
      }));
    },
    [mutate],
  );

  return { state, reload, refresh, applyBooking };
}
