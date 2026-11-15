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

/**
 * Cancels a whole booking and frees all its slots (PLAN.md §8). The owner or an admin may; the API decides, and says
 * 404 for a booking the caller may not touch and 409 BOOKING_NOT_CANCELLABLE for one that is cancelled or has started.
 */
export function cancelBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

/** True for the 409 that says a booking is already cancelled or has already started. Its message says which. */
export function isNotCancellable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'BOOKING_NOT_CANCELLABLE';
}

/** Upcoming is confirmed bookings that haven't ended; History is cancelled ones and those that have (PLAN.md §6). */
export type BookingView = 'upcoming' | 'history';
/** Whose bookings: the signed-in user's own, or everyone's (admins only; the API refuses the second for members). */
export type BookingScope = 'mine' | 'all';

/** A list holds at most this many rows (PLAN.md §6). Exactly this many means there may be more that aren't shown. */
export const LIST_LIMIT = 50;

/** Anything but `history` is Upcoming, so a mistyped address still shows something true. */
export function parseView(value: string | null): BookingView {
  return value === 'history' ? 'history' : 'upcoming';
}

/** Only an admin gets `all`. For a member the page asks for their own bookings whatever the address says. */
export function parseScope(value: string | null, isAdmin: boolean): BookingScope {
  return isAdmin && value === 'all' ? 'all' : 'mine';
}

/** The API path of a list. `all` is the admin endpoint. */
export function bookingsPath(view: BookingView, scope: BookingScope): string {
  return `${scope === 'all' ? '/bookings' : '/bookings/mine'}?view=${view}`;
}

/** The page's own query string for a view and scope: nothing for the defaults (Upcoming, Mine). */
export function bookingsSearch(view: BookingView, scope: BookingScope): string {
  const parts = [scope === 'all' ? 'scope=all' : '', view === 'history' ? 'view=history' : ''].filter(Boolean);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/**
 * Where a booking stands at `nowMs`, derived the way the API lists them: `start <= now < end` is in progress. The
 * clock is the browser's, so this is a snapshot that the API can overrule; only `upcoming` offers Cancel.
 */
export type BookingPhase = 'upcoming' | 'in-progress' | 'completed' | 'cancelled';

export function phaseOf(booking: Pick<Booking, 'status' | 'start' | 'end'>, nowMs: number): BookingPhase {
  if (booking.status === 'cancelled') return 'cancelled';
  if (Date.parse(booking.start) > nowMs) return 'upcoming';
  return Date.parse(booking.end) > nowMs ? 'in-progress' : 'completed';
}
