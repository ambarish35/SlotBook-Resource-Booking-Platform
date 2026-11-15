import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { resetClock, setClock } from '../src/lib/clock.js';
import { createAttemptLimiter } from '../src/middleware/rate-limit.js';
import { DEFAULT_AUTH_LIMITS } from '../src/routes/auth.js';
import { User } from '../src/models/User.js';
import { createUser } from '../src/services/auth.js';
import { TEST_SESSION, startTestDatabase } from './helpers.js';

const START = '2026-11-20T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000);

beforeEach(() => setClock(START));
afterEach(() => resetClock());

describe('the attempt limiter', () => {
  it('allows `max` attempts per key, then refuses until the window is over', () => {
    const limiter = createAttemptLimiter({ windowMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.retryAfterSeconds('a')).toBe(0);
      limiter.record('a');
    }
    expect(limiter.retryAfterSeconds('a')).toBe(60);
    setClock(at(45));
    expect(limiter.retryAfterSeconds('a')).toBe(15);
    setClock(at(59.5));
    expect(limiter.retryAfterSeconds('a')).toBe(1);
    setClock(at(60));
    expect(limiter.retryAfterSeconds('a')).toBe(0);
    limiter.record('a');
    expect(limiter.retryAfterSeconds('a')).toBe(0); // a new window, one attempt in it
  });

  it('keeps a window per key, starting at that key\'s first attempt', () => {
    const limiter = createAttemptLimiter({ windowMs: 60_000, max: 1 });
    limiter.record('a');
    setClock(at(30));
    limiter.record('b');
    expect(limiter.retryAfterSeconds('a')).toBe(30);
    expect(limiter.retryAfterSeconds('b')).toBe(60);
    expect(limiter.retryAfterSeconds('c')).toBe(0);
  });

  it('does not refuse a key that has only recorded fewer attempts than the maximum', () => {
    const limiter = createAttemptLimiter({ windowMs: 60_000, max: 5 });
    for (let i = 0; i < 4; i += 1) limiter.record('a');
    expect(limiter.retryAfterSeconds('a')).toBe(0);
  });

  it('forgets expired keys and never holds more than 10 000, so a flood of addresses can\'t exhaust memory', () => {
    const limiter = createAttemptLimiter({ windowMs: 60_000, max: 1 });
    for (let i = 0; i < 10_050; i += 1) limiter.record(`10.0.${Math.floor(i / 256)}.${i % 256}`);
    expect(limiter.size()).toBe(10_000);
    setClock(at(61));
    limiter.record('late');
    expect(limiter.size()).toBe(1); // everything older had expired
  });
});

describe('the limits in force', () => {
  it('are ten wrong passwords per 15 minutes and ten registrations per hour, per address', () => {
    expect(DEFAULT_AUTH_LIMITS).toEqual({
      loginFailures: { windowMs: 15 * 60_000, max: 10 },
      registrations: { windowMs: 60 * 60_000, max: 10 },
    });
  });
});

