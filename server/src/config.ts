import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Environment configuration, validated once at startup.
 *
 * Parsing eagerly means a typo in `PORT` or a missing `DB_PATH` fails
 * immediately with a readable message, rather than surfacing as a confusing
 * runtime error once the container is already reporting itself as up.
 */

/**
 * Resolved from this module's own location rather than `process.cwd()`, so the
 * default database path is the same whether the server is started from the
 * repository root, from `server/`, or by the container entrypoint.
 *
 * `src/config.ts` and `dist/config.js` are both one level below the package
 * root, so the same `..` works for the dev and built layouts alike.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** SQLite file. `:memory:` is honoured, which is what the tests use. */
  DB_PATH: z
    .string()
    .min(1)
    .default(path.join(packageRoot, 'data', 'users.db')),

  SEED_USER_COUNT: z.coerce.number().int().min(1).max(1_000_000).default(50_000),
  /** Fixed so every machine and every container produces an identical database. */
  SEED_RANDOM_SEED: z.coerce.number().int().default(42),

  /**
   * Validate outgoing responses against the shared schemas. Catches mapping
   * bugs during development and in tests; redundant cost in production, where
   * the server is the authority on its own output.
   */
  VALIDATE_RESPONSES: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  dbPath: env.DB_PATH,
  seed: {
    userCount: env.SEED_USER_COUNT,
    randomSeed: env.SEED_RANDOM_SEED,
  },
  validateResponses: env.VALIDATE_RESPONSES ?? env.NODE_ENV !== 'production',
} as const;

export type Config = typeof config;
