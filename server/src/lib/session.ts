import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';

/** Session settings (PLAN.md §7): an HS256 JWT in an httpOnly, SameSite=Lax cookie that lasts 7 days. */
export const SESSION_COOKIE = 'slotbook_session';
export const SESSION_DAYS = 7;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface SessionOptions {
  jwtSecret: string;
  /** Sets the cookie's `Secure` flag; true in production (PLAN.md §7). */
  secureCookies: boolean;
}

/** Cookie attributes. `clearCookie` must use the same ones (path, flags) to remove the cookie. */
function cookieOptions({ secureCookies }: SessionOptions): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' };
}

export function signSessionToken(userId: string, { jwtSecret }: SessionOptions): string {
  return jwt.sign({}, jwtSecret, { algorithm: 'HS256', expiresIn: `${SESSION_DAYS}d`, subject: userId });
}

/** Returns the user id a valid token was issued for, or null for anything else (bad signature, expired, wrong algorithm…). */
export function verifySessionToken(token: string, { jwtSecret }: SessionOptions): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function startSession(res: Response, userId: string, options: SessionOptions): void {
  res.cookie(SESSION_COOKIE, signSessionToken(userId, options), { ...cookieOptions(options), maxAge: SESSION_MAX_AGE_MS });
}

export function endSession(res: Response, options: SessionOptions): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(options));
}
