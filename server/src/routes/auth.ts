import { type RequestHandler, Router } from 'express';
import { AppError } from '../lib/errors.js';
import { type SessionOptions, endSession, startSession } from '../lib/session.js';
import { type LimitRule, clientKey, createAttemptLimiter, refuseWhenLimited } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { toPublicUser } from '../models/User.js';
import { type LoginBody, type RegisterBody, loginBody, registerBody } from '../schemas/auth.js';
import { authenticate, registerMember } from '../services/auth.js';

/** What may be tried from one address: failed sign-ins, and registrations of any kind. */
export interface AuthLimits {
  loginFailures: LimitRule;
  registrations: LimitRule;
}

/**
 * Ten wrong passwords per 15 minutes and ten new accounts per hour, per address. Failures are counted and successes
 * aren't, so people behind one office address can all sign in. Nothing here locks an account (that would let anyone lock
 * anyone out): it only slows guessing from one address. Passwords are also bcrypt-hashed, which makes each guess slow.
 */
export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  loginFailures: { windowMs: 15 * 60_000, max: 10 },
  registrations: { windowMs: 60 * 60_000, max: 10 },
};

/** `/api/auth/*` (PLAN.md §6). */
export function createAuthRouter(requireAuth: RequestHandler, session: SessionOptions, limits: AuthLimits = DEFAULT_AUTH_LIMITS): Router {
  const router = Router();
  const failedLogins = createAttemptLimiter(limits.loginFailures);
  const registrations = createAttemptLimiter(limits.registrations);

  router.post(
    '/register',
    refuseWhenLimited(registrations),
    (req, _res, next) => {
      registrations.record(clientKey(req)); // every attempt counts, whether or not it succeeds
      next();
    },
    validateBody(registerBody),
    async (req, res) => {
      const user = await registerMember(req.body as RegisterBody);
      startSession(res, user.id, session);
      res.status(201).json(toPublicUser(user));
    },
  );

  router.post('/login', refuseWhenLimited(failedLogins), validateBody(loginBody), async (req, res) => {
    let user;
    try {
      user = await authenticate(req.body as LoginBody);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') failedLogins.record(clientKey(req));
      throw error;
    }
    startSession(res, user.id, session);
    res.json(toPublicUser(user));
  });

  // Public on purpose: signing out must work even when the session has already expired.
  router.post('/logout', (_req, res) => {
    endSession(res, session);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
