import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';

/**
 * The child records of a booking (PLAN.md §5, §8): one per booked slot, existing only while its booking is
 * confirmed. Cancelling deletes them rather than marking them, so a record that exists always means "taken"
 * and the unique index below needs no filter.
 *
 * `{ resource, start }` is unique: that index is the double-booking guard. Two records for the same resource
 * and slot can't exist, whatever the timing.
 */
const slotReservationSchema = new Schema(
  {
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    /** The UTC start of a 30-minute slot. */
    start: { type: Date, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    /** Lets availability mark the caller's own slots as "your booking". */
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'slot_reservations' },
);

slotReservationSchema.index({ resource: 1, start: 1 }, { unique: true });
slotReservationSchema.index({ booking: 1 }); // release a booking's slots when it is cancelled

export type SlotReservationDocument = HydratedDocument<InferSchemaType<typeof slotReservationSchema>>;

export const SlotReservation = model('SlotReservation', slotReservationSchema);
