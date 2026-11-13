import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * Field rules shared by registration and the seed script (PLAN.md §5 and §7).
 * The messages are written for people, because the client shows them next to the field.
 */
export const nameField = z
  .string({ error: 'Enter your name' })
  .trim()
  .min(1, 'Enter your name')
  .max(80, 'Use 80 characters or fewer');

export const emailField = z
  .string({ error: 'Enter your email' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email')
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const newPasswordField = z
  .string({ error: 'Enter a password' })
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use 72 characters or fewer')
  // bcrypt only reads the first 72 bytes, so a short password of multi-byte characters would be silently cut.
  .refine((value) => !bcrypt.truncates(value), 'Use fewer characters, or plainer ones; this password is too long');

export const registerBody = z.object({
  name: nameField,
  email: emailField,
  password: newPasswordField,
});

export const loginBody = z.object({
  email: z.string({ error: 'Enter your email' }).trim().toLowerCase().min(1, 'Enter your email'),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
});

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
