import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

/**
 * SQLite access.
 *
 * Uses Node's built-in `node:sqlite` rather than `better-sqlite3`. The decision
 * is recorded in DECISIONS.md; the short version is that better-sqlite3 v13
 * publishes no prebuilt binaries, so it would require a Python and C++
 * toolchain on every machine that clones this repository — and "easy local
 * setup" is one of the things this exercise is judged on. The built-in module
 * needs no compiler, which also removes the build stage from the Docker image.
 *
 * The API is synchronous. That is a good fit here rather than a limitation:
 * SQLite reads from the local page cache are measured in microseconds, so the
 * cost of a query is far below the overhead of moving it off-thread, and
 * synchronous statements make transactions and cursors trivial to reason about.
 */
export type Database = DatabaseSync;

/** The value types SQLite accepts as a bound statement parameter. */
export type SqlValue = null | number | bigint | string | Uint8Array;

const IN_MEMORY = ':memory:';

/**
 * Open a database and apply the pragmas we depend on.
 *
 * Exported as a factory rather than only a singleton so tests can build a
 * disposable in-memory database with the same configuration as production.
 */
export function createDatabase(filePath: string = config.dbPath): Database {
  if (filePath !== IN_MEMORY) {
    // The default path lives under server/data, which is gitignored and so is
    // absent on a fresh clone and on the container's first boot.
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }

  const db = new DatabaseSync(filePath);

  // Write-ahead logging: readers do not block the writer. The API serves reads
  // while the seeder may still be writing, and it survives an unclean shutdown.
  db.exec('PRAGMA journal_mode = WAL');

  // Off by default in SQLite. Without this the REFERENCES clauses in the schema
  // would be documentation rather than constraints.
  db.exec('PRAGMA foreign_keys = ON');

  // Safe in combination with WAL: a crash can lose the last transaction but
  // cannot corrupt the database. Worth it for the bulk seed.
  db.exec('PRAGMA synchronous = NORMAL');

  // Wait rather than immediately failing with SQLITE_BUSY if a write is in
  // flight — relevant while the seeder runs against a live server.
  db.exec('PRAGMA busy_timeout = 5000');

  return db;
}

let instance: Database | undefined;

/** The process-wide connection used by the HTTP layer. */
export function getDatabase(): Database {
  instance ??= createDatabase();
  return instance;
}

/** Close the shared connection. Called on graceful shutdown. */
export function closeDatabase(): void {
  instance?.close();
  instance = undefined;
}
