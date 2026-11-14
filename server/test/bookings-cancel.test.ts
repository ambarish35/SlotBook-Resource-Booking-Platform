import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { TEST_SESSION, createTestUser, expectBookingInvariant, ist, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);

/** The pinned "now": 09:30 IST on Saturday 14 November 2026. */
const NOW = '2026-11-14T04:00:00.000Z';
const TOMORROW = '2026-11-15';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let room: string;

const slotsOf = (date: string, ...times: string[]) => times.map((time) => ist(date, time));

function book(user: TestUser, times: string[], date = TOMORROW, resourceId = room) {
  return request(app).post('/api/bookings').set('Cookie', user.cookie).send({ resourceId, slotStarts: slotsOf(date, ...times) });
}

function cancel(cookie: string | undefined, id: string) {
  const req = request(app).post(`/api/bookings/${id}/cancel`);
  return cookie ? req.set('Cookie', cookie) : req;
}

async function slotLabelsFor(user: TestUser, date: string, status: string): Promise<string[]> {
  const res = await request(app).get(`/api/resources/${room}/availability?date=${date}`).set('Cookie', user.cookie);
  return (res.body.slots as { label: string; status: string }[]).filter((slot) => slot.status === status).map((slot) => slot.label);
}

beforeAll(async () => {
  database = await startTestDatabase();
  alice = await createTestUser('member', 'Alice Rao');
  bob = await createTestUser('member', 'Bob Iyer');
  admin = await createTestUser('admin', 'Ada Admin');
  room = (await Resource.create({ name: 'Room A', type: 'room', location: 'Block A', capacity: 6 })).id;
});

afterAll(async () => {
  resetClock();
  await database?.stop();
});

beforeEach(async () => {
  setClock(NOW);
  await Booking.deleteMany({});
  await SlotReservation.deleteMany({});
});

afterEach(async () => {
  vi.restoreAllMocks();
  setClock(NOW);
  await expectBookingInvariant(); // V6, after every scenario
});

