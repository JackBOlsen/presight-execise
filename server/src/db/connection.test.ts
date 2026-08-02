import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, createDatabase } from './connection.js';
import { applySchema } from './schema.js';

describe('createDatabase', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDatabase();
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('applies the pragmas the application depends on', () => {
    const db = createDatabase(':memory:');
    // Foreign keys are off by default in SQLite, so without this the schema's
    // REFERENCES clauses would be documentation rather than constraints.
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(
      1,
    );
    db.close();
  });

  it('creates the parent directory for a new database file', () => {
    // The default location is gitignored, so it is absent on a fresh clone and
    // on a container's first boot.
    const root = mkdtempSync(path.join(tmpdir(), 'presight-'));
    tempDirs.push(root);
    const file = path.join(root, 'nested', 'deeper', 'users.db');

    const db = createDatabase(file);
    applySchema(db);
    db.close();

    expect(existsSync(file)).toBe(true);
  });

  it('persists data across connections to the same file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'presight-'));
    tempDirs.push(root);
    const file = path.join(root, 'users.db');

    const first = createDatabase(file);
    applySchema(first);
    first.prepare('INSERT INTO nationalities (id, name) VALUES (1, ?)').run('British');
    first.close();

    const second = createDatabase(file);
    const row = second.prepare('SELECT name FROM nationalities WHERE id = 1').get() as {
      name: string;
    };
    expect(row.name).toBe('British');
    second.close();
  });

  it('enables write-ahead logging for a file-backed database', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'presight-'));
    tempDirs.push(root);
    const db = createDatabase(path.join(root, 'users.db'));
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(mode.journal_mode).toBe('wal');
    db.close();
  });
});

describe('the shared connection', () => {
  /**
   * Loaded against an in-memory path so these never touch the developer's real
   * database file, and never create an empty one in CI.
   */
  async function loadWithMemoryDb() {
    vi.stubEnv('DB_PATH', ':memory:');
    vi.resetModules();
    return import('./connection.js');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns the same instance on repeated calls', async () => {
    const connection = await loadWithMemoryDb();
    expect(connection.getDatabase()).toBe(connection.getDatabase());
    connection.closeDatabase();
  });

  it('opens a genuinely new database after being closed', async () => {
    const connection = await loadWithMemoryDb();
    connection.getDatabase().exec('CREATE TABLE marker (id INTEGER)');
    connection.closeDatabase();

    // Checking for the marker rather than object identity proves the handle was
    // really replaced, not merely re-referenced.
    const reopened = connection.getDatabase();
    const found = reopened
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'marker'")
      .get() as { c: number };
    expect(found.c).toBe(0);
    connection.closeDatabase();
  });

  it('is safe to close when nothing is open', async () => {
    const connection = await loadWithMemoryDb();
    connection.closeDatabase();
    expect(() => connection.closeDatabase()).not.toThrow();
  });
});
