import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { CONTENT_SECURITY_POLICY } from '../src/middleware/security.js';
import { User } from '../src/models/User.js';
import { TEST_SESSION, startTestDatabase } from './helpers.js';

const app = createApp(TEST_SESSION);

describe('security headers', () => {
  it('are on every response, API and not-found alike, and the server does not announce Express', async () => {
    for (const path of ['/api/health', '/api/nope', '/not-an-api-route']) {
      const res = await request(app).get(path);
      expect(res.get('Content-Security-Policy'), path).toBe(CONTENT_SECURITY_POLICY);
      expect(res.get('X-Content-Type-Options'), path).toBe('nosniff');
      expect(res.get('X-Frame-Options'), path).toBe('DENY');
      expect(res.get('Referrer-Policy'), path).toBe('strict-origin-when-cross-origin');
      expect(res.get('Cross-Origin-Opener-Policy'), path).toBe('same-origin');
      expect(res.get('Cross-Origin-Resource-Policy'), path).toBe('same-origin');
      expect(res.get('Permissions-Policy'), path).toContain('camera=()');
      expect(res.get('X-Powered-By'), path).toBeUndefined();
    }
  });

  it('give the page only its own files: no inline code, no other origins, no framing, no plugins', () => {
    const directives = new Map(CONTENT_SECURITY_POLICY.split('; ').map((d) => [d.split(' ')[0]!, d.split(' ').slice(1)]));
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('style-src')).toEqual(["'self'"]);
    expect(directives.get('connect-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/);
  });

  it('keep every API response out of caches', async () => {
    for (const path of ['/api/health', '/api/ready', '/api/auth/me', '/api/nope']) {
      expect((await request(app).get(path)).get('Cache-Control'), path).toBe('no-store');
    }
  });
});

describe('Strict-Transport-Security', () => {
  const https = { 'X-Forwarded-Proto': 'https' };

  it('is not sent unless production asks for it', async () => {
    const res = await request(createApp({ ...TEST_SESSION, trustProxy: 1 })).get('/api/health').set(https);
    expect(res.get('Strict-Transport-Security')).toBeUndefined();
  });

  it('is sent on HTTPS requests in production (behind one trusted proxy) and only on those', async () => {
    const production = createApp({ ...TEST_SESSION, hsts: true, trustProxy: 1 });
    const secure = await request(production).get('/api/health').set(https);
    expect(secure.get('Strict-Transport-Security')).toBe('max-age=15552000');
    const plain = await request(production).get('/api/health');
    expect(plain.get('Strict-Transport-Security')).toBeUndefined();
  });

  it('is never triggered by a header the server was told not to trust', async () => {
    const direct = createApp({ ...TEST_SESSION, hsts: true, trustProxy: 0 });
    const res = await request(direct).get('/api/health').set(https);
    expect(res.get('Strict-Transport-Security')).toBeUndefined();
  });
});

describe('cross-site writes', () => {
  // POST /api/auth/logout needs no database, which keeps these about the middleware alone.
  const write = (headers: Record<string, string> = {}) => {
    let req = request(app).post('/api/auth/logout');
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    return req;
  };

  it('are let through with neither Origin nor Sec-Fetch-Site (curl, tests, an old browser): the cookie is still needed', async () => {
    expect((await write()).status).toBe(204);
  });

  it('are let through from the same origin, however the browser says so', async () => {
    expect((await write({ Host: 'slotbook.test', Origin: 'https://slotbook.test' })).status).toBe(204);
    expect((await write({ Host: 'slotbook.test:8443', Origin: 'https://SlotBook.test:8443' })).status).toBe(204);
    expect((await write({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(204);
    expect((await write({ 'Sec-Fetch-Site': 'none' })).status).toBe(204);
  });

  it('trust the browser\'s Sec-Fetch-Site over a Host the API sees differently: the Vite dev proxy rewrites Host', async () => {
    // The page is on http://localhost:5173, the proxy forwards to 127.0.0.1:4000 and sets Host to that, and the browser's
    // own verdict is same-origin. Comparing Origin with Host here refused every write in development.
    const viaDevProxy = { Host: '127.0.0.1:4000', Origin: 'http://localhost:5173', 'Sec-Fetch-Site': 'same-origin' };
    expect((await write(viaDevProxy)).status).toBe(204);
  });

  it('let the browser\'s verdict win in the other direction too: an Origin that looks right does not save a cross-site request', async () => {
    const res = await write({ Host: 'slotbook.test', Origin: 'https://slotbook.test', 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
  });

  it('fall back to comparing Origin with Host only for a browser that sends no Sec-Fetch-Site', async () => {
    expect((await write({ Host: '127.0.0.1:4000', Origin: 'http://localhost:5173' })).status).toBe(403);
    expect((await write({ Host: 'slotbook.test', Origin: 'https://slotbook.test' })).status).toBe(204);
  });

  it('are refused with 403 when the Origin is another site, another port, or the literal null', async () => {
    for (const origin of ['https://evil.example', 'http://slotbook.test:9999', 'https://slotbook.test.evil.example', 'null', 'not a url']) {
      const res = await write({ Host: 'slotbook.test', Origin: origin });
      expect(res.status, origin).toBe(403);
      expect(res.body.error.code, origin).toBe('FORBIDDEN');
    }
  });

  it('are refused with 403 when the browser says the request is cross-site or same-site but not same-origin', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const res = await write({ 'Sec-Fetch-Site': site });
      expect(res.status, site).toBe(403);
      expect(res.body.error.code, site).toBe('FORBIDDEN');
    }
  });

  it('are refused for every method that changes data, before anything else looks at the request', async () => {
    const crossSite = { 'Sec-Fetch-Site': 'cross-site' };
    for (const [method, path] of [
      ['post', '/api/bookings'],
      ['post', '/api/bookings/aaaaaaaaaaaaaaaaaaaaaaaa/cancel'],
      ['post', '/api/resources'],
      ['patch', '/api/resources/aaaaaaaaaaaaaaaaaaaaaaaa'],
      ['post', '/api/auth/login'],
      ['post', '/api/auth/register'],
      ['put', '/api/anything'],
      ['delete', '/api/anything'],
    ] as const) {
      const res = await request(app)[method](path).set(crossSite).send({});
      expect(res.status, `${method} ${path}`).toBe(403); // not 401 or 400: it is refused first
    }
  });

  it('do not restrict reads, which change nothing and can\'t be read by another origin anyway', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example').set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  it('is not enabled: no response ever allows another origin, and a preflight is refused like any other request', async () => {
    const get = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(get.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(get.get('Access-Control-Allow-Credentials')).toBeUndefined();

    // A preflight that isn't answered with Access-Control-Allow-* headers makes the browser drop the real request.
    for (const [path, status] of [
      ['/api/nope', 404], // an unknown API path: the JSON 404
      ['/api/bookings', 401], // a real one: the router wants a session before anything else
    ] as const) {
      const preflight = await request(app).options(path).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(preflight.status, path).toBe(status);
      expect(preflight.type, path).toBe('application/json');
      expect(preflight.get('Access-Control-Allow-Origin'), path).toBeUndefined();
      expect(preflight.get('Access-Control-Allow-Methods'), path).toBeUndefined();
    }
  });
});

describe('a refused cross-site write changes nothing', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database.stop();
  });

  it('creates no account, while the same request from this site does', async () => {
    const person = { name: 'Asha Rao', email: 'asha@example.com', password: 'correct horse battery' };
    const refused = await request(app).post('/api/auth/register').set('Origin', 'https://evil.example').set('Host', 'slotbook.test').send(person);
    expect(refused.status).toBe(403);
    expect(refused.get('Set-Cookie')).toBeUndefined();
    expect(await User.countDocuments({})).toBe(0);

    const allowed = await request(app).post('/api/auth/register').set('Origin', 'https://slotbook.test').set('Host', 'slotbook.test').send(person);
    expect(allowed.status).toBe(201);
    expect(await User.countDocuments({})).toBe(1);
  });
});