describe('POST /api/bookings/:id/cancel: V3, cancelling and booking again', () => {
  it('releases every slot at once, keeps the booking\'s times, and lets the freed slots be booked straight away', async () => {
    // The scenario from V2: Alice holds 10:00 and 10:30, Bob is refused 10:30 + 11:00 and books 11:00 alone.
    const first = await book(alice, ['10:00', '10:30']);
    expect(first.status).toBe(201);
    expect((await book(bob, ['10:30', '11:00'])).status).toBe(409);
    const bobs = await book(bob, ['11:00']);
    expect(bobs.status).toBe(201);
    const before = await Booking.findById(first.body.id).lean();

    const res = await cancel(alice.cookie, first.body.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...first.body,
      status: 'cancelled',
      cancelledAt: NOW,
    });

    // The parent is cancelled, and its date, slotStarts, start and end are exactly what they were.
    const after = await Booking.findById(first.body.id).lean();
    expect(after).toMatchObject({ status: 'cancelled', date: before!.date });
    expect(after!.slotStarts).toEqual(before!.slotStarts);
    expect(after!.start).toEqual(before!.start);
    expect(after!.end).toEqual(before!.end);
    expect(after!.cancelledAt?.toISOString()).toBe(NOW);
    expect(after!.cancelledBy?.toString()).toBe(alice.id);

    // Its slot records are gone, and Bob's one remains.
    expect(await SlotReservation.countDocuments({ booking: first.body.id })).toBe(0);
    expect(await SlotReservation.countDocuments()).toBe(1);

    // Availability shows 10:00 and 10:30 as available, and Bob can book 10:30.
    const taken = await slotLabelsFor(bob, TOMORROW, 'unavailable');
    expect(taken).toEqual(['11:00']);
    const rebooked = await book(bob, ['10:30']);
    expect(rebooked.status).toBe(201);
    expect((await book(alice, ['10:00'])).status).toBe(201);
  });

  it('only releases the cancelled booking: the same member\'s other bookings stay', async () => {
    const one = await book(alice, ['10:00', '10:30']);
    const two = await book(alice, ['14:00']);
    expect((await cancel(alice.cookie, one.body.id)).status).toBe(200);

    expect((await Booking.findById(two.body.id))?.status).toBe('confirmed');
    expect(await SlotReservation.countDocuments({ booking: two.body.id })).toBe(1);
    expect(await slotLabelsFor(alice, TOMORROW, 'unavailable')).toEqual(['14:00']);
  });

  it('does not need a body, and ignores one', async () => {
    const booking = await book(alice, ['10:00']);
    const res = await request(app)
      .post(`/api/bookings/${booking.body.id}/cancel`)
      .set('Cookie', alice.cookie)
      .send({ status: 'confirmed', slotStarts: [], start: '2030-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.start).toBe(ist(TOMORROW, '10:00'));
  });

  it('lets the owner, and an admin, cancel a booking on a resource that was deactivated since (D9)', async () => {
    const mine = await book(alice, ['10:00']);
    const other = await book(bob, ['11:00']);
    await Resource.updateOne({ _id: room }, { isActive: false });
    try {
      expect((await cancel(alice.cookie, mine.body.id)).status).toBe(200);
      expect((await cancel(admin.cookie, other.body.id)).status).toBe(200);
    } finally {
      await Resource.updateOne({ _id: room }, { isActive: true });
    }
  });
});

describe('POST /api/bookings/:id/cancel: V3b, edge cases', () => {
  it('refuses a second cancellation with 409 BOOKING_NOT_CANCELLABLE and changes nothing', async () => {
    const booking = await book(alice, ['10:00']);
    expect((await cancel(alice.cookie, booking.body.id)).status).toBe(200);
    const stored = await Booking.findById(booking.body.id).lean();

    const again = await cancel(alice.cookie, booking.body.id);
    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({ code: 'BOOKING_NOT_CANCELLABLE', message: 'This booking has already been cancelled.' });
    expect(await Booking.findById(booking.body.id).lean()).toEqual(stored);

    // An admin gets the same answer.
    expect((await cancel(admin.cookie, booking.body.id)).status).toBe(409);
  });

  it('refuses to cancel a booking that has started, at the first instant and while it is in progress', async () => {
    const booking = await book(alice, ['10:00', '10:30']);

    setClock(ist(TOMORROW, '10:00')); // the very instant the booking starts
    const atStart = await cancel(alice.cookie, booking.body.id);
    expect(atStart.status).toBe(409);
    expect(atStart.body.error).toEqual({
      code: 'BOOKING_NOT_CANCELLABLE',
      message: 'This booking has already started, so it can no longer be cancelled.',
    });

    setClock(ist(TOMORROW, '10:40')); // in progress
    expect((await cancel(alice.cookie, booking.body.id)).status).toBe(409);
    expect((await cancel(admin.cookie, booking.body.id)).status).toBe(409); // admins can't cancel a started booking either

    // Nothing changed.
    expect((await Booking.findById(booking.body.id))?.status).toBe('confirmed');
    expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(2);
  });

  it('refuses a booking that starts while the request is in flight, and says it has started', async () => {
    const booking = await book(alice, ['10:00', '10:30']);
    // The first reading of the clock (the up-front check) is a minute before the start; every later one (inside the
    // transaction) is the start itself, as if the request had been slow.
    let reads = 0;
    setClock(() => new Date(reads++ === 0 ? ist(TOMORROW, '09:59') : ist(TOMORROW, '10:00')));

    const res = await cancel(alice.cookie, booking.body.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'BOOKING_NOT_CANCELLABLE',
      message: 'This booking has already started, so it can no longer be cancelled.',
    });
    expect(reads).toBeGreaterThanOrEqual(2);
    // The transaction rolled back whole: still confirmed, still holding its slots, no cancellation time.
    const stored = await Booking.findById(booking.body.id).lean();
    expect(stored?.status).toBe('confirmed');
    expect(stored?.cancelledAt).toBeUndefined();
    expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(2);
  });

  it('records the time of the cancellation as read inside the transaction', async () => {
    const booking = await book(alice, ['10:00']);
    let reads = 0;
    setClock(() => new Date(reads++ === 0 ? ist(TOMORROW, '08:00') : ist(TOMORROW, '08:05')));
    const res = await cancel(alice.cookie, booking.body.id);
    expect(res.status).toBe(200);
    expect(res.body.cancelledAt).toBe(ist(TOMORROW, '08:05'));
  });

  it('allows the cancellation up to the last millisecond before the start', async () => {
    const booking = await book(alice, ['10:00']);
    setClock('2026-11-15T04:29:59.999Z'); // 09:59:59.999 IST
    expect((await cancel(alice.cookie, booking.body.id)).status).toBe(200);
  });

  it('refuses to cancel a booking that has ended, as started', async () => {
    const booking = await book(alice, ['10:00']);
    setClock(ist(TOMORROW, '12:00'));
    expect((await cancel(alice.cookie, booking.body.id)).status).toBe(409);
  });

  it('gives a member who targets someone else\'s booking the same 404 as for an id that doesn\'t exist, and changes nothing', async () => {
    const booking = await book(alice, ['10:00', '10:30']);
    const unknown = await cancel(bob.cookie, '0123456789abcdef01234567');
    expect(unknown.status).toBe(404);

    const attempt = await cancel(bob.cookie, booking.body.id);
    expect(attempt.status).toBe(404);
    expect(attempt.body).toEqual(unknown.body);
    expect(attempt.body.error.code).toBe('NOT_FOUND');

    expect((await Booking.findById(booking.body.id))?.status).toBe('confirmed');
    expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(2);
  });

  it('answers the same 404 for a malformed id, for everyone, and for an admin\'s unknown id', async () => {
    const unknown = await cancel(alice.cookie, '0123456789abcdef01234567');
    for (const id of ['not-an-id', '123', 'mine', '%20']) {
      const res = await cancel(alice.cookie, id);
      expect(res.status, id).toBe(404);
      expect(res.body).toEqual(unknown.body);
    }
    expect((await cancel(admin.cookie, '0123456789abcdef01234567')).status).toBe(404);
  });

  it('lets an admin cancel a member\'s booking, which the member then sees as cancelled', async () => {
    const booking = await book(alice, ['10:00', '10:30']);
    const res = await cancel(admin.cookie, booking.body.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.user.id).toBe(alice.id); // still the member's booking

    expect((await Booking.findById(booking.body.id))?.cancelledBy?.toString()).toBe(admin.id);
    expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(0);

    const history = await request(app).get('/api/bookings/mine?view=history').set('Cookie', alice.cookie);
    expect(history.body.map((item: { id: string; status: string }) => [item.id, item.status])).toEqual([[booking.body.id, 'cancelled']]);
    const upcoming = await request(app).get('/api/bookings/mine?view=upcoming').set('Cookie', alice.cookie);
    expect(upcoming.body).toEqual([]);
  });

  it('owner and admin cancelling at the same moment: one 200 and one 409', async () => {
    for (let round = 1; round <= 6; round += 1) {
      const date = `2026-11-${String(15 + round)}`;
      const booking = await book(alice, ['10:00', '10:30', '11:00'], date);
      expect(booking.status).toBe(201);

      const attempts = round % 2 === 0 ? [alice.cookie, admin.cookie] : [admin.cookie, alice.cookie];
      const results = await Promise.all(attempts.map((cookie) => cancel(cookie, booking.body.id)));

      expect(results.map((res) => res.status).sort(), `round ${round}`).toEqual([200, 409]);
      expect(results.find((res) => res.status === 409)?.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
      expect((await Booking.findById(booking.body.id))?.status).toBe('cancelled');
      expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(0);
      await expectBookingInvariant();
    }
  });

  it('the same member cancelling twice at once: one 200 and one 409', async () => {
    const booking = await book(alice, ['10:00']);
    const results = await Promise.all([cancel(alice.cookie, booking.body.id), cancel(alice.cookie, booking.body.id), cancel(alice.cookie, booking.body.id)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
  });

  it('cancelling one booking while someone books its slots at the same moment never leaves a half-state', async () => {
    for (let round = 1; round <= 4; round += 1) {
      const date = `2026-11-${String(15 + round)}`;
      const booking = await book(alice, ['10:00', '10:30'], date);
      const [cancelled, rebooked] = await Promise.all([cancel(alice.cookie, booking.body.id), book(bob, ['10:00', '10:30'], date)]);

      expect(cancelled.status).toBe(200);
      expect([201, 409]).toContain(rebooked.status); // Bob either got in after the release or lost the race
      const bobs = await Booking.countDocuments({ user: bob.id, date });
      expect(bobs).toBe(rebooked.status === 201 ? 1 : 0);
      await expectBookingInvariant();
    }
  });
});

describe('POST /api/bookings/:id/cancel: the two steps commit together or not at all', () => {
  it('leaves the booking confirmed and its slots held when releasing the slots fails', async () => {
    const booking = await book(alice, ['10:00', '10:30']);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SlotReservation, 'deleteMany').mockRejectedValueOnce(new Error('simulated failure while releasing slots'));

    const res = await cancel(alice.cookie, booking.body.id);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('simulated'); // details stay in the server log
    // The parent's status update was rolled back with it.
    const stored = await Booking.findById(booking.body.id).lean();
    expect(stored?.status).toBe('confirmed');
    expect(stored?.cancelledAt).toBeUndefined();
    expect(await SlotReservation.countDocuments({ booking: booking.body.id })).toBe(2);

    // And a retry works.
    vi.restoreAllMocks();
    expect((await cancel(alice.cookie, booking.body.id)).status).toBe(200);
  });
});

describe('POST /api/bookings/:id/cancel: signed out', () => {
  it('returns 401 without a session, and does not reveal whether the booking exists', async () => {
    const booking = await book(alice, ['10:00']);
    const real = await cancel(undefined, booking.body.id);
    const fake = await cancel(undefined, '0123456789abcdef01234567');
    expect(real.status).toBe(401);
    expect(fake.status).toBe(401);
    expect(real.body).toEqual(fake.body);
    expect((await Booking.findById(booking.body.id))?.status).toBe('confirmed');
  });
});
