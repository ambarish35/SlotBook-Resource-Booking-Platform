import express from 'express';
import { isDatabaseConnected } from './db.js';

/** Builds the Express app without starting a server, so tests can use it directly. */
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    if (isDatabaseConnected()) {
      res.json({ status: 'ok', db: 'connected' });
    } else {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  return app;
}
