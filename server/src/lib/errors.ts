/** Every error code the API returns (PLAN.md §6). */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'NAME_TAKEN'
  | 'INTERNAL_ERROR';

/** The JSON body of every error response: `{ "error": { "code", "message", "details"? } }`. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}

/** An expected failure that maps to a specific HTTP status and error code. */
export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}

export const validationError = (fields: Record<string, string>, message = 'Check the highlighted fields and try again.') =>
  new AppError(400, 'VALIDATION_ERROR', message, { fields });

export const unauthenticated = (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message);

export const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

export const forbidden = (message = "You don't have access to this.") => new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);

export const emailTaken = () => new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');

export const nameTaken = () => new AppError(409, 'NAME_TAKEN', 'A resource with this name already exists.');
