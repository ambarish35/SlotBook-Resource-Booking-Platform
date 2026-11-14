import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { validationError } from '../lib/errors.js';

/** Maps Zod issues to `{ field: message }`, keeping the first message for each field. */
export function fieldErrors(issues: readonly z.core.$ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'body';
    fields[field] ??= issue.message;
  }
  return fields;
}

/**
 * Parses a query string against a Zod schema. Express 5 makes `req.query` read-only, so unlike
 * `validateBody` this returns the parsed value instead of replacing the request's.
 * Failure → 400 VALIDATION_ERROR with `details.fields`.
 */
export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) throw validationError(fieldErrors(result.error.issues));
  return result.data;
}

/**
 * Validates `req.body` against a Zod schema and replaces it with the parsed result.
 * Unknown keys are dropped, so for example a `role` sent to register never reaches the service.
 * Failure → 400 VALIDATION_ERROR with `details.fields`.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(validationError(fieldErrors(result.error.issues)));
      return;
    }
    req.body = result.data;
    next();
  };
}
