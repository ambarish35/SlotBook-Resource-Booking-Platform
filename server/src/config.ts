import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repo-root .env file, resolved the same way from src/ (tsx) and dist/ (node). */
export const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Loads the repo-root .env into process.env when it exists, using Node's built-in loader.
 * Variables already set in the environment take precedence over the file.
 */
export function loadEnvFile(path: string = ENV_FILE): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: z
    .string({ error: 'MONGODB_URI is required (see .env.example)' })
    .trim()
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://')
    .refine((value) => !/[<>]/.test(value), 'MONGODB_URI still contains a <placeholder> from .env.example'),
  MONGODB_DB_NAME: z.string().trim().min(1).default('slotbook'),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Validates settings from the environment. Error messages name variables but never include their values. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
