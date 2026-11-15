import { ApiError, apiFetch } from './api';
import type { ResourceType } from './resources';

/** One of a day's 24 slots as the availability endpoint returns it (PLAN.md §6). The client never builds these. */
export interface AvailabilitySlot {
  /** ISO UTC start. Send it back untouched when booking. */
  start: string;
  end: string;
  /** The IST start time, "10:00". */
  label: string;
  /** `past` wins over `unavailable`: a slot that has started is `past` even when it is booked. */
  status: 'available' | 'unavailable' | 'past';
  /** True only on the caller's own booked slots. Nobody else's bookings are identified. */
  mine: boolean;
}

export interface Availability {
  resourceId: string;
  date: string;
  slots: AvailabilitySlot[];
}

/** A booking as the API returns it, from `POST /api/bookings` and later the lists (PLAN.md §6, one shape for all). */
export interface Booking {
  id: string;
  resource: { id: string; name: string; type: ResourceType; location: string };
  user: { id: string; name: string; email: string };
  date: string;
  slotStarts: string[];
  start: string;
  end: string;
  status: 'confirmed' | 'cancelled';
  cancelledAt: string | null;
  createdAt: string;
}

/** The most slots one booking can hold. The UI stops at it (DESIGN.md §5.5); the API enforces it as well. */
export const MAX_SLOTS = 8;

/** A slot of a refused booking: `booked` is taken by someone, `past` has already started. */
export interface SlotConflict {
  start: string;
  reason: 'booked' | 'past';
}

/**
 * The slots a 409 SLOT_UNAVAILABLE lists, or `null` when `error` isn't that error. A body that doesn't have the
 * documented shape gives an empty list: the refusal is still a conflict, only the details are unknown.
 */
export function conflictsOf(error: unknown): SlotConflict[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'SLOT_UNAVAILABLE') return null;
  const slots = error.details?.slots;
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot: unknown) => {
    const { start, reason } = (slot ?? {}) as { start?: unknown; reason?: unknown };
    return typeof start === 'string' && (reason === 'booked' || reason === 'past') ? [{ start, reason }] : [];
  });
}

/** Books these slots in one request: all of them or none (PLAN.md §8). The response is the authority, not any earlier grid. */
export function createBooking(resourceId: string, slotStarts: string[]): Promise<Booking> {
  return apiFetch<Booking>('/bookings', { method: 'POST', body: { resourceId, slotStarts } });
}
