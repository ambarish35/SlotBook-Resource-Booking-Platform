import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { disconnectDatabase } from '../src/db.js';
import { TEST_SESSION, startTestDatabase } from './helpers.js';

describe('GET /api/health', () => {
  const app = createApp(TEST_SESSION);
  let database: Awaited<ReturnType<typeof startTestDatabase>> | undefined;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('reports ok when connected to a replica set', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('reports 503 once the database is disconnected', async () => {
    await disconnectDatabase();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'disconnected' });
  });
});
