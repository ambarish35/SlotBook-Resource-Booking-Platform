import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';
import { MAX_SLOTS_PER_BOOKING } from '../lib/time.js';
import type { ResourceType } from './Resource.js';

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * The parent record of a booking (PLAN.md §5, §8): one per booking. Each booked slot also has a child record in
 * `slot_reservations`; the two are created together and released together, always in one transaction.
 */
const bookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    /** The IST calendar date of every slot, `YYYY-MM-DD`. */
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** 1 to 8 slot starts, sorted and distinct, all on `date`. The booking service guarantees the order and the date. */
    slotStarts: {
      type: [{ type: Date }],
      validate: {
        validator: (starts: Date[]) => starts.length >= 1 && starts.length <= MAX_SLOTS_PER_BOOKING,
        message: `A booking has 1 to ${MAX_SLOTS_PER_BOOKING} slots`,
      },
    },
    /** The first slot's start. */
    start: { type: Date, required: true },
    /** The last slot's start plus 30 minutes. */
    end: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'confirmed', required: true },
    // Set on cancellation. A cancellation never changes date, slotStarts, start or end, so History keeps the original times.
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

bookingSchema.index({ user: 1, start: -1 }); // My bookings
bookingSchema.index({ status: 1, start: 1 }); // upcoming and admin lists

export type BookingDocument = HydratedDocument<InferSchemaType<typeof bookingSchema>>;

export const Booking = model('Booking', bookingSchema);

/** The booking shape the API returns, with the resource and the member it belongs to. */
export interface PublicBooking {
  id: string;
  resource: { id: string; name: string; type: ResourceType; location: string };
  user: { id: string; name: string; email: string };
  date: string;
  slotStarts: string[];
  start: string;
  end: string;
  status: BookingStatus;
  cancelledAt: string | null;
  createdAt: string;
}

export function toPublicBooking(
  booking: {
    _id: { toString(): string };
    date: string;
    slotStarts: Date[];
    start: Date;
    end: Date;
    status: BookingStatus;
    cancelledAt?: Date | null;
    createdAt: Date;
  },
  resource: PublicBooking['resource'],
  user: PublicBooking['user'],
): PublicBooking {
  return {
    id: booking._id.toString(),
    resource,
    user,
    date: booking.date,
    slotStarts: booking.slotStarts.map((start) => start.toISOString()),
    start: booking.start.toISOString(),
    end: booking.end.toISOString(),
    status: booking.status,
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    createdAt: booking.createdAt.toISOString(),
  };
}
