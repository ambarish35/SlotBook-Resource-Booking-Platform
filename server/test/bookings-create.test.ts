import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { createBooking } from '../src/services/bookings.js';
import { TEST_SESSION, createTestUser, expectBookingInvariant, ist, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);

/** The pinned "now": 09:30 IST on Saturday 14 November 2026. */
const NOW = '2026-11-14T04:00:00.000Z';
const TODAY = '2026-11-14';
const TOMORROW = '2026-11-15';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let room: string; // resource ids
let otherRoom: string;
let inactiveRoom: string;

async function makeResource(name: string, isActive = true): Promise<string> {
  const resource = await Resource.create({ name, type: 'room', location: 'Block A', capacity: 6, isActive });
  return resource.id as string;
}

function book(cookie: string | undefined, body: Record<string, unknown>) {
  const req = request(app).post('/api/bookings');
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

const slotsOf = (date: string, ...times: string[]) => times.map((time) => ist(date, time));

beforeAll(async () => {
  database = await startTestDatabase();
  alice = await createTestUser('member', 'Alice Rao');
  bob = await createTestUser('member', 'Bob Iyer');
  admin = await createTestUser('admin', 'Ada Admin');
  room = await makeResource('Room A');
  otherRoom = await makeResource('Room B');
  inactiveRoom = await makeResource('Room C (retired)', false);
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

/** A request that must be refused leaves nothing behind. */
async function expectNothingWritten() {
  expect(await Booking.countDocuments()).toBe(0);
  expect(await SlotReservation.countDocuments()).toBe(0);
}

describe('POST /api/bookings: a successful booking', () => {
  it('books two slots and returns 201 with the booking', async () => {
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00', '10:30') });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      resource: { id: room, name: 'Room A', type: 'room', location: 'Block A' },
      user: { id: alice.id, name: 'Alice Rao', email: alice.email },
      date: TOMORROW,
      slotStarts: ['2026-11-15T04:30:00.000Z', '2026-11-15T05:00:00.000Z'],
      start: '2026-11-15T04:30:00.000Z',
      end: '2026-11-15T05:30:00.000Z',
      status: 'confirmed',
      cancelledAt: null,
      createdAt: expect.any(String),
    });
  });

  it('stores one parent and one slot record per slot, each tied to the parent, resource and member', async () => {
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00', '10:30', '14:00') });
    expect(res.status).toBe(201);

    const parents = await Booking.find().lean();
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ status: 'confirmed', date: TOMORROW });
    expect(parents[0]!.user.toString()).toBe(alice.id);
    expect(parents[0]!.resource.toString()).toBe(room);

    const records = await SlotReservation.find().sort({ start: 1 }).lean();
    expect(records.map((record) => record.start.toISOString())).toEqual(slotsOf(TOMORROW, '10:00', '10:30', '14:00'));
    for (const record of records) {
      expect(record.booking.toString()).toBe(res.body.id);
      expect(record.resource.toString()).toBe(room);
      expect(record.user.toString()).toBe(alice.id);
    }
  });

  it('sorts the slots, so start and end come from the earliest and the latest, however they were sent', async () => {
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '11:00', '10:00', '10:30') });
    expect(res.status).toBe(201);
    expect(res.body.slotStarts).toEqual(slotsOf(TOMORROW, '10:00', '10:30', '11:00'));
    expect(res.body.start).toBe(ist(TOMORROW, '10:00'));
    expect(res.body.end).toBe(ist(TOMORROW, '11:30'));
  });

  it('accepts slots that are not next to each other', async () => {
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '08:00', '12:30', '19:30') });
    expect(res.status).toBe(201);
    expect(res.body.start).toBe(ist(TOMORROW, '08:00'));
    expect(res.body.end).toBe(ist(TOMORROW, '20:00')); // the last slot ends at closing time
  });

  it('accepts times without milliseconds, and the maximum of 8 slots', async () => {
    const eight = slotsOf(TOMORROW, '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30');
    const res = await book(alice.cookie, { resourceId: room, slotStarts: eight.map((start) => start.replace('.000Z', 'Z')) });
    expect(res.status).toBe(201);
    expect(res.body.slotStarts).toEqual(eight);
  });

  it('lets an admin book for themself', async () => {
    const res = await book(admin.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '15:00') });
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(admin.id);
  });

  it('ignores a user, status, dates or id sent in the body: the booking is the caller\'s and confirmed', async () => {
    const res = await book(alice.cookie, {
      resourceId: room,
      slotStarts: slotsOf(TOMORROW, '10:00'),
      user: bob.id,
      userId: bob.id,
      status: 'cancelled',
      id: '000000000000000000000000',
      _id: '000000000000000000000000',
      date: '2030-01-01',
      start: '2030-01-01T00:00:00.000Z',
      end: '2030-01-02T00:00:00.000Z',
      cancelledAt: NOW,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'confirmed', date: TOMORROW, start: ist(TOMORROW, '10:00'), cancelledAt: null });
    expect(res.body.user.id).toBe(alice.id);
    expect(res.body.id).not.toBe('000000000000000000000000');
    expect(await Booking.countDocuments({ user: bob.id })).toBe(0);
  });

  it('allows one member to hold the same time on two resources, and two members the same time on two resources', async () => {
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') })).status).toBe(201);
    expect((await book(alice.cookie, { resourceId: otherRoom, slotStarts: slotsOf(TOMORROW, '10:00') })).status).toBe(201);
    expect((await book(bob.cookie, { resourceId: otherRoom, slotStarts: slotsOf(TOMORROW, '10:30') })).status).toBe(201);
  });

  it('allows the same time on another date', async () => {
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') })).status).toBe(201);
    expect((await book(bob.cookie, { resourceId: room, slotStarts: slotsOf('2026-11-16', '10:00') })).status).toBe(201);
  });
});

