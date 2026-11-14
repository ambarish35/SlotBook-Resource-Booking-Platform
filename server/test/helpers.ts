import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type request from 'supertest';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { SESSION_COOKIE, type SessionOptions } from '../src/lib/session.js';

/** The `Cookie` request header value for the session cookie that a response set. */
export function sessionCookie(res: request.Response): string {
  const setCookie = res.get('Set-Cookie') ?? [];
  const entry = setCookie.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) throw new Error('The response did not set a session cookie');
  return entry.split(';')[0]!;
}

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
