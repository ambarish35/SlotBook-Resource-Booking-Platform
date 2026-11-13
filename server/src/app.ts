import cookieParser from 'cookie-parser';
import express from 'express';
import { isDatabaseConnected } from './db.js';
import type { SessionOptions } from './lib/session.js';
import { createRequireAuth } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';

export type AppOptions = SessionOptions;

/** Builds the Express app without starting a server, so tests can use it directly. */
export function createApp(options: AppOptions) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    if (isDatabaseConnected()) {
      res.json({ status: 'ok', db: 'connected' });
    } else {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  const requireAuth = createRequireAuth(options);
  app.use('/api/auth', createAuthRouter(requireAuth, options));

  app.use('/api', apiNotFound);
  app.use(errorHandler);

  return app;
}
