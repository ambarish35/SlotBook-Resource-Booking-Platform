export interface DemoBooking {
  /** Whose booking: the seeded member's or the seeded admin's. */
  as: 'member' | 'admin';
  /** The name of one of the demo resources (demo-resources.ts). */
  resource: string;
  /** How many days after today (IST) the booking is. Demo bookings are always in the future. */
  daysAhead: number;
  /** Slot starts as 24-hour IST times on the 30-minute grid, for example `10:00`. */
  times: string[];
}

/**
 * The demo bookings `npm run seed` creates (PLAN.md §11, M4), through the booking service like any booking.
 * Some belong to the member (they show as "Your booking" for them) and some to the admin (they show as booked
 * for the member), so the grid has both. They are real data in the database, called demo data in the README
 * (DESIGN.md §9).
 */
export const DEMO_BOOKINGS: DemoBooking[] = [
  { as: 'member', resource: 'Huddle 1', daysAhead: 1, times: ['10:00', '10:30'] },
  { as: 'member', resource: 'Projector 1', daysAhead: 2, times: ['14:00'] },
  { as: 'admin', resource: 'Boardroom', daysAhead: 1, times: ['14:00', '14:30', '15:00'] },
  { as: 'admin', resource: 'Training Room', daysAhead: 3, times: ['09:00', '09:30', '10:00', '10:30'] },
];
