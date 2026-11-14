import { z } from 'zod';
import { isObjectIdString } from '../lib/object-id.js';
import { MAX_SLOTS_PER_BOOKING, isIstDate, isOnSlotGrid, istDateOf, parseUtcInstant } from '../lib/time.js';

/*
 * Request rules for the availability and booking endpoints (PLAN.md §6, §8). The messages are written for
 * people. These schemas check the *shape* of a request, which doesn't depend on the current time. The rules
 * that do (the date window, and slots that have already started) are checked by the services against the clock.
 */

/** `GET /api/resources/:id/availability?date=YYYY-MM-DD`: an IST calendar date that exists. */
export const availabilityQuery = z.object({
  date: z.string({ error: 'Choose a date' }).refine(isIstDate, 'Use a date like 2026-11-14'),
});

/** `GET /api/bookings/mine` and `GET /api/bookings`: which list. */
export const listBookingsQuery = z.object({
  view: z.enum(['upcoming', 'history'], { error: 'Use "upcoming" or "history"' }).default('upcoming'),
});

const resourceId = z.string({ error: 'Choose a resource' }).refine(isObjectIdString, 'Choose a resource');

/**
 * 1 to 8 distinct slot starts, each an ISO-8601 UTC instant ending in Z, each on the 30-minute grid between
 * 08:00 and 19:30 IST, all on the same IST date. The result is sorted, oldest first. Every problem is reported
 * on `slotStarts` itself, because the client sends the starts it received and never builds them.
 */
const slotStarts = z
  .array(z.unknown(), { error: `Choose between 1 and ${MAX_SLOTS_PER_BOOKING} times` })
  .transform((entries, ctx) => {
    const reject = (message: string) => {
      ctx.issues.push({ code: 'custom', message, input: entries });
      return z.NEVER;
    };

    if (entries.length === 0) return reject('Choose at least one time');
    if (entries.length > MAX_SLOTS_PER_BOOKING) return reject(`You can book up to ${MAX_SLOTS_PER_BOOKING} slots at a time`);

    const starts: Date[] = [];
    for (const entry of entries) {
      const start = typeof entry === 'string' ? parseUtcInstant(entry) : null;
      if (!start) return reject('Times must be UTC instants like 2026-11-14T04:30:00.000Z');
      if (!isOnSlotGrid(start)) return reject('Times must start on the hour or half hour, from 08:00 to 19:30 IST');
      starts.push(start);
    }
    if (new Set(starts.map((start) => start.getTime())).size !== starts.length) return reject('Choose each time only once');
    if (new Set(starts.map(istDateOf)).size > 1) return reject('Choose times on one date');
    return starts.sort((a, b) => a.getTime() - b.getTime());
  });

/** `POST /api/bookings`. Unknown keys are dropped, so a `user` in the body can never book for someone else. */
export const createBookingBody = z.object({ resourceId, slotStarts });

export type CreateBookingBody = z.infer<typeof createBookingBody>;
export type BookingView = z.infer<typeof listBookingsQuery>['view'];
