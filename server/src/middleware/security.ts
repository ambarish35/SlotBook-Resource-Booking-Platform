import type { RequestHandler } from 'express';
import { forbidden } from '../lib/errors.js';

/**
 * What the built page may load: only this site's own files. The client has no inline scripts or styles, no web fonts and
 * no third-party requests, so nothing here needs `unsafe-inline` or a host list. `data:` images are for the empty favicon.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Six months. No `includeSubDomains` or `preload`: those commit the whole domain, which is the host's, not ours. */
const HSTS = 'max-age=15552000';

/**
 * Response headers for everything the app sends. HSTS is only sent on requests that arrived over HTTPS (`req.secure`,
 * which follows `trust proxy`), so a local `http://localhost` run never pins itself. API responses are never cached.
 */
export function securityHeaders({ hsts }: { hsts: boolean }): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (hsts && req.secure) res.setHeader('Strict-Transport-Security', HSTS);
    next();
  };
}

/** Authenticated data must not sit in a shared cache. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A second layer against cross-site request forgery, behind `SameSite=Lax` on the session cookie and the fact that
 * bodies are only read as `application/json` (which a plain cross-site form can't send). `SameSite` alone isn't enough:
 * a page on another port or a sibling subdomain is the same site, so the cookie goes with its requests.
 *
 * A request that changes data is judged by `Sec-Fetch-Site` when the browser sends it (every current browser does). It
 * is the browser's own verdict, which a page can neither forge nor hide, and only `same-origin` (and `none`, a person
 * acting directly) is let through. It decides alone, deliberately: the `Host` the API sees is not always the host the
 * browser used (Vite's dev proxy rewrites it, and so can a production proxy), so comparing `Origin` with `Host` here
 * would refuse the app's own requests. Only when the header is missing (an older browser) is `Origin` compared with
 * `Host`, `null` included. A request with neither header (curl, tests) goes through: it still needs the cookie, which
 * a browser only attaches in the cases above. Reads are not restricted. There is no CORS, so no other origin may read
 * a response anyway.
 */
export const refuseCrossSiteWrites: RequestHandler = (req, _res, next) => {
  if (!WRITES.has(req.method)) {
    next();
    return;
  }
  const site = req.get('sec-fetch-site');
  if (site !== undefined) {
    if (site === 'same-origin' || site === 'none') next();
    else next(forbidden('This request came from another site, so it was refused.'));
    return;
  }
  const origin = req.get('origin');
  if (origin !== undefined) {
    let originHost: string | null;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      originHost = null; // "null" and anything else that isn't an origin
    }
    if (originHost === null || originHost !== (req.get('host') ?? '').toLowerCase()) {
      next(forbidden('This request came from another site, so it was refused.'));
      return;
    }
  }
  next();
};