describe('POST /api/bookings: validation (V5)', () => {
  const fieldsOf = (res: request.Response) => res.body.error.details.fields as Record<string, string>;
  const GRID = 'Times must start on the hour or half hour, from 08:00 to 19:30 IST';

  async function expectRejected(slotStarts: unknown, message: string) {
    const res = await book(alice.cookie, { resourceId: room, slotStarts });
    expect(res.status, JSON.stringify(slotStarts)).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(fieldsOf(res)).toEqual({ slotStarts: message });
    await expectNothingWritten();
  }

  it.each([
    ['10:15, a quarter past', '10:15'],
    ['07:30, before opening', '07:30'],
    ['20:00, closing time', '20:00'],
    ['00:00, midnight', '00:00'],
    ['10:05, five past', '10:05'],
  ])('refuses a start that is not on the grid or the opening hours: %s', async (_name, time) => {
    await expectRejected(slotsOf(TOMORROW, time), GRID);
  });

  it('refuses a start with seconds or milliseconds', async () => {
    await expectRejected(['2026-11-15T04:30:01.000Z'], GRID);
    await expectRejected(['2026-11-15T04:30:00.001Z'], GRID);
  });

  it('refuses more than 8 slots and says so in the words of the design', async () => {
    const nine = slotsOf(TOMORROW, '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00');
    await expectRejected(nine, 'You can book up to 8 slots at a time');
  });

  it('refuses an empty list', async () => {
    await expectRejected([], 'Choose at least one time');
  });

  it('refuses a time chosen twice, even when spelled differently', async () => {
    await expectRejected([ist(TOMORROW, '10:00'), ist(TOMORROW, '10:00')], 'Choose each time only once');
    await expectRejected(['2026-11-15T04:30:00.000Z', '2026-11-15T04:30:00Z'], 'Choose each time only once');
  });

  it('refuses slots on different IST dates', async () => {
    await expectRejected([ist(TOMORROW, '19:30'), ist('2026-11-16', '08:00')], 'Choose times on one date');
  });

  it('refuses a missing or non-list slotStarts', async () => {
    const missing = await book(alice.cookie, { resourceId: room });
    expect(missing.status).toBe(400);
    expect(fieldsOf(missing)).toEqual({ slotStarts: 'Choose between 1 and 8 times' });
    for (const value of ['2026-11-15T04:30:00.000Z', 5, null, {}, true]) {
      const res = await book(alice.cookie, { resourceId: room, slotStarts: value });
      expect(res.status, JSON.stringify(value)).toBe(400);
      expect(fieldsOf(res)).toEqual({ slotStarts: 'Choose between 1 and 8 times' });
    }
    await expectNothingWritten();
  });

  it('refuses entries that are not ISO UTC instants ending in Z', async () => {
    const FORMAT = 'Times must be UTC instants like 2026-11-14T04:30:00.000Z';
    for (const entry of [
      '2026-11-15T10:00:00+05:30', // an IST offset: the client must send back the UTC starts it was given
      '2026-11-15T04:30:00', // no Z
      '2026-11-15',
      '10:00',
      '2026-02-30T04:30:00.000Z',
      'later',
      '',
      1_794_000_000_000,
      null,
      {},
      ['2026-11-15T04:30:00.000Z'],
    ]) {
      await expectRejected([entry], FORMAT);
    }
  });

  it('reports a bad resourceId and bad slotStarts together', async () => {
    const res = await book(alice.cookie, { resourceId: 'nope', slotStarts: [] });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toEqual({ resourceId: 'Choose a resource', slotStarts: 'Choose at least one time' });
  });

  it.each([[undefined], [''], ['not-an-id'], ['123'], [12345], [null], [{}]])('refuses the resourceId %j', async (resourceId) => {
    const res = await book(alice.cookie, { resourceId, slotStarts: slotsOf(TOMORROW, '10:00') });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toEqual({ resourceId: 'Choose a resource' });
  });

  it('refuses a body that is not JSON, and an empty body, with 400', async () => {
    const notJson = await request(app).post('/api/bookings').set('Cookie', alice.cookie).set('Content-Type', 'application/json').send('{"resourceId": ');
    expect(notJson.status).toBe(400);
    expect(notJson.body.error.code).toBe('VALIDATION_ERROR');
    const empty = await request(app).post('/api/bookings').set('Cookie', alice.cookie);
    expect(empty.status).toBe(400);
    expect(fieldsOf(empty)).toEqual({ resourceId: 'Choose a resource', slotStarts: 'Choose between 1 and 8 times' });
  });
});

