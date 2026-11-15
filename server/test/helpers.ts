import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import type request from 'supertest';
import { expect } from 'vitest';
import type { AppOptions } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { SESSION_COOKIE, type SessionOptions, signSessionToken } from '../src/lib/session.js';
import { Booking } from '../src/models/Booking.js';
import { SlotReservation } from '../src/models/SlotReservation.js';
import { User, type UserRole } from '../src/models/User.js';

/** The `Cookie` request header value for the session cookie that a response set. */
export function sessionCookie(res: request.Response): string {
  const setCookie = res.get('Set-Cookie') ?? [];
  const entry = setCookie.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) throw new Error('The response did not set a session cookie');
  return entry.split(';')[0]!;
}

/**
 * App and session settings for tests. This secret exists only here and protects nothing. The sign-in and registration
 * limits are out of the way: most test files make dozens of registrations and wrong passwords from one address (the
 * address of the test client) through one app. `rate-limit.test.ts` is where the real limits are tested.
 */
const NO_LIMIT = { windowMs: 1000, max: 1_000_000 };
export const TEST_SESSION: AppOptions & SessionOptions = {
  jwtSecret: 'test-only-secret-0123456789-abcdefghij-klmnopqrst',
  secureCookies: false,
  authLimits: { loginFailures: NO_LIMIT, registrations: NO_LIMIT },
};

/*
 * Cleanup of in-memory MongoDB instances (HANDOFF.md, "Clean up after every run").
 *
 * Each instance gets its own data directory, named `slotbook-test-db-<pid>-<random>` after the process that
 * started it. It is removed when the instance stops and when starting it fails. If a run is killed before it
 * can clean up (a crash, Task Manager, a timeout), mongodb-memory-server's helper still ends the mongod process,
 * but the directory stays; the next run removes it, because the pid in its name no longer exists.
 * Only this prefix is ever touched, and only when its owner is gone.
 */
const DATA_DIR_PREFIX = 'slotbook-test-db-';

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 only checks that the process exists
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'; // exists, but belongs to someone else
  }
}

const removeDirectory = (path: string) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);

/** Removes data directories that earlier test processes left behind after being killed. */
export async function removeAbandonedDataDirs(): Promise<number> {
  const root = tmpdir();
  let removed = 0;
  for (const name of await readdir(root).catch(() => [] as string[])) {
    const owner = new RegExp(`^${DATA_DIR_PREFIX}(\\d+)-`).exec(name)?.[1];
    if (owner === undefined || Number(owner) === process.pid || processIsAlive(Number(owner))) continue;
    await removeDirectory(join(root, name));
    removed += 1;
  }
  return removed;
}

async function createDataDir(): Promise<string> {
  await removeAbandonedDataDirs();
  return mkdtemp(join(tmpdir(), `${DATA_DIR_PREFIX}${process.pid}-`));
}

/** An in-memory single-node replica set (transactions work) whose data directory is removed by `stop()`. */
export async function startMemoryReplSet() {
  const dbPath = await createDataDir();
  try {
    const replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      instanceOpts: [{ dbPath }],
    });
    return {
      uri: replSet.getUri(),
      async stop() {
        try {
          await replSet.stop();
        } finally {
          await removeDirectory(dbPath);
        }
      },
    };
  } catch (error) {
    await removeDirectory(dbPath);
    throw error;
  }
}

/** An in-memory standalone MongoDB (no replica set, so no transactions), for testing the startup guard. */
export async function startMemoryStandalone() {
  const dbPath = await createDataDir();
  try {
    const server = await MongoMemoryServer.create({ instance: { dbPath } });
    return {
      uri: server.getUri(),
      async stop() {
        try {
          await server.stop();
        } finally {
          await removeDirectory(dbPath);
        }
      },
    };
  } catch (error) {
    await removeDirectory(dbPath);
    throw error;
  }
}

/**
 * Starts an in-memory MongoDB replica set (transactions work) and connects Mongoose to it.
 * Import the app, or the models a test needs, before calling this so their indexes get built.
 * If connecting fails, the database that was just started is stopped before the error is thrown.
 */
export async function startTestDatabase(dbName = 'slotbook_test') {
  const server = await startMemoryReplSet();
  try {
    await connectDatabase({ uri: server.uri, dbName });
  } catch (error) {
    await server.stop();
    throw error;
  }
  return {
    async stop() {
      try {
        await disconnectDatabase();
      } finally {
        await server.stop();
      }
    },
  };
}

/*
 * Helpers for the booking tests (PLAN.md §12).
 */

/** The UTC instant, as an ISO string, of a wall-clock time in IST. Written with an explicit offset so it doesn't share code with the app. */
export function ist(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

/** A member or admin created directly in the database (no password hash worth hashing), with a ready session cookie. */
export async function createTestUser(role: UserRole, name: string) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`,
    passwordHash: 'not-a-real-hash',
    role,
  });
  return { id: user.id as string, name, email: user.email, cookie: `${SESSION_COOKIE}=${signSessionToken(user.id, TEST_SESSION)}` };
}

/**
 * V6, the record invariant (PLAN.md §12). Run it after every booking scenario:
 * - each confirmed booking has exactly one slot record per entry in `slotStarts`, for its own resource and member;
 * - a cancelled booking has none;
 * - no slot record points to a missing or cancelled booking, or sits outside its booking's slots.
 */
export async function expectBookingInvariant(): Promise<void> {
  const [bookings, records] = await Promise.all([Booking.find().lean(), SlotReservation.find().lean()]);
  const bookingById = new Map(bookings.map((booking) => [booking._id.toString(), booking]));

  const recordsByBooking = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.booking.toString();
    recordsByBooking.set(key, [...(recordsByBooking.get(key) ?? []), record]);
  }

  for (const booking of bookings) {
    const own = recordsByBooking.get(booking._id.toString()) ?? [];
    if (booking.status === 'confirmed') {
      expect(own.map((record) => record.start.getTime()).sort(), `slot records of confirmed booking ${booking._id}`).toEqual(
        booking.slotStarts.map((start) => start.getTime()).sort(),
      );
      for (const record of own) {
        expect(record.resource.toString()).toBe(booking.resource.toString());
        expect(record.user.toString()).toBe(booking.user.toString());
      }
    } else {
      expect(own, `a cancelled booking (${booking._id}) must have no slot records`).toHaveLength(0);
    }
  }

  for (const record of records) {
    const parent = bookingById.get(record.booking.toString());
    expect(parent, `slot record ${record._id} points to a missing booking`).toBeDefined();
    expect(parent?.status, `slot record ${record._id} points to a cancelled booking`).toBe('confirmed');
  }

  const expected = bookings.filter((booking) => booking.status === 'confirmed').reduce((sum, booking) => sum + booking.slotStarts.length, 0);
  expect(records, 'slot records in total').toHaveLength(expected);
}
