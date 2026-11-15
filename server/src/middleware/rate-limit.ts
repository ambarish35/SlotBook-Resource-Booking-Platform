import type { RequestHandler } from 'express';
import { now } from '../lib/clock.js';
import { tooManyAttempts } from '../lib/errors.js';

export interface LimitRule {
  /** The length of the window, which starts at the key's first recorded attempt. */
  windowMs: number;
  /** How many attempts a key may record in a window before it is refused. */
  max: number;
}

/** Keeps at most this many keys, so a flood of different addresses can't grow the map without limit. */
const MAX_KEYS = 10_000;

/**
 * A small in-memory attempt counter with a fixed window per key (an address). It lives in this process: it is empty
 * after a restart and not shared between instances, which is enough for one instance (PLAN.md §14). It adds no
 * dependency (PLAN.md D10). The clock is the server's (`lib/clock.ts`), so tests can move time.
 */
export function createAttemptLimiter({ windowMs, max }: LimitRule) {
  const windows = new Map<string, { count: number; resetsAt: number }>();

  function live(key: string, at: number) {
    const entry = windows.get(key);
    if (!entry) return undefined;
    if (entry.resetsAt <= at) {
      windows.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    /** Whole seconds the key must wait, or 0 when it may go ahead. */
    retryAfterSeconds(key: string): number {
      const at = now().getTime();
      const entry = live(key, at);
      return entry && entry.count >= max ? Math.max(1, Math.ceil((entry.resetsAt - at) / 1000)) : 0;
    },

    /** Counts one attempt for the key. */
    record(key: string): void {
      const at = now().getTime();
      const entry = live(key, at);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (windows.size >= MAX_KEYS) {
        for (const [other, value] of windows) if (value.resetsAt <= at) windows.delete(other);
        // Still full of live windows: drop the oldest (a Map iterates in insertion order).
        if (windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value as string);
      }
      windows.set(key, { count: 1, resetsAt: at + windowMs });
    },

    /** For tests. */
    size: () => windows.size,
  };
}

export type AttemptLimiter = ReturnType<typeof createAttemptLimiter>;

/** The address the limits are kept per. With `trust proxy` set to the real number of proxies this is the client's. */
export const clientKey = (req: { ip?: string }): string => req.ip ?? 'unknown';

/** Refuses the request with 429 (and `Retry-After`) while the client's address is over the limit. Counts nothing itself. */
export function refuseWhenLimited(limiter: AttemptLimiter): RequestHandler {
  return (req, res, next) => {
    const wait = limiter.retryAfterSeconds(clientKey(req));
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      next(tooManyAttempts(wait));
      return;
    }
    next();
  };
}
