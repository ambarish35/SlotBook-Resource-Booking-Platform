import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/lib/session.js';
import { createRequireAuth, requireAdmin } from '../src/middleware/auth.js';
import { apiNotFound, errorHandler } from '../src/middleware/error-handler.js';
import { User } from '../src/models/User.js';
import { createUser } from '../src/services/auth.js';
import { TEST_SESSION, sessionCookie, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);
const person = { name: 'Asha Rao', email: 'asha@example.com', password: 'correct horse battery' };

function tokenFor(userId: string, secret = TEST_SESSION.jwtSecret) {
  return jwt.sign({}, secret, { algorithm: 'HS256', expiresIn: '7d', subject: userId });
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

let database: Awaited<ReturnType<typeof startTestDatabase>>;

beforeAll(async () => {
  database = await startTestDatabase();
});

afterAll(async () => {
  await database.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('POST /api/auth/register', () => {
  it('relies on the unique email index, which exists once the database is connected', async () => {
    // connectDatabase builds the indexes of every registered model before the API listens; EMAIL_TAKEN
    // depends on this one, so this fails if a refactor ever stops the User model being registered first.
    const indexes = await User.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { email: 1 }, unique: true })]));
  });

  it('creates a member, starts a session and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(person);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: person.name, email: person.email, role: 'member' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(res.get('Set-Cookie')).toEqual(expect.arrayContaining([expect.stringMatching(`^${SESSION_COOKIE}=`)]));

    const stored = await User.findOne({ email: person.email }).select('+passwordHash');
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored?.passwordHash).not.toContain(person.password);
  });

  it('sets an httpOnly, SameSite=Lax cookie that lasts 7 days, and Secure only when configured', async () => {
    const res = await request(app).post('/api/auth/register').send(person);
    const cookie = res.get('Set-Cookie')!.find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=604800/);
    expect(cookie).not.toMatch(/; Secure/);

    await User.deleteMany({});
    const secureApp = createApp({ ...TEST_SESSION, secureCookies: true });
    const secure = await request(secureApp).post('/api/auth/register').send(person);
    expect(secure.get('Set-Cookie')!.find((c) => c.startsWith(SESSION_COOKIE))).toMatch(/; Secure/);
  });

  it('ignores a role sent in the body and creates a member', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...person, role: 'admin', isAdmin: true });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('member');
    expect((await User.findOne({ email: person.email }))?.role).toBe('member');
  });

  it('trims and lowercases the email and trims the name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...person, name: '  Asha Rao ', email: '  Asha@Example.COM ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com' });
  });

  it('returns 400 VALIDATION_ERROR with a message per field, and creates nothing', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: { fields: { name: 'Enter your name', email: 'Enter your email', password: 'Enter a password' } },
      },
    });
    expect(await User.countDocuments()).toBe(0);
  });

  it.each([
    ['a short password', { password: 'short' }, 'password', 'Use at least 8 characters'],
    ['a 73-character password', { password: 'a'.repeat(73) }, 'password', 'Use 72 characters or fewer'],
    // 40 characters, but 80 bytes: bcrypt would silently ignore the last 8.
    ['a password over 72 bytes', { password: 'é'.repeat(40) }, 'password', expect.stringContaining('too long')],
    ['an invalid email', { email: 'not-an-email' }, 'email', 'Enter a valid email address'],
    ['a blank name', { name: '   ' }, 'name', 'Enter your name'],
    ['an 81-character name', { name: 'n'.repeat(81) }, 'name', 'Use 80 characters or fewer'],
  ])('rejects %s', async (_label, patch, field, message) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...person, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields[field]).toEqual(message);
    expect(await User.countDocuments()).toBe(0);
  });

  it('accepts a 72-character password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...person, password: 'a'.repeat(72) });
    expect(res.status).toBe(201);
  });

  it('rejects a duplicate email, even in another case, with 409 EMAIL_TAKEN and no session', async () => {
    await request(app).post('/api/auth/register').send(person);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...person, name: 'Someone Else', email: 'ASHA@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.get('Set-Cookie')).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
  });

  it('lets exactly one of several simultaneous registrations for the same email win', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/auth/register').send(person)),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409 && r.body.error.code === 'EMAIL_TAKEN')).toHaveLength(4);
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(person);
  });

  it('signs in with the right password, whatever the case of the email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ASHA@Example.com', password: person.password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), name: person.name, email: person.email, role: 'member' });
    expect(sessionCookie(res)).toMatch(new RegExp(`^${SESSION_COOKIE}=.+`));
  });

  it('answers a wrong password with 401 INVALID_CREDENTIALS and no session', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: person.email, password: 'wrong password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
    });
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it("answers an unknown email exactly like a wrong password, so it doesn't reveal which emails exist", async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: person.email, password: 'nope nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope nope' });
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('returns 400 VALIDATION_ERROR when fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual({ email: 'Enter your email', password: 'Enter your password' });
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 UNAUTHENTICATED without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('restores the session from the cookie, as after a page reload', async () => {
    const registered = await request(app).post('/api/auth/register').send(person);
    const res = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(registered));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(registered.body);
  });

  it('applies a role change on the very next request', async () => {
    const registered = await request(app).post('/api/auth/register').send(person);
    const cookie = sessionCookie(registered);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.role).toBe('member');

    await User.updateOne({ email: person.email }, { role: 'admin' });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.role).toBe('admin');
  });

  it('rejects the session of a deleted user', async () => {
    const registered = await request(app).post('/api/auth/register').send(person);
    await User.deleteMany({});
    const res = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(registered));
    expect(res.status).toBe(401);
  });

  describe('rejects a bad token with 401', () => {
    const someId = '64b7f0f0f0f0f0f0f0f0f0f0';
    const cases: [string, () => string][] = [
      ['garbage', () => 'not-a-jwt'],
      ['one signed with a different secret', () => tokenFor(someId, 'another-secret-another-secret-another-secret')],
      ['an expired one', () => jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SESSION.jwtSecret, { subject: someId })],
      ['an unsigned alg=none one', () => `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: someId })}.`],
      ['one whose subject is not an id', () => tokenFor('not-an-object-id')],
    ];
    it.each(cases)('%s', async (_label, makeToken) => {
      const res = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${makeToken()}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('a tampered one', async () => {
      const registered = await request(app).post('/api/auth/register').send(person);
      const [header, , signature] = sessionCookie(registered).slice(SESSION_COOKIE.length + 1).split('.');
      const forgedPayload = base64url({ sub: someId, exp: Math.floor(Date.now() / 1000) + 3600 });
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${header}.${forgedPayload}.${signature}`);
      expect(res.status).toBe(401);
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie, after which /api/auth/me returns 401', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(person).expect(201);
    await agent.get('/api/auth/me').expect(200);

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(res.get('Set-Cookie')!.find((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toMatch(/Expires=Thu, 01 Jan 1970/);

    // The agent's cookie jar honours the expiry, as a browser does.
    await agent.get('/api/auth/me').expect(401);
  });

  it('works without a session', async () => {
    await request(app).post('/api/auth/logout').expect(204);
  });
});

describe('requireAdmin', () => {
  // A throwaway app guarding one route with the real middleware; the first admin-only API arrives in M3.
  const guarded = express();
  guarded.use(cookieParser());
  guarded.get('/admin-only', createRequireAuth(TEST_SESSION), requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  guarded.use(errorHandler);

  async function cookieFor(role: 'member' | 'admin') {
    await createUser({ name: 'Test User', email: `${role}@example.com`, password: 'a long enough password', role });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `${role}@example.com`, password: 'a long enough password' });
    return sessionCookie(res);
  }

  it('answers 401 to a visitor, 403 FORBIDDEN to a member and 200 to an admin', async () => {
    expect((await request(guarded).get('/admin-only')).status).toBe(401);

    const member = await request(guarded).get('/admin-only').set('Cookie', await cookieFor('member'));
    expect(member.status).toBe(403);
    expect(member.body.error.code).toBe('FORBIDDEN');

    const admin = await request(guarded).get('/admin-only').set('Cookie', await cookieFor('admin'));
    expect(admin.status).toBe(200);
  });
});

describe('error envelope', () => {
  it('answers an unknown API path with 404 NOT_FOUND in the envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('answers malformed JSON with 400 VALIDATION_ERROR in the envelope', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an unsupported charset', { 'Content-Type': 'application/json; charset=iso-8859-1' }],
    ['an unsupported content encoding', { 'Content-Type': 'application/json', 'Content-Encoding': 'x-nonsense' }],
  ])('answers a body with %s with 400, not 500', async (_label, headers) => {
    const res = await request(app).post('/api/auth/login').set(headers).send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'The request body could not be read.', details: { fields: {} } } });
  });

  it('answers a request without a JSON body like an empty one', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send('email=a');
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty('email');
  });

  it('turns an unexpected error into 500 INTERNAL_ERROR without leaking its message, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = express();
    broken.get('/api/boom', async () => {
      throw new Error('connect failed for mongodb://alice:hunter2@db.example.net');
    });
    broken.use('/api', apiNotFound);
    broken.use(errorHandler);

    const res = await request(broken).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|alice|db\.example/);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).not.toContain('hunter2');
    log.mockRestore();
  });
});
