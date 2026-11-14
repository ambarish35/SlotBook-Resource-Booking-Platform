import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import { Booking } from '../src/models/Booking.js';
import { Resource } from '../src/models/Resource.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { User } from '../src/models/User.js';
import { TEST_SESSION, createTestUser, ist, sessionCookie, startTestDatabase } from './helpers.js';

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
let inactiveRoom: string;
let aliceBooking: string;

type Call = (cookie?: string) => request.Test;
const withCookie = (req: request.Test, cookie?: string) => (cookie ? req.set('Cookie', cookie) : req);

/** Every booking-related endpoint, as a function of the session cookie. */
function endpoints(): Record<string, Call> {
  const slotStarts = [ist(TOMORROW, '12:00')];
  return {
    'GET /api/resources': (c) => withCookie(request(app).get('/api/resources'), c),
    'GET /api/resources/:id': (c) => withCookie(request(app).get(`/api/resources/${room}`), c),
    'GET /api/resources/:id/availability': (c) => withCookie(request(app).get(`/api/resources/${room}/availability?date=${TOMORROW}`), c),
    'POST /api/bookings': (c) => withCookie(request(app).post('/api/bookings'), c).send({ resourceId: room, slotStarts }),
    'GET /api/bookings/mine': (c) => withCookie(request(app).get('/api/bookings/mine'), c),
    'GET /api/bookings': (c) => withCookie(request(app).get('/api/bookings'), c),
    'POST /api/bookings/:id/cancel': (c) => withCookie(request(app).post(`/api/bookings/${aliceBooking}/cancel`), c),
    'POST /api/resources': (c) => withCookie(request(app).post('/api/resources'), c).send({ name: 'New', type: 'equipment', location: 'X' }),
    'PATCH /api/resources/:id': (c) => withCookie(request(app).patch(`/api/resources/${room}`), c).send({ description: 'changed' }),
  };
}

const forgedCookie = (token: string) => `${SESSION_COOKIE}=${token}`;
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

beforeAll(async () => {
  database = await startTestDatabase();
  alice = await createTestUser('member', 'Alice Rao');
  bob = await createTestUser('member', 'Bob Iyer');
  admin = await createTestUser('admin', 'Ada Admin');
  room = (await Resource.create({ name: 'Room A', type: 'room', location: 'Block A', capacity: 6 })).id;
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
  const res = await request(app).post('/api/bookings').set('Cookie', alice.cookie).send({ resourceId: room, slotStarts: [ist(TOMORROW, '10:00')] });
  aliceBooking = res.body.id;
});

describe('V4: signed out', () => {
  it('answers 401 UNAUTHENTICATED on every endpoint, and changes nothing', async () => {
    for (const [name, call] of Object.entries(endpoints())) {
      const res = await call();
      expect(res.status, name).toBe(401);
      expect(res.body.error.code, name).toBe('UNAUTHENTICATED');
    }
    expect(await Booking.countDocuments()).toBe(1); // only Alice's setup booking
    expect((await Booking.findById(aliceBooking))?.status).toBe('confirmed');
  });
});

