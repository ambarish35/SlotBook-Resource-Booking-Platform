import cookieParser from 'cookie-parser';
import express from 'express';
import { isDatabaseConnected } from './db.js';
import { notFound } from './lib/errors.js';
import type { SessionOptions } from './lib/session.js';
import { createRequireAuth } from './middleware/auth.js';
import { serveClient } from './middleware/client.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import type { LimitRule } from './middleware/rate-limit.js';
import { noStore, refuseCrossSiteWrites, securityHeaders } from './middleware/security.js';
import { type AuthLimits, DEFAULT_AUTH_LIMITS, createAuthRouter } from './routes/auth.js';
import { createBookingsRouter } from './routes/bookings.js';
import { createResourcesRouter } from './routes/resources.js';

export interface AppOptions extends SessionOptions {
  /**
   * How many reverse proxies sit in front (see `TRUST_PROXY` in config.ts). 0, the default, trusts no `X-Forwarded-*`
   * header: the address is the socket's, and a request is HTTPS only if it arrived over TLS.
   */
  trustProxy?: number;
  /** Send Strict-Transport-Security on requests that arrived over HTTPS. True in production. */
  hsts?: boolean;
  /** The built client to serve from this origin. Left out in development, where Vite serves it. */
  clientDir?: string;
  /** Limits on failed sign-ins and on registrations per address; tests pass small ones. */
  authLimits?: Partial<Record<keyof AuthLimits, LimitRule>>;
}

/** Builds the Express app without starting a server, so tests can use it directly. */
export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? 0);
  app.use(securityHeaders({ hsts: options.hsts ?? false }));

  // Health and readiness are different questions (PLAN.md §6). Health: is the process serving? It never touches the
  // database, so a host that restarts an unhealthy instance doesn't do so over a database blip. Readiness: can it work?
  app.get('/api/health', noStore, (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/ready', noStore, (_req, res) => {
    if (isDatabaseConnected()) {
      res.json({ status: 'ready', db: 'connected' });
    } else {
      res.status(503).json({ status: 'unavailable', db: 'disconnected' });
    }
  });

  app.use('/api', noStore, refuseCrossSiteWrites);
  app.use(express.json());
  app.use(cookieParser());

  const requireAuth = createRequireAuth(options);
  const limits: AuthLimits = { ...DEFAULT_AUTH_LIMITS, ...options.authLimits };
  app.use('/api/auth', createAuthRouter(requireAuth, options, limits));
  app.use('/api/resources', createResourcesRouter(requireAuth));
  app.use('/api/bookings', createBookingsRouter(requireAuth));

  app.use('/api', apiNotFound);

  if (options.clientDir) serveClient(app, options.clientDir);
  // Whatever is left (a write to a path that isn't an API route, say) is a JSON 404 too, never Express's HTML page.
  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);

  return app;
}
