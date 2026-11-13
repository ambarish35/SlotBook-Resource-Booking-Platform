import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../src/config.js';
import { User } from '../src/models/User.js';
import { readSeedAccounts, seedAccounts } from '../src/seed.js';
import { authenticate, registerMember } from '../src/services/auth.js';
import { startTestDatabase } from './helpers.js';

// Throwaway values that exist only in this test file.
const env = {
  SEED_ADMIN_EMAIL: 'admin@example.com',
  SEED_ADMIN_PASSWORD: 'admin test password',
  SEED_MEMBER_EMAIL: 'member@example.com',
  SEED_MEMBER_PASSWORD: 'member test password',
};

describe('readSeedAccounts', () => {
  it('reads an admin and a member, with default names', () => {
    expect(readSeedAccounts(env)).toEqual([
      { role: 'admin', name: 'Admin', email: 'admin@example.com', password: 'admin test password' },
      { role: 'member', name: 'Member', email: 'member@example.com', password: 'member test password' },
    ]);
    expect(readSeedAccounts({ ...env, SEED_ADMIN_NAME: 'Priya Nair' })[0]?.name).toBe('Priya Nair');
  });

  it('names the missing variables without printing any value', () => {
    const attempt = () => readSeedAccounts({ SEED_ADMIN_PASSWORD: 'admin test password' });
    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/SEED_ADMIN_EMAIL/);
    expect(attempt).toThrow(/SEED_MEMBER_PASSWORD/);
    expect(attempt).not.toThrow(/admin test password/);
  });

  it('rejects one email for both accounts', () => {
    expect(() => readSeedAccounts({ ...env, SEED_MEMBER_EMAIL: env.SEED_ADMIN_EMAIL })).toThrow(/must differ/);
  });

  it('rejects a weak password and an unfilled placeholder, without echoing them', () => {
    expect(() => readSeedAccounts({ ...env, SEED_ADMIN_PASSWORD: 'short' })).toThrow(/SEED_ADMIN_PASSWORD/);
    const placeholder = () => readSeedAccounts({ ...env, SEED_MEMBER_PASSWORD: '<choose-a-password>' });
    expect(placeholder).toThrow(/SEED_MEMBER_PASSWORD: still holds the placeholder/);
    expect(placeholder).not.toThrow(/choose-a-password/);
  });
});

describe('seedAccounts', () => {
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

  it('creates an admin and a member who can sign in', async () => {
    const accounts = readSeedAccounts(env);
    expect(await seedAccounts(accounts)).toEqual([
      { role: 'admin', outcome: 'created' },
      { role: 'member', outcome: 'created' },
    ]);

    expect((await authenticate({ email: 'admin@example.com', password: 'admin test password' })).role).toBe('admin');
    expect((await authenticate({ email: 'member@example.com', password: 'member test password' })).role).toBe('member');
  });

  it('is idempotent: running again changes nothing', async () => {
    const accounts = readSeedAccounts(env);
    await seedAccounts(accounts);
    const before = await User.find().select('+passwordHash').sort({ email: 1 }).lean();

    expect(await seedAccounts(accounts)).toEqual([
      { role: 'admin', outcome: 'unchanged' },
      { role: 'member', outcome: 'unchanged' },
    ]);
    expect(await User.find().select('+passwordHash').sort({ email: 1 }).lean()).toEqual(before);
  });

  it('promotes an existing member to admin, keeping their password and name', async () => {
    await registerMember({ name: 'Early Bird', email: 'admin@example.com', password: 'their own password' });

    expect(await seedAccounts(readSeedAccounts(env))).toEqual([
      { role: 'admin', outcome: 'role updated' },
      { role: 'member', outcome: 'created' },
    ]);

    const promoted = await authenticate({ email: 'admin@example.com', password: 'their own password' });
    expect(promoted).toMatchObject({ role: 'admin', name: 'Early Bird' });
    await expect(authenticate({ email: 'admin@example.com', password: 'admin test password' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
