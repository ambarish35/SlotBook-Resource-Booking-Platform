import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repo-root .env file, resolved the same way from src/ (tsx) and dist/ (node). */
export const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/** The built client, resolved the same way from src/ (tsx) and dist/ (node): <repo>/client/dist. */
export const CLIENT_DIST_DIR = fileURLToPath(new URL('../../client/dist', import.meta.url));

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
const configSchema = databaseSchema
  .extend({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    JWT_SECRET: z
      .string({ error: 'JWT_SECRET is required (see .env.example)' })
      .trim()
      .min(32, 'JWT_SECRET must be at least 32 characters (see .env.example for how to generate one)')
      .refine((value) => !/[<>]/.test(value), 'JWT_SECRET still contains a <placeholder> from .env.example'),
    // How many reverse proxies sit in front of the API. It decides which address Express believes a request came from
    // (X-Forwarded-For) and whether it was HTTPS (X-Forwarded-Proto), so a wrong value either lets a client forge its
    // address or makes every client look like the proxy. Required in production, where there is no safe default.
    TRUST_PROXY: z
      .string()
      .trim()
      .regex(/^[0-9]{1,2}$/, 'TRUST_PROXY must be a whole number of proxies: 0 for none, 1 behind one proxy')
      .transform(Number)
      .refine((value) => value <= 10, 'TRUST_PROXY must be 10 or less')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.TRUST_PROXY === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'TRUST_PROXY is required in production: 0 when clients reach the API directly, 1 behind one proxy such as Render',
      });
    }
  });

/** The API's settings. `TRUST_PROXY` is 0 unless set (and must be set in production). */
export type Config = Omit<z.infer<typeof configSchema>, 'TRUST_PROXY'> & { TRUST_PROXY: number };
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
  const parsed = parseEnv(configSchema, env);
  return { ...parsed, TRUST_PROXY: parsed.TRUST_PROXY ?? 0 };
}

/** Validates only the database settings, for scripts (such as the seed) that don't serve requests. */
export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return parseEnv(databaseSchema, env);
}