describe('POST /api/bookings: the date window (today to today + 30, IST)', () => {
  const WINDOW = 'Choose times from today to 30 days ahead (IST)';

  it('accepts today (a later slot) and exactly today + 30', async () => {
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TODAY, '10:00') })).status).toBe(201);
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-12-14', '19:30') })).status).toBe(201);
  });

  it('refuses today + 31 and any date before today with 400', async () => {
    for (const date of ['2026-12-15', '2027-06-01', '2026-11-13', '2025-01-01']) {
      const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(date, '10:00') });
      expect(res.status, date).toBe(400);
      expect(res.body.error.details.fields).toEqual({ slotStarts: WINDOW });
    }
    await expectNothingWritten();
  });

  it('follows the IST date, not the UTC date, at the rollover', async () => {
    // 23:59:59.999 IST on 13 November: today is still the 13th.
    setClock('2026-11-13T18:29:59.999Z');
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-11-14', '08:00') })).status).toBe(201);
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-12-13', '08:00') })).status).toBe(201);
    const tooFar = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-12-14', '08:00') });
    expect(tooFar.status).toBe(400);
    // Every slot of the 13th has started by 23:59, so it is refused as past, not as a bad date.
    const sameDay = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-11-13', '19:30') });
    expect(sameDay.status).toBe(409);

    // One millisecond later it is the 14th: the 13th is now before today, and the window has moved.
    setClock('2026-11-13T18:30:00.000Z');
    const yesterday = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-11-13', '19:30') });
    expect(yesterday.status).toBe(400);
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf('2026-12-14', '08:00') })).status).toBe(201);
  });
});

