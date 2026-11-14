import mongoose, { type mongo } from 'mongoose';
import { now } from '../lib/clock.js';
import { bookingNotCancellable, notFound, slotUnavailable, validationError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/object-id.js';
import { MAX_DAYS_AHEAD, istDateOf, lastBookableDate, slotEnd } from '../lib/time.js';
import { Booking, type BookingDocument, type PublicBooking, toPublicBooking } from '../models/Booking.js';
import { Resource } from '../models/Resource.js';
import { SlotReservation } from '../models/SlotReservation.js';
import { type PublicUser, User } from '../models/User.js';
import type { BookingView, CreateBookingBody } from '../schemas/bookings.js';
import { isDuplicateKeyError } from './auth.js';
import { getResource } from './resources.js';

/** Snapshot reads and majority writes: what MongoDB recommends for multi-document transactions. */
const TRANSACTION_OPTIONS: mongo.TransactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
};

/** The most rows a list returns (PLAN.md §14, DESIGN.md §4 Tables). */
export const LIST_LIMIT = 50;

/**
 * Books 1 to 8 slots of one resource on one IST date, all or nothing (PLAN.md §8).
 *
 * `slotStarts` has already passed the schema's checks: distinct, on the grid, on one date, sorted.
 * Order of the rest, exactly as §8 lists it:
 *   1. the date must be today to today + 30 (IST) → 400;
 *   2. any slot that has already started → 409 SLOT_UNAVAILABLE with reason `past`;
 *   3. the resource must exist and be active, for admins too → 404;
 *   4. one transaction inserts the parent booking, then one slot record per slot;
 *   5. if any slot is taken, its insert hits the unique `{ resource, start }` index and the transaction aborts,
 *      so no parent and no slot record is written, not even for the free slots → 409 SLOT_UNAVAILABLE (`booked`).
 * The server never books the part of a request that is free.
 */
export async function createBooking(user: PublicUser, { resourceId, slotStarts }: CreateBookingBody): Promise<PublicBooking> {
  const current = now();
  const today = istDateOf(current);
  const date = istDateOf(slotStarts[0]!);
  if (date < today || date > lastBookableDate(today)) {
    throw validationError({ slotStarts: `Choose times from today to ${MAX_DAYS_AHEAD} days ahead (IST)` });
  }

  const past = slotStarts.filter((start) => start.getTime() <= current.getTime());
  if (past.length > 0) throw slotUnavailable(past.map((start) => ({ start: start.toISOString(), reason: 'past' })));

  const resource = await getResource(resourceId, { isAdmin: false }); // inactive counts as missing, whoever asks

  const booking = await insertBooking({ userId: user.id, resourceId: resource.id, date, slotStarts });
  return toPublicBooking(
    booking,
    { id: resource.id, name: resource.name, type: resource.type, location: resource.location },
    { id: user.id, name: user.name, email: user.email },
  );
}

/**
 * How often the transaction is started again when its slots were reported taken but none can be found a moment
 * later (the holder cancelled in between). Each pass is a whole new transaction. If the last pass ends the same
 * way, the duplicate-key error is rethrown and the caller gets a generic 500: it would take the same slots being
 * taken and released three times in a row, and an honest "something went wrong, try again" beats guessing.
 */
const MAX_BOOKING_ATTEMPTS = 3;

async function insertBooking(request: {
  userId: string;
  resourceId: string;
  date: string;
  slotStarts: Date[];
}): Promise<BookingDocument> {
  const { userId, resourceId, date, slotStarts } = request;
  const start = slotStarts[0]!;
  const end = slotEnd(slotStarts[slotStarts.length - 1]!);

  for (let attempt = 1; ; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      const created: { booking?: BookingDocument } = {};
      // withTransaction runs this function again after a transient error, such as a write conflict with another
      // booking for the same slot. The retry then finds the slot taken and fails on the unique index below.
      // A duplicate key is not transient, so it is never retried by the driver.
      await session.withTransaction(async () => {
        const [parent] = await Booking.create([{ user: userId, resource: resourceId, date, slotStarts, start, end, status: 'confirmed' }], { session });
        await SlotReservation.insertMany(
          slotStarts.map((slot) => ({ resource: resourceId, start: slot, booking: parent!._id, user: userId })),
          { session },
        );
        created.booking = parent;
      }, TRANSACTION_OPTIONS);
      return created.booking!;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const taken = await takenSlots(resourceId, slotStarts);
      if (taken.length > 0) throw slotUnavailable(taken.map((slot) => ({ start: slot.toISOString(), reason: 'booked' })));
      if (attempt >= MAX_BOOKING_ATTEMPTS) throw error;
    } finally {
      await session.endSession();
    }
  }
}

/** Which of the requested slots hold a slot record now, oldest first. */
async function takenSlots(resourceId: string, slotStarts: Date[]): Promise<Date[]> {
  const records = await SlotReservation.find({ resource: resourceId, start: { $in: slotStarts } }).select('start').lean();
  return records.map((record) => record.start).sort((a, b) => a.getTime() - b.getTime());
}

