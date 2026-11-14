/** Every error code the API returns (PLAN.md §6). */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'NAME_TAKEN'
  | 'SLOT_UNAVAILABLE'
  | 'BOOKING_NOT_CANCELLABLE'
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

/** A slot the booking asked for can't be booked: `booked` (taken by someone) or `past` (it has already started). */
export interface UnavailableSlot {
  start: string;
  reason: 'booked' | 'past';
}

/** 409 for a booking request that includes an unavailable slot. The whole request is refused (PLAN.md §8). */
export const slotUnavailable = (slots: UnavailableSlot[]) =>
  new AppError(
    409,
    'SLOT_UNAVAILABLE',
    slots.every((slot) => slot.reason === 'past')
      ? 'Some of the times you chose have already started. Nothing was booked.'
      : 'Some of the times you chose are no longer available. Nothing was booked.',
    { slots },
  );

export const bookingNotCancellable = (message: string) => new AppError(409, 'BOOKING_NOT_CANCELLABLE', message);