describe('sign-in and registration limits', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  const person = { name: 'Asha Rao', email: 'asha@example.com', password: 'correct horse battery' };

  const strict = (extra: Partial<Parameters<typeof createApp>[0]> = {}) =>
    createApp({
      ...TEST_SESSION,
      ...extra,
      authLimits: { loginFailures: { windowMs: 60_000, max: 3 }, registrations: { windowMs: 60_000, max: 2 } },
    });
  const wrong = (app: ReturnType<typeof createApp>, email = person.email, headers: Record<string, string> = {}) => {
    let req = request(app).post('/api/auth/login');
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    return req.send({ email, password: 'not the password' });
  };

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await createUser({ ...person, role: 'member' });
  });

  it('refuse the fourth wrong password with 429, Retry-After and the error envelope', async () => {
    const app = strict();
    for (let i = 0; i < 3; i += 1) expect((await wrong(app)).status).toBe(401);
    const res = await wrong(app);
    expect(res.status).toBe(429);
    expect(res.get('Retry-After')).toBe('60');
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a few minutes and try again.', details: { retryAfterSeconds: 60 } },
    });
  });

  it('refuse even the right password while an address is over the limit, and then start no session', async () => {
    const app = strict();
    for (let i = 0; i < 3; i += 1) await wrong(app);
    const res = await request(app).post('/api/auth/login').send({ email: person.email, password: person.password });
    expect(res.status).toBe(429);
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it('count a wrong password for an unknown email the same way, so nothing says which emails exist', async () => {
    const app = strict();
    for (let i = 0; i < 3; i += 1) expect((await wrong(app, 'nobody@example.com')).status).toBe(401);
    expect((await wrong(app, 'nobody@example.com')).status).toBe(429);
  });

  it('count only failures: any number of good sign-ins leaves the budget alone', async () => {
    const app = strict();
    for (let i = 0; i < 6; i += 1) {
      expect((await request(app).post('/api/auth/login').send({ email: person.email, password: person.password })).status).toBe(200);
    }
    for (let i = 0; i < 3; i += 1) expect((await wrong(app)).status).toBe(401);
    expect((await wrong(app)).status).toBe(429);
  });

  it('do not count a request that was never a password attempt (bad shape, bad JSON)', async () => {
    const app = strict();
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).post('/api/auth/login').send({ email: 'not an email', password: '' })).status).toBe(400);
      expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{broken')).status).toBe(400);
    }
    expect((await wrong(app)).status).toBe(401);
  });

  it('let the address try again once the window is over', async () => {
    const app = strict();
    for (let i = 0; i < 3; i += 1) await wrong(app);
    expect((await wrong(app)).status).toBe(429);
    setClock(at(61));
    expect((await request(app).post('/api/auth/login').send({ email: person.email, password: person.password })).status).toBe(200);
  });

  it('keep a separate budget per address when the proxy in front is trusted (one hop)', async () => {
    const app = strict({ trustProxy: 1 });
    for (let i = 0; i < 3; i += 1) await wrong(app, person.email, { 'X-Forwarded-For': '203.0.113.7' });
    expect((await wrong(app, person.email, { 'X-Forwarded-For': '203.0.113.7' })).status).toBe(429);
    expect((await wrong(app, person.email, { 'X-Forwarded-For': '203.0.113.8' })).status).toBe(401);
    // with one proxy the last entry is the one the proxy itself added; an earlier one is whatever the client claimed
    for (let i = 0; i < 3; i += 1) await wrong(app, person.email, { 'X-Forwarded-For': `198.51.100.${i}, 203.0.113.9` });
    expect((await wrong(app, person.email, { 'X-Forwarded-For': '192.0.2.1, 203.0.113.9' })).status).toBe(429);
  });

  it('cannot be dodged by forging X-Forwarded-For when no proxy is trusted', async () => {
    const app = strict({ trustProxy: 0 });
    for (let i = 0; i < 3; i += 1) await wrong(app, person.email, { 'X-Forwarded-For': `203.0.113.${i}` });
    const res = await wrong(app, person.email, { 'X-Forwarded-For': '203.0.113.200' });
    expect(res.status).toBe(429);
  });

  it('limit registrations of every kind, including refused ones, and create nothing once over', async () => {
    const app = strict();
    await User.deleteMany({});
    expect((await request(app).post('/api/auth/register').send(person)).status).toBe(201);
    expect((await request(app).post('/api/auth/register').send(person)).status).toBe(409); // counts too
    const third = await request(app).post('/api/auth/register').send({ ...person, email: 'other@example.com' });
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    expect(third.get('Retry-After')).toBe('60');
    expect(third.get('Set-Cookie')).toBeUndefined();
    expect(await User.countDocuments({})).toBe(1);
  });

  it('keep registrations and wrong passwords in separate budgets', async () => {
    const app = strict();
    for (let i = 0; i < 3; i += 1) await wrong(app);
    expect((await request(app).post('/api/auth/register').send({ ...person, email: 'new@example.com' })).status).toBe(201);
  });

  it('never limit signing out, reading the session, or the rest of the API', async () => {
    const app = strict();
    for (let i = 0; i < 4; i += 1) await wrong(app);
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('apply with the real limits when none are passed: the eleventh wrong password in a row is refused', async () => {
    const app = createApp({ jwtSecret: TEST_SESSION.jwtSecret, secureCookies: false });
    for (let i = 0; i < 10; i += 1) expect((await wrong(app)).status, `attempt ${i + 1}`).toBe(401);
    expect((await wrong(app)).status).toBe(429);
  });
});
