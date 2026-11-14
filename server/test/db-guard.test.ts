import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseStartupError, connectDatabase } from '../src/db.js';
import { startMemoryStandalone } from './helpers.js';

describe('database startup guard', () => {
  let standalone: Awaited<ReturnType<typeof startMemoryStandalone>> | undefined;

  beforeAll(async () => {
    standalone = await startMemoryStandalone();
  });

  afterAll(async () => {
    await standalone?.stop();
  });

  it('refuses a standalone MongoDB because transactions need a replica set', async () => {
    const attempt = connectDatabase({ uri: standalone!.uri, dbName: 'slotbook_test' });
    await expect(attempt).rejects.toBeInstanceOf(DatabaseStartupError);
    await expect(attempt).rejects.toMatchObject({
      code: 'DB_NOT_REPLICA_SET',
      message: expect.stringContaining('needs a MongoDB replica set'),
    });
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);
  });

  it('fails with a clear error when MongoDB is unreachable', async () => {
    const attempt = connectDatabase({
      uri: 'mongodb://127.0.0.1:9/?directConnection=true',
      dbName: 'slotbook_test',
      serverSelectionTimeoutMS: 1_000,
    });
    await expect(attempt).rejects.toMatchObject({
      code: 'DB_UNREACHABLE',
      message: expect.stringContaining('Could not connect to MongoDB'),
    });
  });
});
