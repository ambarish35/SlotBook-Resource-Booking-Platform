import { now } from '../lib/clock.js';
import { validationError } from '../lib/errors.js';
import { MAX_DAYS_AHEAD, SLOT_MINUTES, TIME_ZONE, istDateOf, istTimeLabel, lastBookableDate, slotEnd, slotStartsOn } from '../lib/time.js';
import type { PublicUser } from '../models/User.js';
import { SlotReservation } from '../models/SlotReservation.js';
import { getResource } from './resources.js';

export type SlotStatus = 'available' | 'unavailable' | 'past';

export interface AvailabilitySlot {
  start: string;
  end: string;
  label: string;
  status: SlotStatus;
  /** True only on slots the caller has booked. Nobody else's bookings are identified (PLAN.md §6). */
  mine: boolean;
}

export interface Availability {
  resourceId: string;
  date: string;
  timeZone: string;
  slotMinutes: number;
  slots: AvailabilitySlot[];
}

/**
 * The 24 slots of an IST date for a resource (PLAN.md §6).
 *
 * - `past`: the slot's start is at or before now, so it can't be booked (a slot already in progress counts).
 *   This wins over `unavailable`, the same order the booking service checks them in (§8): a started slot is
 *   refused as "past" before anyone looks at who holds it. `mine` still marks the caller's own slots.
 * - `unavailable`: a confirmed booking holds the slot. Cancelled bookings hold nothing (their slot records are deleted).
 * - `available`: neither.
 *
 * A date in the past is allowed and shows every slot as past. A date more than 30 days ahead is refused,
 * because nothing there can be booked. Members get 404 for an inactive resource, admins can look at it.
 * The order of checks is the API's usual one: the request's shape (400, in the route), then the date window
 * (400), then the resource (404).
 */
export async function getAvailability(resourceId: string, date: string, user: PublicUser): Promise<Availability> {
  const current = now();
  if (date > lastBookableDate(istDateOf(current))) {
    throw validationError({ date: `Choose a date up to ${MAX_DAYS_AHEAD} days ahead` });
  }
  const resource = await getResource(resourceId, { isAdmin: user.role === 'admin' });

  const starts = slotStartsOn(date);
  const reservations = await SlotReservation.find({
    resource: resource.id,
    start: { $gte: starts[0], $lte: starts[starts.length - 1] },
  })
    .select('start user')
    .lean();
  const held = new Map(reservations.map((reservation) => [reservation.start.getTime(), reservation.user.toString()]));

  return {
    resourceId: resource.id,
    date,
    timeZone: TIME_ZONE,
    slotMinutes: SLOT_MINUTES,
    slots: starts.map((start) => {
      const holder = held.get(start.getTime());
      const status: SlotStatus = start.getTime() <= current.getTime() ? 'past' : holder === undefined ? 'available' : 'unavailable';
      return {
        start: start.toISOString(),
        end: slotEnd(start).toISOString(),
        label: istTimeLabel(start),
        status,
        mine: holder === user.id,
      };
    }),
  };
}
