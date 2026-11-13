import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/db.js';

describe('GET /api/health', () => {
  const app = createApp();
  let replSet: MongoMemoryReplSet | undefined;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await connectDatabase({ uri: replSet.getUri(), dbName: 'slotbook_test' });
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet?.stop();
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
