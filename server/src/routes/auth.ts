import { type RequestHandler, Router } from 'express';
import { type SessionOptions, endSession, startSession } from '../lib/session.js';
import { validateBody } from '../middleware/validate.js';
import { toPublicUser } from '../models/User.js';
import { type LoginBody, type RegisterBody, loginBody, registerBody } from '../schemas/auth.js';
import { authenticate, registerMember } from '../services/auth.js';

/** `/api/auth/*` (PLAN.md §6). */
export function createAuthRouter(requireAuth: RequestHandler, session: SessionOptions): Router {
  const router = Router();

  router.post('/register', validateBody(registerBody), async (req, res) => {
    const user = await registerMember(req.body as RegisterBody);
    startSession(res, user.id, session);
    res.status(201).json(toPublicUser(user));
  });

  router.post('/login', validateBody(loginBody), async (req, res) => {
    const user = await authenticate(req.body as LoginBody);
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
