import { createDatabase, type Database } from '../db/connection.js';
import { applySchema } from '../db/schema.js';

/**
 * A small, hand-written dataset.
 *
 * Deliberately not generated: with twelve users every expected count can be
 * checked by reading the table below, so a failing assertion points at the code
 * rather than raising the question of whether the test's own arithmetic is
 * right. Property-style checks over a larger generated set live in the tests
 * that call the seeder directly.
 *
 * Each row exists to exercise something specific:
 *   - Ada (1) and ADA (8) share a surname and an age, so the id tie-breaker has
 *     something to break, and differ in case, so the search must ignore it.
 *   - Alonzo (4) has no hobbies at all — the lower bound of the 0..10 rule.
 *   - Zed (12) has all ten — the upper bound — and sorts first by surname while
 *     sorting last by first name, so a broken ORDER BY shows up immediately.
 *   - Per%y (11) contains a literal LIKE wildcard, which must not behave as one.
 */

export const FIXTURE_HOBBIES = [
  'Baking',
  'Chess',
  'Cooking',
  'Hiking',
  'Painting',
  'Reading',
  'Running',
  'Sailing',
  'Writing',
  'Yoga',
] as const;

export const FIXTURE_NATIONALITIES = ['American', 'British', 'Danish', 'Dutch', 'Finnish'] as const;

export interface FixtureUser {
  id: number;
  first_name: string;
  last_name: string;
  age: number;
  nationality: string;
  hobbies: string[];
}

export const FIXTURE_USERS: FixtureUser[] = [
  {
    id: 1,
    first_name: 'Ada',
    last_name: 'Lovelace',
    age: 36,
    nationality: 'British',
    hobbies: ['Chess', 'Reading'],
  },
  {
    id: 2,
    first_name: 'Alan',
    last_name: 'Turing',
    age: 41,
    nationality: 'British',
    hobbies: ['Chess', 'Running'],
  },
  {
    id: 3,
    first_name: 'Grace',
    last_name: 'Hopper',
    age: 45,
    nationality: 'American',
    hobbies: ['Chess', 'Reading', 'Sailing'],
  },
  {
    id: 4,
    first_name: 'Alonzo',
    last_name: 'Church',
    age: 92,
    nationality: 'American',
    hobbies: [],
  },
  {
    id: 5,
    first_name: 'Edsger',
    last_name: 'Dijkstra',
    age: 72,
    nationality: 'Dutch',
    hobbies: ['Chess'],
  },
  {
    id: 6,
    first_name: 'Barbara',
    last_name: 'Liskov',
    age: 83,
    nationality: 'American',
    hobbies: ['Reading'],
  },
  {
    id: 7,
    first_name: 'Donald',
    last_name: 'Knuth',
    age: 86,
    nationality: 'American',
    hobbies: ['Chess', 'Writing'],
  },
  {
    id: 8,
    first_name: 'ADA',
    last_name: 'Lovelace',
    age: 36,
    nationality: 'British',
    hobbies: ['Reading'],
  },
  {
    id: 9,
    first_name: 'Tim',
    last_name: 'Berners',
    age: 69,
    nationality: 'British',
    hobbies: ['Running'],
  },
  {
    id: 10,
    first_name: 'Linus',
    last_name: 'Torvalds',
    age: 54,
    nationality: 'Finnish',
    hobbies: ['Running', 'Writing'],
  },
  {
    id: 11,
    first_name: 'Per%y',
    last_name: 'Percival',
    age: 30,
    nationality: 'Danish',
    hobbies: ['Chess'],
  },
  {
    id: 12,
    first_name: 'Zed',
    last_name: 'Aardvark',
    age: 30,
    nationality: 'Danish',
    hobbies: [...FIXTURE_HOBBIES],
  },
];

/**
 * Counts derivable from the table above, restated so a test can assert against
 * a named expectation instead of a bare number.
 *
 *   Chess    1, 2, 3, 5, 7, 11, 12   = 7
 *   Reading  1, 3, 6, 8, 12          = 5
 *   Running  2, 9, 10, 12            = 4
 *   Writing  7, 10, 12               = 3
 *   Sailing  3, 12                   = 2
 *   Baking / Cooking / Hiking / Painting / Yoga: 12 only = 1 each
 */
export const EXPECTED_HOBBY_COUNTS: Record<string, number> = {
  Chess: 7,
  Reading: 5,
  Running: 4,
  Writing: 3,
  Sailing: 2,
  Baking: 1,
  Cooking: 1,
  Hiking: 1,
  Painting: 1,
  Yoga: 1,
};

/**
 *   American  3, 4, 6, 7   = 4
 *   British   1, 2, 8, 9   = 4
 *   Danish    11, 12       = 2
 *   Dutch     5            = 1
 *   Finnish   10           = 1
 */
export const EXPECTED_NATIONALITY_COUNTS: Record<string, number> = {
  American: 4,
  British: 4,
  Danish: 2,
  Dutch: 1,
  Finnish: 1,
};

/** An in-memory database holding the fixture. Disposed when the test ends. */
export function createFixtureDatabase(): Database {
  const db = createDatabase(':memory:');
  applySchema(db);

  const insertNationality = db.prepare('INSERT INTO nationalities (id, name) VALUES (?, ?)');
  FIXTURE_NATIONALITIES.forEach((name, index) => insertNationality.run(index + 1, name));

  const insertHobby = db.prepare('INSERT INTO hobbies (id, name) VALUES (?, ?)');
  FIXTURE_HOBBIES.forEach((name, index) => insertHobby.run(index + 1, name));

  const insertUser = db.prepare(
    `INSERT INTO users (id, avatar, first_name, last_name, age, nationality_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertUserHobby = db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (?, ?)');

  for (const user of FIXTURE_USERS) {
    insertUser.run(
      user.id,
      `https://example.test/avatar/${user.id}.svg`,
      user.first_name,
      user.last_name,
      user.age,
      FIXTURE_NATIONALITIES.indexOf(user.nationality as (typeof FIXTURE_NATIONALITIES)[number]) + 1,
    );
    for (const hobby of user.hobbies) {
      insertUserHobby.run(
        user.id,
        FIXTURE_HOBBIES.indexOf(hobby as (typeof FIXTURE_HOBBIES)[number]) + 1,
      );
    }
  }

  return db;
}

/** No filters — the "everything" case, spelled once. */
export const NO_FILTERS = { q: '', nationality: [], hobby: [] };
