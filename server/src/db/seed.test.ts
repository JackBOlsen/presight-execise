import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_HOBBIES_PER_USER } from 'presight-shared';
import { createDatabase, type Database } from './connection.js';
import { applySchema } from './schema.js';
import { seedDatabase } from './seed.js';

/**
 * The seeder's contract.
 *
 * Determinism is the property worth protecting: it is what lets the tests
 * assert real counts, lets a reviewer's database match the one described in the
 * README, and lets a bug be reproduced from a seed number rather than from
 * somebody's copied database file.
 */
describe('seedDatabase', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  const users = (database: Database) =>
    database.prepare('SELECT id, first_name, last_name, age FROM users ORDER BY id').all();

  it('produces the requested number of users', () => {
    const result = seedDatabase(db, { userCount: 50 });
    expect(result.seeded).toBe(true);
    expect(result.users).toBe(50);
    expect(users(db)).toHaveLength(50);
  });

  it('is deterministic for a given seed', () => {
    seedDatabase(db, { userCount: 100, randomSeed: 7 });

    const other = createDatabase(':memory:');
    applySchema(other);
    seedDatabase(other, { userCount: 100, randomSeed: 7 });

    expect(users(other)).toEqual(users(db));
    other.close();
  });

  it('produces different data for a different seed', () => {
    seedDatabase(db, { userCount: 100, randomSeed: 7 });

    const other = createDatabase(':memory:');
    applySchema(other);
    seedDatabase(other, { userCount: 100, randomSeed: 8 });

    expect(users(other)).not.toEqual(users(db));
    other.close();
  });

  describe('the 0..10 hobbies rule', () => {
    it('never exceeds the maximum', () => {
      seedDatabase(db, { userCount: 500, randomSeed: 3 });
      const row = db
        .prepare('SELECT MAX(c) AS hi FROM (SELECT COUNT(*) c FROM user_hobbies GROUP BY user_id)')
        .get() as { hi: number };
      expect(row.hi).toBeLessThanOrEqual(MAX_HOBBIES_PER_USER);
    });

    it('represents both extremes even in a tiny dataset', () => {
      // A uniform draw would cover these at 50,000 rows but not at 20, and the
      // card layout for "no hobbies" and "+n" both need exercising.
      seedDatabase(db, { userCount: 20, randomSeed: 3 });
      const counts = db
        .prepare(
          `SELECT u.id, COUNT(uh.user_id) AS c FROM users u
             LEFT JOIN user_hobbies uh ON uh.user_id = u.id GROUP BY u.id`,
        )
        .all() as { id: number; c: number }[];
      expect(counts.some((r) => r.c === 0)).toBe(true);
      expect(counts.some((r) => r.c === MAX_HOBBIES_PER_USER)).toBe(true);
    });

    it('gives each user distinct hobbies', () => {
      seedDatabase(db, { userCount: 200, randomSeed: 5 });
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM (
             SELECT user_id, hobby_id FROM user_hobbies GROUP BY user_id, hobby_id HAVING COUNT(*) > 1)`,
        )
        .get() as { c: number };
      expect(row.c).toBe(0);
    });
  });

  it('populates both vocabularies', () => {
    seedDatabase(db, { userCount: 50 });
    const nationalities = db.prepare('SELECT COUNT(*) AS c FROM nationalities').get() as {
      c: number;
    };
    const hobbies = db.prepare('SELECT COUNT(*) AS c FROM hobbies').get() as { c: number };
    // Both must exceed the facet limit, or "top 20" would never truncate and
    // the ranking would go untested.
    expect(nationalities.c).toBeGreaterThan(20);
    expect(hobbies.c).toBeGreaterThan(20);
  });

  it('gives every user a resolvable nationality and avatar', () => {
    seedDatabase(db, { userCount: 100 });
    const orphans = db
      .prepare(
        `SELECT COUNT(*) AS c FROM users u
           LEFT JOIN nationalities n ON n.id = u.nationality_id WHERE n.id IS NULL`,
      )
      .get() as { c: number };
    expect(orphans.c).toBe(0);

    const badAvatar = db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE avatar NOT LIKE 'https://%'")
      .get() as { c: number };
    expect(badAvatar.c).toBe(0);
  });

  describe('idempotency', () => {
    it('leaves an existing dataset untouched', () => {
      // The container entrypoint runs this on every boot, so a second run must
      // not duplicate or rebuild the data.
      seedDatabase(db, { userCount: 50 });
      const before = users(db);

      const second = seedDatabase(db, { userCount: 999 });
      expect(second.seeded).toBe(false);
      expect(second.users).toBe(50);
      expect(users(db)).toEqual(before);
    });

    it('rebuilds when forced', () => {
      seedDatabase(db, { userCount: 50, randomSeed: 1 });
      const result = seedDatabase(db, { userCount: 30, randomSeed: 2, force: true });
      expect(result.seeded).toBe(true);
      expect(users(db)).toHaveLength(30);
    });
  });

  it('creates the indexes the query planner needs', () => {
    seedDatabase(db, { userCount: 50 });
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
    ).map((row) => row.name);

    for (const expected of [
      'idx_users_last_name',
      'idx_users_first_name',
      'idx_users_age',
      'idx_users_nationality',
      'idx_users_first_name_search',
      'idx_users_last_name_search',
      'idx_user_hobbies_hobby',
    ]) {
      expect(indexes).toContain(expected);
    }
  });
});
