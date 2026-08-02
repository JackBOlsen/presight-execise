import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './connection.js';
import { createFixtureDatabase } from '../test/fixture.js';

/**
 * The schema's guarantees, tested by trying to violate them.
 *
 * These constraints are the reason the API layer does not need defensive checks
 * of its own: if the database cannot hold a user with eleven hobbies, no code
 * path can produce one.
 */
describe('schema constraints', () => {
  let db: Database;

  beforeEach(() => {
    db = createFixtureDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe('the 0..10 hobbies rule', () => {
    it('rejects an eleventh hobby', () => {
      // User 12 already holds all ten fixture hobbies.
      const extra = db.prepare('INSERT INTO hobbies (id, name) VALUES (99, ?)');
      extra.run('Skydiving');

      expect(() =>
        db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (12, 99)').run(),
      ).toThrow(/at most 10 hobbies/);
    });

    it('allows a tenth', () => {
      // User 1 has two; there is room.
      expect(() =>
        db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (1, 10)').run(),
      ).not.toThrow();
    });

    it('permits a user with none', () => {
      const row = db.prepare('SELECT COUNT(*) AS c FROM user_hobbies WHERE user_id = 4').get() as {
        c: number;
      };
      expect(row.c).toBe(0);
    });
  });

  it('rejects the same hobby twice for one user', () => {
    // A duplicate would inflate that hobby's facet count without the user
    // actually holding it twice.
    expect(() =>
      db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (1, 2)').run(),
    ).toThrow(/UNIQUE|PRIMARY KEY/i);
  });

  it('rejects a hobby link pointing at no hobby', () => {
    expect(() =>
      db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (1, 999)').run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('rejects a user with an unknown nationality', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO users (id, avatar, first_name, last_name, age, nationality_id)
           VALUES (99, 'x', 'A', 'B', 30, 999)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it.each([-1, 121])('rejects an out-of-range age (%i)', (age) => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO users (id, avatar, first_name, last_name, age, nationality_id)
           VALUES (99, 'x', 'A', 'B', ?, 1)`,
        )
        .run(age),
    ).toThrow(/CHECK/i);
  });

  it('rejects a duplicate nationality name', () => {
    expect(() =>
      db.prepare('INSERT INTO nationalities (id, name) VALUES (99, ?)').run('British'),
    ).toThrow(/UNIQUE/i);
  });

  it("removes a user's hobby links when the user is deleted", () => {
    db.prepare('DELETE FROM users WHERE id = 12').run();
    const row = db.prepare('SELECT COUNT(*) AS c FROM user_hobbies WHERE user_id = 12').get() as {
      c: number;
    };
    expect(row.c).toBe(0);
  });

  it('enforces foreign keys at all (the pragma is actually on)', () => {
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });
});