describe('POST /api/bookings: slots that have already started', () => {
  it('refuses the slot that starts exactly now, with 409 and reason past', async () => {
    // Now is 09:30 IST, so the 09:30 slot is in progress and cannot be booked.
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TODAY, '09:30') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(res.body.error.details).toEqual({ slots: [{ start: ist(TODAY, '09:30'), reason: 'past' }] });
    await expectNothingWritten();
  });

  it('books the next slot, which starts after now', async () => {
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TODAY, '10:00') })).status).toBe(201);
  });

  it('refuses the whole request when only some slots are past, listing only the past ones', async () => {
    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TODAY, '09:00', '10:00', '10:30', '08:00') });
    expect(res.status).toBe(409);
    // Oldest first: the request's slots are sorted before anything is checked.
    expect(res.body.error.details.slots).toEqual([
      { start: ist(TODAY, '08:00'), reason: 'past' },
      { start: ist(TODAY, '09:00'), reason: 'past' },
    ]);
    await expectNothingWritten(); // 10:00 and 10:30 were free, and are still not booked
  });

  it('checks in the order the plan gives: the shape (400), the window (400), past (409), then the resource (404)', async () => {
    const unknown = '0123456789abcdef01234567';
    // Past slot, resource that doesn't exist: 409 comes before 404.
    const past = await book(alice.cookie, { resourceId: unknown, slotStarts: slotsOf(TODAY, '08:00') });
    expect(past.status).toBe(409);
    // A date before today is a 400 even though its slots are also in the past.
    const yesterday = await book(alice.cookie, { resourceId: unknown, slotStarts: slotsOf('2026-11-13', '08:00') });
    expect(yesterday.status).toBe(400);
    // A bad shape beats everything.
    const bad = await book(alice.cookie, { resourceId: unknown, slotStarts: slotsOf(TODAY, '08:15') });
    expect(bad.status).toBe(400);
    // A future slot on a missing resource: now it is 404.
    const missing = await book(alice.cookie, { resourceId: unknown, slotStarts: slotsOf(TOMORROW, '08:00') });
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/bookings: which resources can be booked', () => {
  it('returns 404 for a resource that does not exist', async () => {
    const res = await book(alice.cookie, { resourceId: '0123456789abcdef01234567', slotStarts: slotsOf(TOMORROW, '10:00') });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await expectNothingWritten();
  });

  it('returns the same 404 for an inactive resource, for a member and for an admin', async () => {
    const unknown = await book(alice.cookie, { resourceId: '0123456789abcdef01234567', slotStarts: slotsOf(TOMORROW, '10:00') });
    for (const user of [alice, admin]) {
      const res = await book(user.cookie, { resourceId: inactiveRoom, slotStarts: slotsOf(TOMORROW, '10:00') });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(unknown.body);
    }
    await expectNothingWritten();
  });

  it('books a resource again once it is reactivated', async () => {
    await Resource.updateOne({ _id: inactiveRoom }, { isActive: true });
    try {
      expect((await book(alice.cookie, { resourceId: inactiveRoom, slotStarts: slotsOf(TOMORROW, '10:00') })).status).toBe(201);
    } finally {
      await Resource.updateOne({ _id: inactiveRoom }, { isActive: false });
    }
  });
});

