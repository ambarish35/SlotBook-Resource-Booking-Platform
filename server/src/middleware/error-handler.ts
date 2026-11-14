import type { ErrorRequestHandler, RequestHandler } from 'express';
import { redactConnectionStrings } from '../db.js';
import { AppError, notFound, validationError } from '../lib/errors.js';

/** Unknown `/api/*` paths get the error envelope instead of Express's HTML 404. */
export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(notFound('API route not found.'));
};

/**
 * body-parser failures (malformed JSON, too large, unsupported charset or encoding, aborted upload…)
 * all carry a 4xx `status` and a string `type` such as "entity.parse.failed". Other errors don't have a `type`.
 */
function isBodyParserError(error: unknown): error is { status: number; type: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, type } = error as { status?: unknown; type?: unknown };
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500;
}

function bodyParserMessage(type: string): string {
  if (type === 'entity.too.large') return 'The request body is too large.';
  if (type === 'entity.parse.failed') return 'The request body must be valid JSON.';
  return 'The request body could not be read.';
}

/**
 * The single place where errors become responses, always in the envelope from PLAN.md §6.
 * Unexpected errors are logged (credentials redacted) but never leaked to the client.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (isBodyParserError(error)) {
    appError = validationError({}, bodyParserMessage(error.type));
  } else if (error instanceof URIError) {
    // Express couldn't decode a path parameter (an id such as `%E0%A4%A`), so no route handler ran. It is a
    // malformed id, which PLAN.md §6 answers with 404, the same as an id that doesn't exist.
    appError = notFound();
  } else {
    const text = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    console.error(`Unhandled API error: ${redactConnectionStrings(text)}`);
    appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again.');
  }

  res.status(appError.status).json(appError.toBody());
};
