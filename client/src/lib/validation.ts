/**
 * Form checks that follow the server's rules (server/src/schemas/auth.ts), with the same messages,
 * so most mistakes are caught before a request is sent. Each returns an error message, or undefined
 * when the value is fine.
 *
 * The server stays the authority. The email check below is deliberately looser than the server's, and
 * anything it lets through that the server rejects comes back as a 400 whose field messages the forms show.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter your name';
  if (name.length > 80) return 'Use 80 characters or fewer';
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email';
  if (!EMAIL.test(email)) return 'Enter a valid email address';
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Enter a password';
  if (value.length < 8) return 'Use at least 8 characters';
  if (value.length > 72) return 'Use 72 characters or fewer';
  // The server hashes only the first 72 bytes, so it refuses longer ones.
  if (new TextEncoder().encode(value).length > 72) return 'Use fewer characters, or plainer ones; this password is too long';
  return undefined;
}

/** Sign-in only checks that something was entered; whether it's right is the server's call. */
export function validateLoginEmail(value: string): string | undefined {
  return value.trim() ? undefined : 'Enter your email';
}

/** Passwords are never trimmed, so a password of spaces still counts as entered. */
export function validateLoginPassword(value: string): string | undefined {
  return value ? undefined : 'Enter your password';
}
