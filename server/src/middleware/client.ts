import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { ConfigError } from '../config.js';

/** Fails at startup, with a message that says what to do, when the client hasn't been built. */
export function ensureClientBuild(dir: string): void {
  if (!existsSync(path.join(dir, 'index.html'))) {
    throw new ConfigError('The built client was not found (client/dist/index.html). Run "npm run build" before "npm start".');
  }
}

/**
 * Serves the built client from the same origin as the API (PLAN.md M8). Files with a content hash in their name
 * (everything under `/assets`) are cached for a year; `index.html` is always revalidated, so a new deploy shows at once.
 *
 * React Router deep links (`/resources/abc`, `/bookings?view=history`) get `index.html`. Anything under `/api` never
 * does, and neither does a path with a file extension, so a missing script or image is a plain 404 and not a page of
 * HTML that a browser would try to run. Mount this after the API routes, so `/api/*` has already been answered.
 */
export function serveClient(app: Express, dir: string): void {
  const index = path.join(dir, 'index.html');

  app.use(
    express.static(dir, {
      index: false,
      redirect: false,
      dotfiles: 'ignore',
      setHeaders(res, file) {
        const hashed = path.basename(path.dirname(file)) === 'assets';
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  app.use((req, res, next) => {
    const read = req.method === 'GET' || req.method === 'HEAD';
    if (!read || req.path === '/api' || req.path.startsWith('/api/') || path.extname(req.path) !== '') {
      next();
      return;
    }
    res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } }, (error) => {
      if (error) next(error);
    });
  });
}
