import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import type { SessionOptions } from '../src/lib/session.js';

/** Session settings for tests. This secret exists only here and protects nothing. */
export const TEST_SESSION: SessionOptions = {
  jwtSecret: 'test-only-secret-0123456789-abcdefghij-klmnopqrst',
  secureCookies: false,
};

/**
 * Starts an in-memory MongoDB replica set (transactions work) and connects Mongoose to it.
 * Import the app, or the models a test needs, before calling this so their indexes get built.
 */
export async function startTestDatabase(dbName = 'slotbook_test') {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase({ uri: replSet.getUri(), dbName });
  return {
    async stop() {
      await disconnectDatabase();
      await replSet.stop();
    },
  };
}