describe('POST /api/bookings: conflicts are all or nothing', () => {
  it('V2: a partial overlap rejects the whole request and leaves the free slot free', async () => {
    const first = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00', '10:30') });
    expect(first.status).toBe(201);

    const second = await book(bob.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:30', '11:00') });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(second.body.error.details).toEqual({ slots: [{ start: ist(TOMORROW, '10:30'), reason: 'booked' }] });

    // Nothing for Bob: no parent, no slot record, so 11:00 is still free.
    expect(await Booking.countDocuments({ user: bob.id })).toBe(0);
    expect(await Booking.countDocuments()).toBe(1);
    expect(await SlotReservation.countDocuments()).toBe(2);
    expect(await SlotReservation.countDocuments({ start: new Date(ist(TOMORROW, '11:00')) })).toBe(0);

    // Bob can now book 11:00 on its own: adjacent slots are fine.
    const alone = await book(bob.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '11:00') });
    expect(alone.status).toBe(201);
  });

  it('lists every taken slot, oldest first, and none that are free', async () => {
    await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '09:00', '12:00') });
    const res = await book(bob.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '12:00', '10:00', '09:00', '14:00') });
    expect(res.status).toBe(409);
    expect(res.body.error.details.slots).toEqual([
      { start: ist(TOMORROW, '09:00'), reason: 'booked' },
      { start: ist(TOMORROW, '12:00'), reason: 'booked' },
    ]);
    expect(await Booking.countDocuments({ user: bob.id })).toBe(0);
  });

  it('refuses a member who asks for a slot they already hold themself', async () => {
    await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') });
    const again = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') });
    expect(again.status).toBe(409);
    expect(await Booking.countDocuments()).toBe(1);
  });

  it('does not say who holds a slot', async () => {
    await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') });
    const res = await book(bob.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00') });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(alice.id);
    expect(text).not.toContain(alice.email);
    expect(text).not.toContain('Alice');
  });

  it('V1: ten members book the same slot at the same moment: one 201, nine 409, one booking, one slot record', async () => {
    const members = await Promise.all(Array.from({ length: 10 }, (_, index) => createTestUser('member', `Racer ${index + 1}`)));

    for (const [round, time] of ['10:00', '13:30', '19:30'].entries()) {
      const slot = ist(TOMORROW, time);
      const results = await Promise.all(members.map((member) => book(member.cookie, { resourceId: room, slotStarts: [slot] })));

      const statuses = results.map((res) => res.status).sort();
      expect(statuses, `round ${round + 1}`).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
      for (const loser of results.filter((res) => res.status === 409)) {
        expect(loser.body.error.code).toBe('SLOT_UNAVAILABLE');
        expect(loser.body.error.details).toEqual({ slots: [{ start: slot, reason: 'booked' }] });
      }
      expect(await Booking.countDocuments({ status: 'confirmed', start: new Date(slot) })).toBe(1);
      expect(await SlotReservation.countDocuments({ resource: room, start: new Date(slot) })).toBe(1);
      await expectBookingInvariant();
    }
    expect(await Booking.countDocuments()).toBe(3);
  });

  it('V1b: overlapping selections made at the same moment: exactly one succeeds, the other leaves nothing', async () => {
    for (const [round, date] of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].entries()) {
      const [first, second] = round % 2 === 0 ? [alice, bob] : [bob, alice]; // vary who is first in line
      const [a, b] = await Promise.all([
        book(first.cookie, { resourceId: room, slotStarts: slotsOf(date, '10:00', '10:30') }),
        book(second.cookie, { resourceId: room, slotStarts: slotsOf(date, '10:30', '11:00') }),
      ]);

      expect([a.status, b.status].sort(), date).toEqual([201, 409]);
      const winner = a.status === 201 ? a : b;
      const loser = a.status === 201 ? b : a;
      expect(loser.body.error.code).toBe('SLOT_UNAVAILABLE');
      expect(loser.body.error.details).toEqual({ slots: [{ start: ist(date, '10:30'), reason: 'booked' }] });

      // Only the winner's parent and slot records exist for that date.
      const parents = await Booking.find({ date }).lean();
      expect(parents).toHaveLength(1);
      expect(parents[0]!._id.toString()).toBe(winner.body.id);
      expect(await SlotReservation.countDocuments({ booking: parents[0]!._id })).toBe(2);
      expect(await SlotReservation.countDocuments({ start: { $gte: new Date(ist(date, '08:00')), $lte: new Date(ist(date, '19:30')) } })).toBe(2);
    }
  });

  it('stays all-or-nothing under many overlapping requests at once', async () => {
    const members = await Promise.all(Array.from({ length: 14 }, (_, index) => createTestUser('member', `Crowd ${index + 1}`)));
    const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
    // Each member asks for three slots from a window of sixteen, so neighbours overlap and three sets overlap at most places.
    // A small fixed generator keeps the selections the same on every run.
    let seed = 7;
    const next = (max: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % max;
    };
    const requests = members.map((member) => {
      const chosen = new Set<number>();
      while (chosen.size < 3) chosen.add(next(times.length));
      return { member, slots: [...chosen].map((index) => ist(TOMORROW, times[index]!)) };
    });

    const results = await Promise.all(requests.map(({ member, slots }) => book(member.cookie, { resourceId: room, slotStarts: slots })));

    const succeeded = results.filter((res) => res.status === 201);
    const refused = results.filter((res) => res.status === 409);
    expect(succeeded.length + refused.length, 'every request ended in 201 or 409').toBe(requests.length);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    expect(refused.length).toBeGreaterThanOrEqual(1);
    for (const res of refused) expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');

    // Every success is stored whole, every refusal left nothing, and no slot is held twice.
    expect(await Booking.countDocuments()).toBe(succeeded.length);
    const stored = await SlotReservation.find().lean();
    expect(stored).toHaveLength(succeeded.length * 3);
    expect(new Set(stored.map((record) => record.start.getTime())).size).toBe(stored.length);
    for (const res of succeeded) {
      expect(await SlotReservation.countDocuments({ booking: res.body.id })).toBe(3);
    }
  });

  it('stays all-or-nothing when the service is called directly, without the HTTP layer', async () => {
    const members = await Promise.all(Array.from({ length: 20 }, (_, index) => createTestUser('member', `Direct ${index + 1}`)));
    const slot = new Date(ist(TOMORROW, '16:00'));
    const outcomes = await Promise.allSettled(
      members.map((member) => createBooking({ id: member.id, name: member.name, email: member.email, role: 'member' }, { resourceId: room, slotStarts: [slot] })),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' });
    }
    expect(await Booking.countDocuments()).toBe(1);
    expect(await SlotReservation.countDocuments()).toBe(1);
  });
});

