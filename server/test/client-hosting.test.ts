import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ConfigError } from '../src/config.js';
import { ensureClientBuild } from '../src/middleware/client.js';
import { TEST_SESSION } from './helpers.js';

const SHELL = '<!doctype html><title>SlotBook test shell</title><div id="root"></div>';
const SECRET = 'this file is outside the client folder and must never be served';

let root: string;
let clientDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'slotbook-client-test-'));
  clientDir = join(root, 'client');
  await mkdir(join(clientDir, 'assets'), { recursive: true });
  await writeFile(join(clientDir, 'index.html'), SHELL);
  await writeFile(join(clientDir, 'assets', 'index-abc123.js'), 'console.log("app");');
  await writeFile(join(clientDir, 'assets', 'index-abc123.css'), 'body{margin:0}');
  await writeFile(join(clientDir, '.hidden'), 'dotfiles are not served');
  await writeFile(join(root, 'secret.txt'), SECRET);
  app = createApp({ ...TEST_SESSION, clientDir });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('serving the built client from the API origin', () => {
  it('serves index.html at / and revalidates it, so a new deploy shows at once', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toBe(SHELL);
    expect(res.get('Cache-Control')).toBe('no-cache');
  });

  it('serves hashed assets with their real type and caches them for a year', async () => {
    const js = await request(app).get('/assets/index-abc123.js');
    expect(js.status).toBe(200);
    expect(js.type).toBe('text/javascript');
    expect(js.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const css = await request(app).get('/assets/index-abc123.css');
    expect(css.status).toBe(200);
    expect(css.type).toBe('text/css');
  });

  it('answers React Router deep links with index.html, query strings included', async () => {
    for (const path of ['/login', '/resources', '/resources/6a0b0c0d0e0f101112131415?date=2026-11-20', '/bookings?view=history&scope=all', '/admin/resources', '/no/such/page']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(SHELL);
      expect(res.get('Cache-Control'), path).toBe('no-cache');
    }
  });

  it('answers HEAD for a deep link without a body', async () => {
    const res = await request(app).head('/bookings');
    expect(res.status).toBe(200);
    expect(res.text).toBeUndefined();
  });

  it('never answers a missing file with HTML: a missing script, stylesheet or image is a plain 404', async () => {
    for (const path of ['/assets/missing-123.js', '/assets/index-abc123.js.map', '/favicon.ico', '/robots.txt', '/some/folder/file.png']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.text, path).not.toContain('<title>');
    }
  });

  it('keeps /api as JSON: an unknown API path is a 404 in the error envelope, never index.html', async () => {
    for (const [method, path] of [
      ['get', '/api'],
      ['get', '/api/'],
      ['get', '/api/nope'],
      ['get', '/api/nope/deeper/still'],
      ['post', '/api/nope'],
      ['delete', '/api/nope'],
      ['get', '/api/index.html'],
    ] as const) {
      const res = await request(app)[method](path);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.type, `${method} ${path}`).toBe('application/json');
      expect(res.body.error.code, `${method} ${path}`).toBe('NOT_FOUND');
      expect(res.text, `${method} ${path}`).not.toContain('<title>');
    }
  });

  it('gives a write to a page path a JSON 404 as well, not the page', async () => {
    const res = await request(app).post('/bookings').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('serves nothing outside the client folder and no dotfiles', async () => {
    for (const path of ['/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt', '/../secret.txt', '/.hidden']) {
      const res = await request(app).get(path);
      expect(res.text ?? '', path).not.toContain(SECRET);
      expect(res.text ?? '', path).not.toContain('dotfiles are not served');
    }
  });

  it('still sends the security headers with the page and the assets', async () => {
    for (const path of ['/', '/bookings', '/assets/index-abc123.js']) {
      const res = await request(app).get(path);
      expect(res.get('Content-Security-Policy'), path).toContain("default-src 'self'");
      expect(res.get('X-Content-Type-Options'), path).toBe('nosniff');
    }
  });

  it('serves no client at all when none is configured (development: Vite serves it)', async () => {
    const api = createApp(TEST_SESSION);
    for (const path of ['/', '/resources', '/assets/index-abc123.js']) {
      const res = await request(api).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code, path).toBe('NOT_FOUND');
    }
  });
});

describe('ensureClientBuild', () => {
  it('passes when index.html is there', () => {
    expect(() => ensureClientBuild(clientDir)).not.toThrow();
  });

  it('fails at startup with what to do when the client has not been built', () => {
    expect(() => ensureClientBuild(join(root, 'nothing-here'))).toThrow(ConfigError);
    expect(() => ensureClientBuild(join(root, 'nothing-here'))).toThrow(/npm run build/);
  });
});
