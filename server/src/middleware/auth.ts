import type { RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { SESSION_COOKIE, type SessionOptions, verifySessionToken } from '../lib/session.js';
import { type PublicUser, User, toPublicUser } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`: the signed-in user, freshly loaded from the database. */
      user?: PublicUser;
    }
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Requires a valid session cookie. The user is reloaded on every request, so a changed role
 * or a deleted account takes effect immediately (PLAN.md §7). Otherwise → 401 UNAUTHENTICATED.
 */
export function createRequireAuth(options: SessionOptions): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const userId = typeof token === 'string' ? verifySessionToken(token, options) : null;
    if (!userId || !OBJECT_ID.test(userId)) throw unauthenticated();

    const user = await User.findById(userId);
    if (!user) throw unauthenticated();

    req.user = toPublicUser(user);
    next();
  };
}

/** Use after `requireAuth`. Members get 403 FORBIDDEN. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthenticated();
  if (req.user.role !== 'admin') throw forbidden('Only admins can do this.');
  next();
};
