import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { User } from '../src/models/User.js';
import { LIST_LIMIT, cancelBooking, createBooking } from '../src/services/bookings.js';
import { TEST_SESSION, createTestUser, expectBookingInvariant, ist, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);

/** The pinned "now" for every request: 09:30 IST on Saturday 14 November 2026. */
const NOW = '2026-11-14T04:00:00.000Z';
/** Bookings are made earlier, because the booking service refuses slots that have already started. */
const MADE_ON = '2026-11-10T04:00:00.000Z';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let room: string;
let projector: string;
let annex: string;

const asUser = (user: TestUser) => ({ id: user.id, name: user.name, email: user.email, role: user.name.includes('Admin') ? ('admin' as const) : ('member' as const) });

async function make(user: TestUser, resourceId: string, date: string, ...times: string[]) {
  return createBooking(asUser(user), { resourceId, slotStarts: times.map((time) => new Date(ist(date, time))) });
}

const get = (user: TestUser | undefined, path: string) => {
  const req = request(app).get(path);
  return user ? req.set('Cookie', user.cookie) : req;
};
const ids = (res: request.Response) => (res.body as { id: string }[]).map((booking) => booking.id);

beforeAll(async () => {
  database = await startTestDatabase();
  alice = await createTestUser('member', 'Alice Rao');
  bob = await createTestUser('member', 'Bob Iyer');
  admin = await createTestUser('admin', 'Ada Admin');
  room = (await Resource.create({ name: 'Room A', type: 'room', location: 'Block A, 2nd floor', capacity: 6 })).id;
  projector = (await Resource.create({ name: 'Projector 1', type: 'equipment', location: 'IT desk', capacity: null })).id;
  annex = (await Resource.create({ name: 'Annex', type: 'room', location: 'Block B', capacity: 4 })).id;
});

afterAll(async () => {
  resetClock();
  await database?.stop();
});

beforeEach(async () => {
  setClock(MADE_ON);
  await Booking.deleteMany({});
  await SlotReservation.deleteMany({});
});

/**
 * One member's bookings around "now" (09:30 IST on 14 November), and some of Bob's and the admin's.
 * Returns each booking's id by a short name.
 */
async function standardData() {
  const made: Record<string, string> = {};
  const add = async (name: string, booking: Promise<{ id: string }>) => {
    made[name] = (await booking).id;
  };

  await add('ended', make(alice, room, '2026-11-12', '10:00', '10:30')); // long over
  await add('endsNow', make(alice, annex, '2026-11-14', '09:00')); // 09:00-09:30: ends exactly at "now"
  await add('inProgress', make(alice, room, '2026-11-14', '09:00', '09:30')); // 09:00-10:00: started, not ended
  await add('soon', make(alice, room, '2026-11-15', '10:00')); // upcoming
  await add('later', make(alice, projector, '2026-11-16', '14:00')); // upcoming, equipment
  await add('cancelledLater', make(alice, room, '2026-11-17', '09:00')); // will be cancelled: history, though in the future
  await add('bobEnded', make(bob, room, '2026-11-13', '08:00'));
  await add('bobSoon', make(bob, room, '2026-11-15', '14:00'));
  await add('adminLater', make(admin, annex, '2026-11-18', '11:00'));

  await cancelBooking(asUser(alice), made.cancelledLater!); // cancelled while it was still in the future
  setClock(NOW);
  return made;
}

