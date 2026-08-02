import type { DatabaseSync } from 'node:sqlite';
import { MAX_HOBBIES_PER_USER } from 'presight-shared';

/**
 * The database schema.
 *
 * Kept as SQL in a TypeScript module rather than a `.sql` file on disk so that
 * `tsc` remains the entire build: there is no asset-copy step to get wrong, and
 * running from `src/` under tsx behaves identically to running the compiled
 * `dist/` in the container.
 *
 * Tables and indexes are separate because the seeder deliberately creates the
 * indexes *after* the bulk insert — maintaining seven B-trees while writing
 * 300k rows is markedly slower than building them once at the end.
 */

export const TABLES_SQL = `
-- Nationality is single-valued per user, but kept in its own table so the set
-- of nationalities is canonical: a typo cannot invent a new one, and the facet
-- counts group by a foreign key rather than by a repeated free-text string.
CREATE TABLE IF NOT EXISTS nationalities (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS hobbies (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  avatar         TEXT    NOT NULL,
  first_name     TEXT    NOT NULL,
  last_name      TEXT    NOT NULL,
  age            INTEGER NOT NULL CHECK (age >= 0 AND age <= 120),
  nationality_id INTEGER NOT NULL REFERENCES nationalities(id)
);

-- Hobbies are many-to-many, so they get a junction table rather than a JSON or
-- comma-separated column. That is what makes "users having ALL of these
-- hobbies" and the top-20 hobby counts index-backed relational queries instead
-- of string matching over every row.
--
-- The composite primary key is the uniqueness constraint: a user cannot hold
-- the same hobby twice, which would otherwise double-count them in a facet.
-- WITHOUT ROWID stores the row directly in that key's B-tree, avoiding a second
-- lookup for a table that is nothing but its key.
CREATE TABLE IF NOT EXISTS user_hobbies (
  user_id  INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  hobby_id INTEGER NOT NULL REFERENCES hobbies(id),
  PRIMARY KEY (user_id, hobby_id)
) WITHOUT ROWID;

-- The brief's "0 to 10 hobbies per user" as an enforced invariant rather than a
-- convention the seeder happens to follow. SQLite's CHECK cannot see other
-- rows, so the upper bound needs a trigger. The lower bound is zero and needs
-- no enforcement — only representation, which the seeder guarantees.
CREATE TRIGGER IF NOT EXISTS trg_user_hobbies_max_per_user
BEFORE INSERT ON user_hobbies
WHEN (SELECT COUNT(*) FROM user_hobbies WHERE user_id = NEW.user_id) >= ${MAX_HOBBIES_PER_USER}
BEGIN
  SELECT RAISE(ABORT, 'a user may have at most ${MAX_HOBBIES_PER_USER} hobbies');
END;
`;

export const INDEXES_SQL = `
-- Sort indexes. Each pairs the sort column with \`id\`, which is precisely what
-- keyset pagination seeks on: the cursor compares the row value
-- (sort_column, id), so this index turns "the page after X" into a range seek
-- rather than counting past every preceding row.
CREATE INDEX IF NOT EXISTS idx_users_last_name    ON users(last_name, id);
CREATE INDEX IF NOT EXISTS idx_users_first_name   ON users(first_name, id);
CREATE INDEX IF NOT EXISTS idx_users_age          ON users(age, id);
CREATE INDEX IF NOT EXISTS idx_users_nationality  ON users(nationality_id, id);

-- Search indexes, separate from the sort indexes above because they carry a
-- different collation. The text filter is a case-insensitive prefix match, and
-- SQLite will only reduce LIKE to an index range scan when the column is
-- indexed with NOCASE. (The pattern must also be bound whole from JavaScript —
-- building it in SQL with \`? || '%'\` defeats this and forces a full scan.)
CREATE INDEX IF NOT EXISTS idx_users_first_name_search ON users(first_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_last_name_search  ON users(last_name  COLLATE NOCASE);

-- The junction table's primary key already covers "which hobbies does this user
-- have". This is the other direction — "which users have this hobby" — used by
-- the hobby filter and by the top-20 hobby counts.
CREATE INDEX IF NOT EXISTS idx_user_hobbies_hobby ON user_hobbies(hobby_id, user_id);
`;

/** Create tables and the hobby-count trigger, without the indexes. */
export function applyTables(db: DatabaseSync): void {
  db.exec(TABLES_SQL);
}

/** Create the indexes. Cheap to call repeatedly thanks to IF NOT EXISTS. */
export function applyIndexes(db: DatabaseSync): void {
  db.exec(INDEXES_SQL);
}

/** Bring an empty or partial database fully up to date. */
export function applySchema(db: DatabaseSync): void {
  applyTables(db);
  applyIndexes(db);
}

/** Drop everything. Used by `seed --force` to guarantee a clean rebuild. */
export function dropSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_user_hobbies_max_per_user;
    DROP TABLE IF EXISTS user_hobbies;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS hobbies;
    DROP TABLE IF EXISTS nationalities;
  `);
}
