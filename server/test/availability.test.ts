import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { cancelBooking, createBooking } from '../src/services/bookings.js';
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
let room: string;
let otherRoom: string;
let inactiveRoom: string;

interface Slot {
  start: string;
  end: string;
  label: string;
  status: 'available' | 'unavailable' | 'past';
  mine: boolean;
}

function availability(cookie: string | undefined, resourceId: string, query: string) {
  const req = request(app).get(`/api/resources/${resourceId}/availability${query}`);
  return cookie ? req.set('Cookie', cookie) : req;
}

async function slotsOn(cookie: string, date: string, resourceId = room): Promise<Slot[]> {
  const res = await availability(cookie, resourceId, `?date=${date}`);
  expect(res.status).toBe(200);
  return res.body.slots as Slot[];
}

const byLabel = (slots: Slot[], label: string) => slots.find((slot) => slot.label === label)!;

/** Books through the service, as the booking endpoint does. */
function bookFor(user: TestUser, resourceId: string, date: string, ...times: string[]) {
  return createBooking(
    { id: user.id, name: user.name, email: user.email, role: user.name.includes('Admin') ? 'admin' : 'member' },
    { resourceId, slotStarts: times.map((time) => new Date(ist(date, time))) },
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  alice = await createTestUser('member', 'Alice Rao');
  bob = await createTestUser('member', 'Bob Iyer');
  admin = await createTestUser('admin', 'Ada Admin');
  room = (await Resource.create({ name: 'Room A', type: 'room', location: 'Block A', capacity: 6 })).id;
  otherRoom = (await Resource.create({ name: 'Room B', type: 'room', location: 'Block A', capacity: 6 })).id;
  inactiveRoom = (await Resource.create({ name: 'Room C (retired)', type: 'room', location: 'Block A', capacity: 6, isActive: false })).id;
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

describe('GET /api/resources/:id/availability: the response', () => {
  it('describes the 24 slots of an IST date, 08:00 to 19:30, as the plan\'s example does', async () => {
    const res = await availability(alice.cookie, room, `?date=${TOMORROW}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resourceId: room, date: TOMORROW, timeZone: 'Asia/Kolkata', slotMinutes: 30 });

    const slots = res.body.slots as Slot[];
    expect(slots).toHaveLength(24);
    expect(slots[0]).toEqual({
      start: '2026-11-15T02:30:00.000Z',
      end: '2026-11-15T03:00:00.000Z',
      label: '08:00',
      status: 'available',
      mine: false,
    });
    expect(slots[23]).toEqual({
      start: '2026-11-15T14:00:00.000Z',
      end: '2026-11-15T14:30:00.000Z',
      label: '19:30',
      status: 'available',
      mine: false,
    });
    expect(slots.map((slot) => slot.label)).toEqual(
      Array.from({ length: 24 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`),
    );
    slots.forEach((slot, index) => {
      expect(Object.keys(slot).sort()).toEqual(['end', 'label', 'mine', 'start', 'status']);
      expect(new Date(slot.end).getTime() - new Date(slot.start).getTime()).toBe(30 * 60_000);
      if (index > 0) expect(slot.start).toBe(slots[index - 1]!.end);
    });
  });

  it('shows every slot of an untouched future day as available and not mine', async () => {
    const slots = await slotsOn(alice.cookie, '2026-11-20');
    expect(slots.every((slot) => slot.status === 'available' && slot.mine === false)).toBe(true);
  });
});

describe('GET /api/resources/:id/availability: past, unavailable and mine', () => {
  it('marks every slot that has started as past, including the one in progress, at 09:30 IST', async () => {
    const slots = await slotsOn(alice.cookie, TODAY);
    expect(slots.filter((slot) => slot.status === 'past').map((slot) => slot.label)).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(byLabel(slots, '10:00').status).toBe('available');
    expect(slots.slice(5).every((slot) => slot.status === 'available')).toBe(true);
  });

  it('moves with the clock: one millisecond before a slot starts it is available, at its start it is past', async () => {
    setClock('2026-11-14T04:29:59.999Z'); // 09:59:59.999 IST
    expect(byLabel(await slotsOn(alice.cookie, TODAY), '10:00').status).toBe('available');
    setClock('2026-11-14T04:30:00.000Z'); // 10:00 IST
    expect(byLabel(await slotsOn(alice.cookie, TODAY), '10:00').status).toBe('past');
  });

  it('marks booked slots as unavailable for everyone, and mine only for their owner', async () => {
    await bookFor(alice, room, TOMORROW, '10:00', '10:30');
    await bookFor(bob, room, TOMORROW, '14:00');

    const forAlice = await slotsOn(alice.cookie, TOMORROW);
    expect(forAlice.filter((slot) => slot.status === 'unavailable').map((slot) => slot.label)).toEqual(['10:00', '10:30', '14:00']);
    expect(forAlice.filter((slot) => slot.mine).map((slot) => slot.label)).toEqual(['10:00', '10:30']);

    const forBob = await slotsOn(bob.cookie, TOMORROW);
    expect(forBob.filter((slot) => slot.status === 'unavailable').map((slot) => slot.label)).toEqual(['10:00', '10:30', '14:00']);
    expect(forBob.filter((slot) => slot.mine).map((slot) => slot.label)).toEqual(['14:00']);

    const forAdmin = await slotsOn(admin.cookie, TOMORROW);
    expect(forAdmin.filter((slot) => slot.status === 'unavailable')).toHaveLength(3);
    expect(forAdmin.some((slot) => slot.mine)).toBe(false);
  });

  it('marks an admin\'s own bookings as mine', async () => {
    await bookFor(admin, room, TOMORROW, '09:00');
    expect(byLabel(await slotsOn(admin.cookie, TOMORROW), '09:00')).toMatchObject({ status: 'unavailable', mine: true });
    expect(byLabel(await slotsOn(alice.cookie, TOMORROW), '09:00')).toMatchObject({ status: 'unavailable', mine: false });
  });

  it('never says who booked a slot', async () => {
    await bookFor(alice, room, TOMORROW, '10:00');
    const res = await availability(bob.cookie, room, `?date=${TOMORROW}`);
    const text = JSON.stringify(res.body);
    for (const secret of [alice.id, alice.email, 'Alice', 'Rao']) expect(text).not.toContain(secret);
    expect(res.body.slots.every((slot: Slot) => Object.keys(slot).length === 5)).toBe(true);
  });

  it('keeps each resource and each date separate', async () => {
    await bookFor(alice, room, TOMORROW, '10:00');
    expect(byLabel(await slotsOn(alice.cookie, TOMORROW, otherRoom), '10:00').status).toBe('available');
    expect(byLabel(await slotsOn(alice.cookie, '2026-11-16'), '10:00').status).toBe('available');
  });

  it('shows a booked slot that has started as past, and still marks it as the owner\'s', async () => {
    await bookFor(alice, room, TOMORROW, '10:00');
    setClock(ist(TOMORROW, '10:10')); // the 10:00 slot is in progress
    const forAlice = await slotsOn(alice.cookie, TOMORROW);
    expect(byLabel(forAlice, '10:00')).toMatchObject({ status: 'past', mine: true });
    expect(byLabel(forAlice, '10:30').status).toBe('available');
    expect(byLabel(await slotsOn(bob.cookie, TOMORROW), '10:00')).toMatchObject({ status: 'past', mine: false });
  });

  it('shows a cancelled booking\'s slots as available again', async () => {
    const booking = await bookFor(alice, room, TOMORROW, '10:00', '10:30');
    expect(byLabel(await slotsOn(bob.cookie, TOMORROW), '10:30').status).toBe('unavailable');

    await cancelBooking({ id: alice.id, name: alice.name, email: alice.email, role: 'member' }, booking.id);
    const after = await slotsOn(bob.cookie, TOMORROW);
    expect(byLabel(after, '10:00')).toMatchObject({ status: 'available', mine: false });
    expect(byLabel(after, '10:30')).toMatchObject({ status: 'available', mine: false });
    expect(byLabel(await slotsOn(alice.cookie, TOMORROW), '10:00').mine).toBe(false);
    await expectBookingInvariant();
  });
});

describe('GET /api/resources/:id/availability: access', () => {
  it('returns 401 when signed out', async () => {
    const res = await availability(undefined, room, `?date=${TOMORROW}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 for an unknown id and a malformed id, with the same body', async () => {
    const unknown = await availability(alice.cookie, '0123456789abcdef01234567', `?date=${TOMORROW}`);
    const malformed = await availability(alice.cookie, 'not-an-id', `?date=${TOMORROW}`);
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(malformed.body).toEqual(unknown.body);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the same 404 to a member for an inactive resource, and 200 to an admin', async () => {
    const unknown = await availability(alice.cookie, '0123456789abcdef01234567', `?date=${TOMORROW}`);
    const asMember = await availability(alice.cookie, inactiveRoom, `?date=${TOMORROW}`);
    expect(asMember.status).toBe(404);
    expect(asMember.body).toEqual(unknown.body);

    const asAdmin = await availability(admin.cookie, inactiveRoom, `?date=${TOMORROW}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.slots).toHaveLength(24);
  });
});

describe('GET /api/resources/:id/availability: the date', () => {
  const fieldsOf = (res: request.Response) => res.body.error.details.fields as Record<string, string>;

  it('requires a date', async () => {
    for (const query of ['', '?', '?date=']) {
      const res = await availability(alice.cookie, room, query);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(fieldsOf(res))).toEqual(['date']);
    }
  });

  it('refuses anything that is not a real YYYY-MM-DD date', async () => {
    for (const date of ['2026-02-30', '2026-13-01', '14-11-2026', '2026-11-14T00:00:00Z', '2026-1-4', 'tomorrow', '20261114', '2026-11-14%20', '0050-01-01']) {
      const res = await availability(alice.cookie, room, `?date=${date}`);
      expect(res.status, date).toBe(400);
      expect(fieldsOf(res).date).toBe('Use a date like 2026-11-14');
    }
    const twice = await availability(alice.cookie, room, `?date=${TOMORROW}&date=2026-11-16`);
    expect(twice.status).toBe(400);
    expect(fieldsOf(twice).date).toBe('Choose a date');
  });

  it('accepts today + 30 and refuses today + 31', async () => {
    expect((await availability(alice.cookie, room, '?date=2026-12-14')).status).toBe(200);
    const tooFar = await availability(alice.cookie, room, '?date=2026-12-15');
    expect(tooFar.status).toBe(400);
    expect(fieldsOf(tooFar)).toEqual({ date: 'Choose a date up to 30 days ahead' });
  });

  it('shows every slot of an earlier date as past', async () => {
    for (const date of ['2026-11-13', '2026-01-01', '2020-02-29']) {
      const slots = await slotsOn(alice.cookie, date);
      expect(slots, date).toHaveLength(24);
      expect(slots.every((slot) => slot.status === 'past')).toBe(true);
    }
  });

  it('checks the date before the resource: a bad date is 400 even for an unknown resource', async () => {
    const res = await availability(alice.cookie, '0123456789abcdef01234567', '?date=2026-12-15');
    expect(res.status).toBe(400);
    const inactive = await availability(alice.cookie, inactiveRoom, '?date=2026-12-15');
    expect(inactive.status).toBe(400); // a member learns nothing about the inactive resource from this
  });

  it('follows the IST date at the rollover, not the UTC date', async () => {
    // 23:59:59.999 IST on the 13th: the 14th is tomorrow, the 13th is today with every slot started.
    setClock('2026-11-13T18:29:59.999Z');
    expect((await slotsOn(alice.cookie, '2026-11-14')).every((slot) => slot.status === 'available')).toBe(true);
    expect((await slotsOn(alice.cookie, '2026-11-13')).every((slot) => slot.status === 'past')).toBe(true);
    expect((await availability(alice.cookie, room, '?date=2026-12-13')).status).toBe(200);
    expect((await availability(alice.cookie, room, '?date=2026-12-14')).status).toBe(400);

    // One millisecond later it is 00:00 IST on the 14th: nothing on the 14th has started, and the window moved on.
    setClock('2026-11-13T18:30:00.000Z');
    const today = await slotsOn(alice.cookie, '2026-11-14');
    expect(today.every((slot) => slot.status === 'available')).toBe(true);
    expect((await availability(alice.cookie, room, '?date=2026-12-14')).status).toBe(200);
    expect((await availability(alice.cookie, room, '?date=2026-12-15')).status).toBe(400);
  });
});
