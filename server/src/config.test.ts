import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Configuration is parsed once at startup so a mistake surfaces immediately
 * with a readable message, rather than as a puzzling runtime failure after the
 * container has already reported itself healthy.
 */
describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Re-import so the schema re-reads the stubbed environment. */
  async function load() {
    vi.resetModules();
    return (await import('./config.js')).config;
  }

  it('falls back to sensible defaults', async () => {
    const config = await load();
    expect(config.port).toBe(3000);
    expect(config.seed.userCount).toBe(50_000);
    expect(config.seed.randomSeed).toBe(42);
    expect(config.dbPath).toMatch(/users\.db$/);
  });

  it('resolves the database path independently of the working directory', async () => {
    // Otherwise starting from the repository root and from server/ would use
    // two different databases.
    const config = await load();
    expect(config.dbPath).toMatch(/[\\/]server[\\/]data[\\/]users\.db$/);
  });

  it('coerces numeric values from their string environment form', async () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('SEED_USER_COUNT', '250');
    const config = await load();
    expect(config.port).toBe(8080);
    expect(config.seed.userCount).toBe(250);
  });

  it.each([
    ['a non-numeric port', 'PORT', 'not-a-port'],
    ['a port out of range', 'PORT', '99999'],
    ['a zero port', 'PORT', '0'],
    ['an empty database path', 'DB_PATH', ''],
    ['an unknown environment', 'NODE_ENV', 'staging'],
  ])('refuses to start on %s', async (_label, key, value) => {
    vi.stubEnv(key, value);
    await expect(load()).rejects.toThrow(/Invalid environment configuration/);
  });

  it('names the offending variable in the error', async () => {
    vi.stubEnv('PORT', 'not-a-port');
    await expect(load()).rejects.toThrow(/PORT/);
  });

  describe('response validation', () => {
    it('is on outside production, where it catches mapping bugs', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect((await load()).validateResponses).toBe(true);
    });

    it('is off in production, where it is redundant cost', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect((await load()).validateResponses).toBe(false);
    });

    it('can be overridden explicitly', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VALIDATE_RESPONSES', 'true');
      expect((await load()).validateResponses).toBe(true);
    });
  });
});
