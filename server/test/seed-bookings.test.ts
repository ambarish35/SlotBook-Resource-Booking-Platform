import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { DEMO_BOOKINGS } from '../src/demo-bookings.js';
import { DEMO_RESOURCES } from '../src/demo-resources.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { isOnSlotGrid } from '../src/lib/time.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { seedBookings, seedResources } from '../src/seed.js';
import { createBooking } from '../src/services/bookings.js';
import { TEST_SESSION, createTestUser, expectBookingInvariant, ist, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);

/** The pinned "now": 09:30 IST on Saturday 14 November 2026. */
const NOW = '2026-11-14T04:00:00.000Z';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let member: TestUser;
let admin: TestUser;
let bystander: TestUser;
let accounts: { role: 'member' | 'admin'; email: string }[];

interface Slot {
  label: string;
  status: string;
  mine: boolean;
}

async function slots(user: TestUser, resourceName: string, date: string): Promise<Slot[]> {
  const resource = await Resource.findOne({ name: resourceName });
  const res = await request(app).get(`/api/resources/${resource!.id}/availability?date=${date}`).set('Cookie', user.cookie);
  expect(res.status).toBe(200);
  return res.body.slots as Slot[];
}
const labelsWhere = (list: Slot[], predicate: (slot: Slot) => boolean) => list.filter(predicate).map((slot) => slot.label);

beforeAll(async () => {
  database = await startTestDatabase();
  member = await createTestUser('member', 'Demo Member');
  admin = await createTestUser('admin', 'Demo Admin');
  bystander = await createTestUser('member', 'Other Member');
  accounts = [
    { role: 'admin', email: admin.email },
    { role: 'member', email: member.email },
  ];
});

afterAll(async () => {
  resetClock();
  await database?.stop();
});

beforeEach(async () => {
  setClock(NOW);
  await Booking.deleteMany({});
  await SlotReservation.deleteMany({});
  await Resource.deleteMany({});
  await seedResources();
});

afterEach(async () => {
  await expectBookingInvariant();
});

describe('the demo bookings', () => {
  it('only name demo resources, with valid times, and are always in the future', () => {
    const names = new Set(DEMO_RESOURCES.map((resource) => resource.name));
    expect(DEMO_BOOKINGS.length).toBeGreaterThanOrEqual(3);
    for (const demo of DEMO_BOOKINGS) {
      expect(names.has(demo.resource), demo.resource).toBe(true);
      expect(demo.daysAhead).toBeGreaterThanOrEqual(1);
      expect(demo.times.length).toBeGreaterThanOrEqual(1);
      expect(demo.times.length).toBeLessThanOrEqual(8);
      for (const time of demo.times) expect(isOnSlotGrid(new Date(ist('2026-11-15', time))), time).toBe(true);
      // The booking service expects sorted, distinct starts (the API's schema guarantees that; the seed bypasses the schema).
      expect(demo.times, demo.resource).toEqual([...new Set(demo.times)].sort());
    }
  });
});