describe('GET /api/bookings/mine', () => {
  it('lists upcoming bookings soonest first, including one in progress, and not ones that have ended', async () => {
    const m = await standardData();
    const res = await get(alice, '/api/bookings/mine?view=upcoming');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m.inProgress, m.soon, m.later]);
  });

  it('lists history newest first: cancelled bookings and ended ones, however far ahead the cancelled one was', async () => {
    const m = await standardData();
    const res = await get(alice, '/api/bookings/mine?view=history');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m.cancelledLater, m.endsNow, m.ended]);
    expect(res.body.map((booking: { status: string }) => booking.status)).toEqual(['cancelled', 'confirmed', 'confirmed']);
  });

  it('treats a booking that ends exactly now as ended', async () => {
    const m = await standardData();
    const upcoming = ids(await get(alice, '/api/bookings/mine?view=upcoming'));
    expect(upcoming).not.toContain(m.endsNow);
    expect(ids(await get(alice, '/api/bookings/mine?view=history'))).toContain(m.endsNow);
  });

  it('defaults to upcoming', async () => {
    const m = await standardData();
    const res = await get(alice, '/api/bookings/mine');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m.inProgress, m.soon, m.later]);
  });

  it('only ever lists the caller\'s own bookings, for a member and for an admin', async () => {
    const m = await standardData();
    expect(ids(await get(bob, '/api/bookings/mine?view=upcoming'))).toEqual([m.bobSoon]);
    expect(ids(await get(bob, '/api/bookings/mine?view=history'))).toEqual([m.bobEnded]);
    expect(ids(await get(admin, '/api/bookings/mine?view=upcoming'))).toEqual([m.adminLater]);
    expect(ids(await get(admin, '/api/bookings/mine?view=history'))).toEqual([]);
  });

  it('returns each booking with its resource and its member, and nothing else about the member', async () => {
    const m = await standardData();
    const res = await get(alice, '/api/bookings/mine?view=upcoming');
    expect(res.body[2]).toEqual({
      id: m.later,
      resource: { id: projector, name: 'Projector 1', type: 'equipment', location: 'IT desk' },
      user: { id: alice.id, name: 'Alice Rao', email: alice.email },
      date: '2026-11-16',
      slotStarts: ['2026-11-16T08:30:00.000Z'],
      start: '2026-11-16T08:30:00.000Z',
      end: '2026-11-16T09:00:00.000Z',
      status: 'confirmed',
      cancelledAt: null,
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|role/);
  });

  it('shows a cancelled booking with its original times and when it was cancelled', async () => {
    const m = await standardData();
    const res = await get(alice, '/api/bookings/mine?view=history');
    const cancelled = res.body[0];
    expect(cancelled).toMatchObject({
      id: m.cancelledLater,
      status: 'cancelled',
      date: '2026-11-17',
      start: ist('2026-11-17', '09:00'),
      end: ist('2026-11-17', '09:30'),
      slotStarts: [ist('2026-11-17', '09:00')],
      cancelledAt: MADE_ON,
    });
  });

  it('lists a booking on a resource that was deactivated later, with the resource\'s name (D9)', async () => {
    const m = await standardData();
    await Resource.updateOne({ _id: room }, { isActive: false });
    try {
      const res = await get(alice, '/api/bookings/mine?view=upcoming');
      expect(ids(res)).toEqual([m.inProgress, m.soon, m.later]);
      expect(res.body[0].resource.name).toBe('Room A');
    } finally {
      await Resource.updateOne({ _id: room }, { isActive: true });
    }
  });

  it('returns an empty list when there is nothing', async () => {
    expect((await get(alice, '/api/bookings/mine?view=upcoming')).body).toEqual([]);
    expect((await get(alice, '/api/bookings/mine?view=history')).body).toEqual([]);
  });

  it('refuses another view with 400, and requires a session', async () => {
    for (const query of ['?view=all', '?view=', '?view=UPCOMING', '?view=upcoming&view=history']) {
      const res = await get(alice, `/api/bookings/mine${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.details.fields)).toEqual(['view']);
    }
    const signedOut = await get(undefined, '/api/bookings/mine');
    expect(signedOut.status).toBe(401);
  });

  it('is not mistaken for a booking id', async () => {
    // `/mine` is a route of its own: it is never answered as "booking not found".
    expect((await get(alice, '/api/bookings/mine')).status).toBe(200);
  });
});

describe('GET /api/bookings (admin)', () => {
  it('lists everyone\'s upcoming bookings soonest first, with the member\'s name and email', async () => {
    const m = await standardData();
    const res = await get(admin, '/api/bookings?view=upcoming');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m.inProgress, m.soon, m.bobSoon, m.later, m.adminLater]);
    const bobs = res.body.find((booking: { id: string }) => booking.id === m.bobSoon);
    expect(bobs.user).toEqual({ id: bob.id, name: 'Bob Iyer', email: bob.email });
    expect(bobs.resource).toEqual({ id: room, name: 'Room A', type: 'room', location: 'Block A, 2nd floor' });
  });

  it('lists everyone\'s history newest first, cancelled ones included', async () => {
    const m = await standardData();
    const res = await get(admin, '/api/bookings?view=history');
    expect(ids(res)).toEqual([m.cancelledLater, m.endsNow, m.bobEnded, m.ended]);
  });

  it('defaults to upcoming', async () => {
    const m = await standardData();
    expect(ids(await get(admin, '/api/bookings'))).toEqual([m.inProgress, m.soon, m.bobSoon, m.later, m.adminLater]);
  });

  it('shows a booking an admin cancelled in the member\'s history and the admin\'s own list', async () => {
    const m = await standardData();
    await cancelBooking(asUser(admin), m.bobSoon!);
    expect(ids(await get(admin, '/api/bookings?view=upcoming'))).not.toContain(m.bobSoon);
    expect(ids(await get(admin, '/api/bookings?view=history'))).toContain(m.bobSoon);
    expect(ids(await get(bob, '/api/bookings/mine?view=history'))).toContain(m.bobSoon);
  });

  it('still lists everyone else when one member\'s account was removed from the database by hand', async () => {
    const m = await standardData();
    const gone = await createTestUser('member', 'Gone Soon');
    const goneBooking = await make(gone, room, '2026-11-19', '10:00');
    await User.deleteOne({ _id: gone.id });

    const res = await get(admin, '/api/bookings?view=upcoming');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m.inProgress, m.soon, m.bobSoon, m.later, m.adminLater, goneBooking.id]);
    const orphan = res.body.find((booking: { id: string }) => booking.id === goneBooking.id);
    expect(orphan.user).toEqual({ id: gone.id, name: 'Deleted account', email: '' });
    expect(orphan.resource.name).toBe('Room A');
  });

  it('refuses a member with 403, before looking at the query', async () => {
    await standardData();
    for (const path of ['/api/bookings', '/api/bookings?view=history', '/api/bookings?view=bogus']) {
      const res = await get(alice, path);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('refuses a signed-out caller with 401, and an admin\'s bad view with 400', async () => {
    expect((await get(undefined, '/api/bookings')).status).toBe(401);
    const bad = await get(admin, '/api/bookings?view=bogus');
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fields)).toEqual(['view']);
  });
});

describe('the list limit', () => {
  /** 24 one-slot bookings a day on one resource, for as many days as it takes. */
  async function manyBookings(user: TestUser, count: number, firstDate: string) {
    const created: string[] = [];
    const first = new Date(`${firstDate}T00:00:00Z`);
    for (let index = 0; created.length < count; index += 1) {
      const day = new Date(first.getTime() + Math.floor(index / 24) * 86_400_000).toISOString().slice(0, 10);
      const slot = index % 24;
      const time = `${String(8 + Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 === 0 ? '00' : '30'}`;
      created.push((await make(user, room, day, time)).id);
    }
    return created;
  }

  it('is 50, as the design says', () => {
    expect(LIST_LIMIT).toBe(50);
  });

  it('returns the 50 soonest upcoming bookings, soonest first', async () => {
    const created = await manyBookings(bob, 55, '2026-11-15'); // created in time order
    setClock(NOW);
    const res = await get(bob, '/api/bookings/mine?view=upcoming');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(created.slice(0, 50));
    const admins = await get(admin, '/api/bookings?view=upcoming');
    expect(ids(admins)).toEqual(created.slice(0, 50));
  });

  it('returns the 50 newest history rows, newest first', async () => {
    const created = await manyBookings(bob, 55, '2026-11-11'); // 11, 12 and 13 November: all over by 14 November
    setClock(NOW);
    const res = await get(bob, '/api/bookings/mine?view=history');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(created.slice(5).reverse());
    expect(ids(await get(bob, '/api/bookings/mine?view=upcoming'))).toEqual([]);
    await expectBookingInvariant();
  });
});
