import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnectDatabase } from '../src/db.js';
import { TEST_SESSION, startTestDatabase } from './helpers.js';

// Health and readiness are different questions (PLAN.md §6): the first says the process is serving and never touches the
// database; the second says the app can do its work, which needs the database.
describe('GET /api/health and GET /api/ready', () => {
  const app = createApp(TEST_SESSION);
  let database: Awaited<ReturnType<typeof startTestDatabase>> | undefined;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('are both fine when connected to a replica set', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const ready = await request(app).get('/api/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', db: 'connected' });
  });

  it('stay answerable without signing in, and are never cached', async () => {
    for (const path of ['/api/health', '/api/ready']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.get('Cache-Control')).toBe('no-store');
    }
  });

  it('differ once the database is gone: health still says the process is up, readiness says 503', async () => {
    await disconnectDatabase();
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const ready = await request(app).get('/api/ready');
    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'unavailable', db: 'disconnected' });
  });
});
