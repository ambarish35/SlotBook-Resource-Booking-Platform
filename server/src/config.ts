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

/** Settings every entry point needs: the API and the seed script. */
const databaseSchema = z.object({
  MONGODB_URI: z
    .string({ error: 'MONGODB_URI is required (see .env.example)' })
    .trim()
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://')
    .refine((value) => !/[<>]/.test(value), 'MONGODB_URI still contains a <placeholder> from .env.example'),
  MONGODB_DB_NAME: z.string().trim().min(1).default('slotbook'),
});

/** Settings only the API needs. */
const configSchema = databaseSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required (see .env.example)' })
    .trim()
    .min(32, 'JWT_SECRET must be at least 32 characters (see .env.example for how to generate one)')
    .refine((value) => !/[<>]/.test(value), 'JWT_SECRET still contains a <placeholder> from .env.example'),
});

export type Config = z.infer<typeof configSchema>;
export type DatabaseConfig = z.infer<typeof databaseSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Validates `env` against a schema. Messages name the variables and never include their values. */
export function parseEnv<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv, label = 'configuration'): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`);
    throw new ConfigError(`Invalid ${label}:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

/** Validates the API's settings. Error messages name variables but never include their values. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parseEnv(configSchema, env);
}

/** Validates only the database settings, for scripts (such as the seed) that don't serve requests. */
export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return parseEnv(databaseSchema, env);
}
