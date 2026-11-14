import { z } from 'zod';
import { parseEnv } from './config.js';
import { DEMO_RESOURCES, type DemoResource } from './demo-resources.js';
import { NAME_COLLATION, Resource } from './models/Resource.js';
import { User, type UserRole } from './models/User.js';
import { emailField, nameField, newPasswordField } from './schemas/auth.js';
import { createUser, isDuplicateKeyError } from './services/auth.js';

/** A password still holding the `<placeholder>` text copied from .env.example. */
const seedPassword = newPasswordField.refine((value) => !/^<.*>$/.test(value), 'still holds the placeholder from .env.example');

const seedSchema = z
  .object({
    SEED_ADMIN_NAME: nameField.default('Admin'),
    SEED_ADMIN_EMAIL: emailField,
    SEED_ADMIN_PASSWORD: seedPassword,
    SEED_MEMBER_NAME: nameField.default('Member'),
    SEED_MEMBER_EMAIL: emailField,
    SEED_MEMBER_PASSWORD: seedPassword,
  })
  .refine((env) => env.SEED_ADMIN_EMAIL !== env.SEED_MEMBER_EMAIL, {
    path: ['SEED_MEMBER_EMAIL'],
    error: 'must differ from SEED_ADMIN_EMAIL',
  });

export interface SeedAccount {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Reads the demo accounts from `SEED_*` variables. Error messages name variables, never their values. */
export function readSeedAccounts(env: NodeJS.ProcessEnv = process.env): SeedAccount[] {
  const s = parseEnv(seedSchema, env, 'seed configuration');
  return [
    { role: 'admin', name: s.SEED_ADMIN_NAME, email: s.SEED_ADMIN_EMAIL, password: s.SEED_ADMIN_PASSWORD },
    { role: 'member', name: s.SEED_MEMBER_NAME, email: s.SEED_MEMBER_EMAIL, password: s.SEED_MEMBER_PASSWORD },
  ];
}

export type SeedOutcome = 'created' | 'role updated' | 'unchanged';

/**
 * Makes sure each account exists with the stated role, and is safe to run again:
 * - a missing account is created;
 * - an existing account keeps its name and password, and only its role is corrected (this is how
 *   an already-registered person becomes an admin, since roles change only through the seed or the database);
 * - anything else is left alone.
 */
export async function seedAccounts(accounts: SeedAccount[]): Promise<{ role: UserRole; outcome: SeedOutcome }[]> {
  const results: { role: UserRole; outcome: SeedOutcome }[] = [];
  for (const account of accounts) {
    const existing = await User.findOne({ email: account.email });
    if (!existing) {
      await createUser(account);
      results.push({ role: account.role, outcome: 'created' });
    } else if (existing.role !== account.role) {
      existing.role = account.role;
      await existing.save();
      results.push({ role: account.role, outcome: 'role updated' });
    } else {
      results.push({ role: account.role, outcome: 'unchanged' });
    }
  }
  return results;
}

/**
 * Creates each demo resource that doesn't exist yet and leaves existing ones alone, matching names
 * ignoring case. An admin's later edits, or a resource they deactivated, are never overwritten.
 */
export async function seedResources(
  resources: DemoResource[] = DEMO_RESOURCES,
): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const resource of resources) {
    if (await Resource.exists({ name: resource.name }).collation(NAME_COLLATION)) {
      existing += 1;
      continue;
    }
    try {
      await Resource.create(resource);
      created += 1;
    } catch (error) {
      // Another seed run created it between the check and the insert; that still means it exists.
      if (!isDuplicateKeyError(error)) throw error;
      existing += 1;
    }
  }
  return { created, existing };
}
