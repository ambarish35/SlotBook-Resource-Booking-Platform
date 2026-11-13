import bcrypt from 'bcryptjs';
import { emailTaken, invalidCredentials } from '../lib/errors.js';
import { User, type UserDocument, type UserRole } from '../models/User.js';
import type { LoginBody, RegisterBody } from '../schemas/auth.js';

const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** MongoDB reports a violated unique index as error code 11000. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

export interface NewUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Creates a user. A duplicate email, including two requests racing, hits the unique index → 409 EMAIL_TAKEN. */
export async function createUser({ name, email, password, role }: NewUser): Promise<UserDocument> {
  const passwordHash = await hashPassword(password);
  try {
    return await User.create({ name, email, passwordHash, role });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw emailTaken();
    throw error;
  }
}

/** Public registration always creates a member; the role can't be chosen by the caller (PLAN.md §7). */
export function registerMember({ name, email, password }: RegisterBody): Promise<UserDocument> {
  return createUser({ name, email, password, role: 'member' });
}

// A real bcrypt hash to compare against when the email is unknown, so that a wrong email and a
// wrong password take about the same time and the response doesn't reveal which accounts exist.
let unknownUserHash: Promise<string> | undefined;

export async function authenticate({ email, password }: LoginBody): Promise<UserDocument> {
  const user = await User.findOne({ email }).select('+passwordHash');
  const hash = user?.passwordHash ?? (await (unknownUserHash ??= hashPassword('no such account')));
  const matches = await bcrypt.compare(password, hash);
  if (!user || !matches) throw invalidCredentials();
  return user;
}