describe('V4: tampered, forged and expired tokens', () => {
  const valid = () => alice.cookie.slice(`${SESSION_COOKIE}=`.length);
  const names = ['GET /api/resources/:id/availability', 'POST /api/bookings', 'GET /api/bookings/mine', 'GET /api/bookings', 'POST /api/bookings/:id/cancel'];

  async function expectUnauthenticated(cookie: string, what: string) {
    const all = endpoints();
    for (const name of names) {
      const res = await all[name]!(cookie);
      expect(res.status, `${what}: ${name}`).toBe(401);
      expect(res.body.error.code, `${what}: ${name}`).toBe('UNAUTHENTICATED');
    }
    expect(await Booking.countDocuments()).toBe(1);
    expect((await Booking.findById(aliceBooking))?.status).toBe('confirmed');
  }

  it('refuses a token whose signature was changed', async () => {
    const token = valid();
    const flipped = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    await expectUnauthenticated(forgedCookie(flipped), 'changed signature');
  });

  it('refuses a token whose payload was changed to another user', async () => {
    const [header, , signature] = valid().split('.');
    await expectUnauthenticated(forgedCookie(`${header}.${base64url({ sub: admin.id })}.${signature}`), 'edited payload');
  });

  it('refuses a token signed with another secret', async () => {
    const token = jwt.sign({}, 'a-different-secret-0123456789-abcdefghijklmnop', { algorithm: 'HS256', expiresIn: '7d', subject: admin.id });
    await expectUnauthenticated(forgedCookie(token), 'wrong secret');
  });

  it('refuses an expired token', async () => {
    const token = jwt.sign({}, TEST_SESSION.jwtSecret, { algorithm: 'HS256', expiresIn: -60, subject: alice.id });
    await expectUnauthenticated(forgedCookie(token), 'expired');
  });

  it('refuses an unsigned token (alg none)', async () => {
    const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: admin.id })}.`;
    await expectUnauthenticated(forgedCookie(token), 'alg none');
  });

  it('refuses a token for a user who no longer exists, and junk', async () => {
    const gone = await createTestUser('member', 'Gone Soon');
    await User.deleteOne({ _id: gone.id });
    await expectUnauthenticated(gone.cookie, 'deleted user');
    await expectUnauthenticated(forgedCookie('not-a-token'), 'junk');
    await expectUnauthenticated(`${SESSION_COOKIE}=`, 'empty');
  });
});

describe('V4: members and admins', () => {
  it('lets a member call every endpoint except the admin ones, which answer 403 and change nothing', async () => {
    const all = endpoints();
    for (const name of ['POST /api/resources', 'PATCH /api/resources/:id', 'GET /api/bookings']) {
      const res = await all[name]!(bob.cookie);
      expect(res.status, name).toBe(403);
      expect(res.body.error.code, name).toBe('FORBIDDEN');
    }
    expect(await Resource.countDocuments({ name: 'New' })).toBe(0);
    expect((await Resource.findById(room))?.description).toBe('');

    for (const name of ['GET /api/resources', 'GET /api/resources/:id', 'GET /api/resources/:id/availability', 'POST /api/bookings', 'GET /api/bookings/mine']) {
      const res = await all[name]!(bob.cookie);
      expect(res.status, name).toBeLessThan(300);
    }
  });

  it('lets an admin list every booking, and refuses a member who asks for the same list', async () => {
    expect((await request(app).get('/api/bookings').set('Cookie', admin.cookie)).status).toBe(200);
    expect((await request(app).get('/api/bookings').set('Cookie', alice.cookie)).status).toBe(403);
  });

  it('ignores a role in the registration body, and the new member cannot list all bookings', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory Mal', email: 'mallory@example.com', password: 'a long enough password', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('member');
    expect((await User.findOne({ email: 'mallory@example.com' }))?.role).toBe('member');

    const cookie = sessionCookie(res);
    expect((await request(app).get('/api/bookings').set('Cookie', cookie)).status).toBe(403);
  });

  it('takes a role change into effect at once, because the user is reloaded on every request', async () => {
    const promoted = await createTestUser('member', 'Soon Admin');
    expect((await request(app).get('/api/bookings').set('Cookie', promoted.cookie)).status).toBe(403);
    await User.updateOne({ _id: promoted.id }, { role: 'admin' });
    expect((await request(app).get('/api/bookings').set('Cookie', promoted.cookie)).status).toBe(200);
    await User.updateOne({ _id: promoted.id }, { role: 'member' });
    expect((await request(app).get('/api/bookings').set('Cookie', promoted.cookie)).status).toBe(403);
  });
});

describe('V4: an inactive resource', () => {
  it('is a 404 for a member on the detail, availability and booking endpoints, the same as for an unknown id', async () => {
    const unknown = '0123456789abcdef01234567';
    const slotStarts = [ist(TOMORROW, '12:00')];
    const calls: [string, (id: string) => request.Test][] = [
      ['detail', (id) => request(app).get(`/api/resources/${id}`).set('Cookie', bob.cookie)],
      ['availability', (id) => request(app).get(`/api/resources/${id}/availability?date=${TOMORROW}`).set('Cookie', bob.cookie)],
      ['booking', (id) => request(app).post('/api/bookings').set('Cookie', bob.cookie).send({ resourceId: id, slotStarts })],
    ];
    for (const [name, call] of calls) {
      const inactive = await call(inactiveRoom);
      const missing = await call(unknown);
      expect(inactive.status, name).toBe(404);
      expect(inactive.body, name).toEqual(missing.body);
    }
    expect(await Booking.countDocuments({ user: bob.id })).toBe(0);
  });

  it('can be looked at by an admin (detail, availability) but not booked, by anyone', async () => {
    expect((await request(app).get(`/api/resources/${inactiveRoom}`).set('Cookie', admin.cookie)).status).toBe(200);
    expect((await request(app).get(`/api/resources/${inactiveRoom}/availability?date=${TOMORROW}`).set('Cookie', admin.cookie)).status).toBe(200);
    const booking = await request(app).post('/api/bookings').set('Cookie', admin.cookie).send({ resourceId: inactiveRoom, slotStarts: [ist(TOMORROW, '12:00')] });
    expect(booking.status).toBe(404);
    expect(await Booking.countDocuments({ user: admin.id })).toBe(0);
  });
});

describe('an id with a malformed percent-escape', () => {
  // `%E0%A4%A` can't be decoded: Express rejects the path itself, before any route handler runs.
  const BAD = '%E0%A4%A';

  it('is a 404 for a signed-in caller on every route that takes an id, never a 500', async () => {
    const attempts: [string, request.Test][] = [
      ['GET detail', request(app).get(`/api/resources/${BAD}`).set('Cookie', alice.cookie)],
      ['GET availability', request(app).get(`/api/resources/${BAD}/availability?date=${TOMORROW}`).set('Cookie', alice.cookie)],
      ['POST cancel', request(app).post(`/api/bookings/${BAD}/cancel`).set('Cookie', alice.cookie)],
      ['POST cancel (admin)', request(app).post(`/api/bookings/${BAD}/cancel`).set('Cookie', admin.cookie)],
      ['PATCH (admin)', request(app).patch(`/api/resources/${BAD}`).set('Cookie', admin.cookie).send({ description: 'x' })],
      ['PATCH (member)', request(app).patch(`/api/resources/${BAD}`).set('Cookie', bob.cookie).send({ description: 'x' })],
    ];
    for (const [name, attempt] of attempts) {
      const res = await attempt;
      expect(res.status, name).toBe(404);
      expect(res.body.error.code, name).toBe('NOT_FOUND');
    }
    expect((await Booking.findById(aliceBooking))?.status).toBe('confirmed');
  });

  it('is still a 401 when signed out', async () => {
    expect((await request(app).post(`/api/bookings/${BAD}/cancel`)).status).toBe(401);
    expect((await request(app).get(`/api/resources/${BAD}/availability?date=${TOMORROW}`)).status).toBe(401);
  });
});

describe('V4: another member\'s booking', () => {
  it('cannot be cancelled by a member: 404, as for an unknown id, and nothing changes', async () => {
    const unknown = await request(app).post('/api/bookings/0123456789abcdef01234567/cancel').set('Cookie', bob.cookie);
    const res = await request(app).post(`/api/bookings/${aliceBooking}/cancel`).set('Cookie', bob.cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(unknown.body);
    expect((await Booking.findById(aliceBooking))?.status).toBe('confirmed');
    expect(await SlotReservation.countDocuments({ booking: aliceBooking })).toBe(1);
  });

  it('does not appear in a member\'s own list, and cannot be reached by guessing it into the admin list', async () => {
    expect((await request(app).get('/api/bookings/mine').set('Cookie', bob.cookie)).body).toEqual([]);
    expect((await request(app).get('/api/bookings').set('Cookie', bob.cookie)).status).toBe(403);
  });
});
