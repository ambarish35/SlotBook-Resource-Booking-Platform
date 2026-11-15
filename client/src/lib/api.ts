/** An error response from the API (the envelope in PLAN.md §6), or a failure to reach it at all (status 0). */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { fields?: Record<string, string>; slots?: unknown },
  ) {
    super(message);
  }

  /** Per-field messages from a 400 VALIDATION_ERROR. */
  get fields(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

let sessionExpiredHandler: (() => void) | undefined;

/** The auth provider registers here so that any 401 UNAUTHENTICATED sends the user back to sign in. */
export function setSessionExpiredHandler(handler: (() => void) | undefined): void {
  sessionExpiredHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calls the API under `/api` with the session cookie. Resolves with the parsed JSON body
 * (undefined for 204) and rejects with an ApiError for every failure.
 */
export async function apiFetch<T = void>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await response.text();
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "We couldn't reach the server.");
  }

  const data = parseJson(text);
  if (response.ok) return data as T;

  const envelope = (data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | undefined)?.error;
  const error = new ApiError(
    response.status,
    envelope?.code ?? 'UNKNOWN_ERROR',
    envelope?.message ?? 'Something went wrong.',
    envelope?.details,
  );
  if (error.status === 401 && error.code === 'UNAUTHENTICATED') sessionExpiredHandler?.();
  throw error;
}