describe('seedBookings', () => {
  it('creates the demo bookings through the booking service, for the right people, dated from today', async () => {
    expect(await seedBookings(accounts)).toEqual({ created: DEMO_BOOKINGS.length, skipped: 0 });

    const stored = await Booking.find().lean();
    expect(stored).toHaveLength(DEMO_BOOKINGS.length);
    expect(stored.every((booking) => booking.status === 'confirmed')).toBe(true);
    const slotCount = DEMO_BOOKINGS.reduce((sum, demo) => sum + demo.times.length, 0);
    expect(await SlotReservation.countDocuments()).toBe(slotCount); // one slot record per slot

    // The first demo booking: the member, Huddle 1, tomorrow, 10:00-11:00.
    const huddle = await Resource.findOne({ name: 'Huddle 1' });
    const first = stored.find((booking) => booking.resource.toString() === huddle!.id);
    expect(first).toMatchObject({ date: '2026-11-15' });
    expect(first!.user.toString()).toBe(member.id);
    expect(first!.start.toISOString()).toBe(ist('2026-11-15', '10:00'));
    expect(first!.end.toISOString()).toBe(ist('2026-11-15', '11:00'));
  });

  it('shows in availability as booked for everyone and as "mine" only for its owner, with earlier slots past', async () => {
    await seedBookings(accounts);

    // Huddle 1, tomorrow 10:00 and 10:30: the member's.
    const forMember = await slots(member, 'Huddle 1', '2026-11-15');
    expect(labelsWhere(forMember, (slot) => slot.status === 'unavailable')).toEqual(['10:00', '10:30']);
    expect(labelsWhere(forMember, (slot) => slot.mine)).toEqual(['10:00', '10:30']);
    const forBystander = await slots(bystander, 'Huddle 1', '2026-11-15');
    expect(labelsWhere(forBystander, (slot) => slot.status === 'unavailable')).toEqual(['10:00', '10:30']);
    expect(labelsWhere(forBystander, (slot) => slot.mine)).toEqual([]);
    expect(labelsWhere(await slots(admin, 'Huddle 1', '2026-11-15'), (slot) => slot.mine)).toEqual([]);

    // Boardroom, tomorrow 14:00-15:30: the admin's, so booked for the member and "mine" for the admin.
    const boardroomForMember = await slots(member, 'Boardroom', '2026-11-15');
    expect(labelsWhere(boardroomForMember, (slot) => slot.status === 'unavailable')).toEqual(['14:00', '14:30', '15:00']);
    expect(labelsWhere(boardroomForMember, (slot) => slot.mine)).toEqual([]);
    expect(labelsWhere(await slots(admin, 'Boardroom', '2026-11-15'), (slot) => slot.mine)).toEqual(['14:00', '14:30', '15:00']);

    // Today: with the time pinned at 09:30 IST, the earlier slots are past and nothing is booked.
    const today = await slots(member, 'Huddle 1', '2026-11-14');
    expect(labelsWhere(today, (slot) => slot.status === 'past')).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(labelsWhere(today, (slot) => slot.status === 'unavailable')).toEqual([]);
  });

  it('lists them in My bookings, for the member and the admin', async () => {
    await seedBookings(accounts);
    const mine = await request(app).get('/api/bookings/mine?view=upcoming').set('Cookie', member.cookie);
    expect(mine.body.map((booking: { resource: { name: string } }) => booking.resource.name)).toEqual(['Huddle 1', 'Projector 1']);
    const all = await request(app).get('/api/bookings?view=upcoming').set('Cookie', admin.cookie);
    expect(all.body).toHaveLength(DEMO_BOOKINGS.length);
  });

  it('is safe to run again: the second run creates nothing and changes nothing', async () => {
    await seedBookings(accounts);
    const before = await Booking.find().sort({ _id: 1 }).lean();
    const recordsBefore = await SlotReservation.find().sort({ _id: 1 }).lean();

    expect(await seedBookings(accounts)).toEqual({ created: 0, skipped: DEMO_BOOKINGS.length });
    expect(await Booking.find().sort({ _id: 1 }).lean()).toEqual(before);
    expect(await SlotReservation.find().sort({ _id: 1 }).lean()).toEqual(recordsBefore);
  });

  it('creates nothing while a demo account already has an upcoming booking, even one it made itself', async () => {
    const huddle = await Resource.findOne({ name: 'Huddle 2' });
    await createBooking({ id: member.id, name: member.name, email: member.email, role: 'member' }, { resourceId: huddle!.id, slotStarts: [new Date(ist('2026-11-20', '16:00'))] });

    expect(await seedBookings(accounts)).toEqual({ created: 0, skipped: DEMO_BOOKINGS.length });
    expect(await Booking.countDocuments()).toBe(1);
  });

  it('creates a fresh set, dated from the new today, once the earlier ones are over', async () => {
    await seedBookings(accounts);
    setClock('2026-11-20T04:00:00.000Z'); // six days later: every demo booking has ended

    expect(await seedBookings(accounts)).toEqual({ created: DEMO_BOOKINGS.length, skipped: 0 });
    expect(await Booking.countDocuments()).toBe(DEMO_BOOKINGS.length * 2);
    const newest = await Booking.find({ date: '2026-11-21' }).lean(); // tomorrow, as of the new today
    expect(newest.length).toBeGreaterThanOrEqual(2);
  });

  it('skips a demo booking whose slots someone else holds, and still creates the others', async () => {
    const boardroom = await Resource.findOne({ name: 'Boardroom' });
    await createBooking(
      { id: bystander.id, name: bystander.name, email: bystander.email, role: 'member' },
      { resourceId: boardroom!.id, slotStarts: [new Date(ist('2026-11-15', '14:30'))] },
    );

    expect(await seedBookings(accounts)).toEqual({ created: DEMO_BOOKINGS.length - 1, skipped: 1 });
    expect(await Booking.countDocuments({ resource: boardroom!.id })).toBe(1); // only the bystander's; the demo one was refused whole
    expect(await SlotReservation.countDocuments({ resource: boardroom!.id })).toBe(1);
  });

  it('skips a demo booking whose resource is missing or inactive', async () => {
    await Resource.deleteOne({ name: 'Projector 1' });
    await Resource.updateOne({ name: 'Training Room' }, { isActive: false });

    expect(await seedBookings(accounts)).toEqual({ created: DEMO_BOOKINGS.length - 2, skipped: 2 });
    const training = await Resource.findOne({ name: 'Training Room' });
    expect(await Booking.countDocuments({ resource: training!.id })).toBe(0);
  });

  it('skips the bookings of an account that does not exist', async () => {
    const result = await seedBookings([{ role: 'member', email: member.email }, { role: 'admin', email: 'nobody@example.com' }]);
    const memberOnes = DEMO_BOOKINGS.filter((demo) => demo.as === 'member').length;
    expect(result).toEqual({ created: memberOnes, skipped: DEMO_BOOKINGS.length - memberOnes });
  });
});