const ALREADY_CANCELLED = 'This booking has already been cancelled.';
const ALREADY_STARTED = 'This booking has already started, so it can no longer be cancelled.';

/** Thrown inside the cancellation transaction when the conditional update matched nothing. */
class NothingToCancel extends Error {}

/**
 * Cancels a whole booking and frees all its slots at once (PLAN.md §8).
 *
 *   1. No such booking, or a member who doesn't own it → 404, the same answer either way. Admins may cancel any.
 *   2. It must be confirmed and not yet started → 409 BOOKING_NOT_CANCELLABLE.
 *   3. One transaction: set the parent from `confirmed` to `cancelled` (only if it still is confirmed, and still
 *      hasn't started: the clock is read again inside the transaction, so a booking that starts while this request
 *      is in flight can't be cancelled either), and delete its slot records. If the update matches nothing, a
 *      concurrent cancellation won or the booking has just started, and this one aborts with 409.
 * The parent's date, slotStarts, start and end never change, so History keeps the original times.
 */
export async function cancelBooking(user: PublicUser, id: string): Promise<PublicBooking> {
  const booking = isObjectIdString(id) ? await Booking.findById(id) : null;
  if (!booking || (user.role !== 'admin' && booking.user.toString() !== user.id)) throw notFound('Booking not found.');

  if (booking.status !== 'confirmed') throw bookingNotCancellable(ALREADY_CANCELLED);
  if (booking.start.getTime() <= now().getTime()) throw bookingNotCancellable(ALREADY_STARTED);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const instant = now();
      const update = await Booking.updateOne(
        { _id: booking._id, status: 'confirmed', start: { $gt: instant } },
        { $set: { status: 'cancelled', cancelledAt: instant, cancelledBy: user.id } },
        { session },
      );
      // Throwing aborts the transaction. The error is not transient, so the driver doesn't retry it.
      if (update.matchedCount === 0) throw new NothingToCancel();
      await SlotReservation.deleteMany({ booking: booking._id }, { session });
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (!(error instanceof NothingToCancel)) throw error;
    // Say which it was: someone else cancelled it first, or its time came.
    const latest = await Booking.findById(booking._id).select('status');
    throw bookingNotCancellable(latest?.status === 'confirmed' ? ALREADY_STARTED : ALREADY_CANCELLED);
  } finally {
    await session.endSession();
  }

  const cancelled = await Booking.findById(booking._id);
  if (!cancelled) throw notFound('Booking not found.');
  const [result] = await toPublicBookings([cancelled]);
  return result!;
}

/**
 * A list of bookings, at most LIST_LIMIT rows (PLAN.md §6, DESIGN.md §5.7).
 * - `upcoming`: confirmed bookings that haven't ended, soonest first. One in progress is still upcoming.
 * - `history`: cancelled bookings and confirmed ones that have ended, newest first.
 * Without `userId` it lists everyone's (the admin list).
 */
export async function listBookings({ view, userId }: { view: BookingView; userId?: string }): Promise<PublicBooking[]> {
  const current = now();
  const owner = userId === undefined ? {} : { user: userId };
  const bookings =
    view === 'upcoming'
      ? await Booking.find({ ...owner, status: 'confirmed', end: { $gt: current } })
          .sort({ start: 1, _id: 1 })
          .limit(LIST_LIMIT)
      : await Booking.find({
          ...owner,
          $or: [{ status: 'cancelled' }, { status: 'confirmed', end: { $lte: current } }],
        })
          .sort({ start: -1, _id: -1 })
          .limit(LIST_LIMIT);
  return toPublicBookings(bookings);
}

/** Shown in place of a member whose account no longer exists (someone removed it from the database by hand). */
const DELETED_MEMBER = { name: 'Deleted account', email: '' };

/**
 * Adds each booking's resource and member (name and email), with one query for each rather than one per row.
 * Resources are never deleted (D9), so a missing one is a broken invariant and fails loudly. A missing member
 * doesn't: one removed account must not make the whole admin list unavailable.
 */
async function toPublicBookings(bookings: BookingDocument[]): Promise<PublicBooking[]> {
  const ids = (key: 'resource' | 'user') => [...new Set(bookings.map((booking) => booking[key].toString()))];
  const [resources, users] = await Promise.all([
    Resource.find({ _id: { $in: ids('resource') } }).select('name type location').lean(),
    User.find({ _id: { $in: ids('user') } }).select('name email').lean(),
  ]);
  const resourceById = new Map(resources.map((resource) => [resource._id.toString(), resource]));
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  return bookings.map((booking) => {
    const resource = resourceById.get(booking.resource.toString());
    if (!resource) throw new Error(`Booking ${booking.id} points to a resource that doesn't exist`);
    const owner = userById.get(booking.user.toString());
    return toPublicBooking(
      booking,
      { id: resource._id.toString(), name: resource.name, type: resource.type, location: resource.location },
      owner
        ? { id: owner._id.toString(), name: owner.name, email: owner.email }
        : { id: booking.user.toString(), ...DELETED_MEMBER },
    );
  });
}