describe('POST /api/bookings: the parent and its slot records are written together or not at all', () => {
  it('leaves no parent booking behind when writing the slot records fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SlotReservation, 'insertMany').mockRejectedValueOnce(new Error('simulated failure while writing slot records'));

    const res = await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00', '10:30') });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('simulated'); // details stay in the server log
    await expectNothingWritten(); // the parent was inserted first, and was rolled back with the failure

    // The slots are still free, and a retry books them.
    vi.restoreAllMocks();
    expect((await book(alice.cookie, { resourceId: room, slotStarts: slotsOf(TOMORROW, '10:00', '10:30') })).status).toBe(201);
  });
});

describe('the double-booking guard in the database itself', () => {
  it('has a unique { resource, start } index on slot_reservations', async () => {
    const indexes = await SlotReservation.collection.indexes();
    const guard = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ resource: 1, start: 1 }));
    expect(guard?.unique).toBe(true);
    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ booking: 1 }))).toBe(true);
    expect(SlotReservation.collection.collectionName).toBe('slot_reservations');
  });

  it('has the booking list indexes', async () => {
    const keys = (await Booking.collection.indexes()).map((index) => JSON.stringify(index.key));
    expect(keys).toContain(JSON.stringify({ user: 1, start: -1 }));
    expect(keys).toContain(JSON.stringify({ status: 1, start: 1 }));
  });

  it('refuses a second record for the same resource and slot, whoever writes it', async () => {
    const booking = await Booking.create({
      user: alice.id,
      resource: room,
      date: TOMORROW,
      slotStarts: [new Date(ist(TOMORROW, '10:00'))],
      start: new Date(ist(TOMORROW, '10:00')),
      end: new Date(ist(TOMORROW, '10:30')),
    });
    const record = { resource: room, start: new Date(ist(TOMORROW, '10:00')), booking: booking._id, user: alice.id };
    await SlotReservation.create(record);
    await expect(SlotReservation.create({ ...record, user: bob.id })).rejects.toMatchObject({ code: 11000 });
    // The same slot on another resource is a different slot.
    await expect(SlotReservation.create({ ...record, resource: otherRoom })).resolves.toBeDefined();
    await SlotReservation.deleteMany({});
    await Booking.deleteMany({});
  });

  it('a booking holds 1 to 8 slots', async () => {
    const base = { user: alice.id, resource: room, date: TOMORROW, start: new Date(ist(TOMORROW, '08:00')), end: new Date(ist(TOMORROW, '12:30')) };
    await expect(Booking.create({ ...base, slotStarts: [] })).rejects.toThrow(/1 to 8 slots/);
    const nine = slotsOf(TOMORROW, '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00').map((start) => new Date(start));
    await expect(Booking.create({ ...base, slotStarts: nine })).rejects.toThrow(/1 to 8 slots/);
  });
});
