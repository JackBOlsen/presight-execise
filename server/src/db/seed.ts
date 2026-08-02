import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { faker } from '@faker-js/faker';
import { MAX_HOBBIES_PER_USER, MIN_HOBBIES_PER_USER } from 'presight-shared';
import { config } from '../config.js';
import { createDatabase, type Database } from './connection.js';
import { applyIndexes, applyTables, dropSchema } from './schema.js';
import { HOBBIES, NATIONALITIES } from './vocabulary.js';

/**
 * Populates the SQLite database.
 *
 * Deterministic by design: faker is seeded with a fixed value, so every machine
 * and every container produces a byte-identical dataset. That is what lets the
 * tests assert real counts, and it means a bug reproduces from a description
 * rather than from a copy of somebody's database file.
 */

export interface SeedOptions {
  userCount?: number;
  randomSeed?: number;
  /** Drop and rebuild even if the database already holds users. */
  force?: boolean;
  log?: (message: string) => void;
}

export interface SeedResult {
  /** False when an existing dataset was left untouched. */
  seeded: boolean;
  users: number;
  hobbyLinks: number;
  durationMs: number;
}

const PROGRESS_INTERVAL = 10_000;

/**
 * Controls how long-tailed the popularity distribution is. An exponent of 1
 * would be uniform; higher values concentrate more mass at the front.
 *
 * Uniform picks would give all 48 nationalities near-identical counts, which
 * makes a "top 20" ranking meaningless — any 20 would do, and an off-by-one in
 * the ordering would be invisible. 1.5 produces a clearly ordered ranking while
 * keeping the most common value at a believable share of the dataset.
 */
const POPULARITY_SKEW = 1.5;

/** Pick an index with a bias towards the start of the list. */
function weightedIndex(size: number): number {
  const sample = faker.number.float({ min: 0, max: 1, fractionDigits: 6 });
  return Math.min(size - 1, Math.floor(Math.pow(sample, POPULARITY_SKEW) * size));
}

/**
 * Weighted pick from a list already arranged in popularity order.
 *
 * The indirection matters: `weightedIndex` favours low indices, so drawing
 * straight from the alphabetical vocabulary would make the most popular hobbies
 * exactly the alphabetically first ones. Shuffling the vocabulary into a
 * separate popularity order first decouples the two, so the resulting facet
 * ranking looks like data rather than an artefact of how the list was typed.
 */
function pickWeighted<T>(itemsByPopularity: readonly T[]): T {
  const item = itemsByPopularity[weightedIndex(itemsByPopularity.length)];
  if (item === undefined) throw new Error('cannot pick from an empty vocabulary');
  return item;
}

/**
 * How many hobbies this user gets.
 *
 * The first two users are pinned to the extremes so that both boundary cases —
 * a user with no hobbies at all, and one with the full ten — are present even
 * when seeding a handful of rows for a test. At 50,000 rows a uniform draw
 * would cover them anyway; at 20 rows it would not.
 */
function hobbyCountFor(id: number): number {
  if (id === 1) return MIN_HOBBIES_PER_USER;
  if (id === 2) return MAX_HOBBIES_PER_USER;
  return faker.number.int({ min: MIN_HOBBIES_PER_USER, max: MAX_HOBBIES_PER_USER });
}

/**
 * Deterministic, stable per user id. DiceBear renders these server-side, and
 * the client falls back to initials if the image cannot be fetched, so the UI
 * stays presentable offline.
 */
function avatarUrl(id: number): string {
  return `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${id}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export function seedDatabase(db: Database, options: SeedOptions = {}): SeedResult {
  const userCount = options.userCount ?? config.seed.userCount;
  const randomSeed = options.randomSeed ?? config.seed.randomSeed;
  const log = options.log ?? (() => {});
  const startedAt = Date.now();

  if (options.force) {
    log('Dropping existing schema (--force)');
    dropSchema(db);
  }

  applyTables(db);

  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existing.count > 0) {
    // Makes the seeder safe to run unconditionally, which is what the container
    // entrypoint does on every boot.
    log(`Database already contains ${existing.count.toLocaleString('en-US')} users; skipping.`);
    return { seeded: false, users: existing.count, hobbyLinks: 0, durationMs: 0 };
  }

  faker.seed(randomSeed);

  const insertNationality = db.prepare('INSERT INTO nationalities (id, name) VALUES (?, ?)');
  const insertHobby = db.prepare('INSERT INTO hobbies (id, name) VALUES (?, ?)');
  const insertUser = db.prepare(
    `INSERT INTO users (id, avatar, first_name, last_name, age, nationality_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertUserHobby = db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (?, ?)');

  // Rows are inserted with ids following the alphabetical vocabulary; these are
  // the same ids in a stable, seeded random order used only for weighting.
  const nationalityIdsByPopularity = faker.helpers.shuffle(NATIONALITIES.map((_, i) => i + 1));
  const hobbyIdsByPopularity = faker.helpers.shuffle(HOBBIES.map((_, i) => i + 1));

  let hobbyLinks = 0;

  // A single transaction. Committing per row would fsync 50,000 times and turn
  // a two second seed into several minutes.
  db.exec('BEGIN');
  try {
    NATIONALITIES.forEach((name, index) => insertNationality.run(index + 1, name));
    HOBBIES.forEach((name, index) => insertHobby.run(index + 1, name));

    for (let id = 1; id <= userCount; id++) {
      insertUser.run(
        id,
        avatarUrl(id),
        faker.person.firstName(),
        faker.person.lastName(),
        faker.number.int({ min: 18, max: 80 }),
        pickWeighted(nationalityIdsByPopularity),
      );

      // A Set because a user must not hold the same hobby twice — the composite
      // primary key would reject it, and a duplicate would inflate facet counts.
      const hobbyIds = new Set<number>();
      const target = hobbyCountFor(id);
      while (hobbyIds.size < target) {
        hobbyIds.add(pickWeighted(hobbyIdsByPopularity));
      }
      for (const hobbyId of hobbyIds) {
        insertUserHobby.run(id, hobbyId);
        hobbyLinks++;
      }

      if (id % PROGRESS_INTERVAL === 0) {
        log(`  ${id.toLocaleString('en-US')} / ${userCount.toLocaleString('en-US')} users`);
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Indexes are built after the bulk load rather than maintained during it.
  log('Creating indexes');
  applyIndexes(db);

  // Gives the query planner real distribution statistics. Without it the
  // planner works from guesses and can pick the wrong index for the facet
  // aggregates.
  log('Analysing');
  db.exec('ANALYZE');

  return { seeded: true, users: userCount, hobbyLinks, durationMs: Date.now() - startedAt };
}

/* ------------------------------------------------------------------ CLI ---- */

const USAGE = `
Seed the user directory database.

Usage:
  yarn seed [options]

Options:
  --count <n>   Number of users to create   (default: ${config.seed.userCount})
  --seed <n>    Random seed for reproducibility (default: ${config.seed.randomSeed})
  --db <path>   SQLite file to write        (default: ${config.dbPath})
  --force       Drop and rebuild an existing database
  --help        Show this message
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      count: { type: 'string' },
      seed: { type: 'string' },
      db: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const dbPath = values.db ?? config.dbPath;
  const db = createDatabase(dbPath);

  try {
    console.log(`Seeding ${dbPath}`);
    const result = seedDatabase(db, {
      ...(values.count !== undefined && { userCount: Number(values.count) }),
      ...(values.seed !== undefined && { randomSeed: Number(values.seed) }),
      force: values.force,
      log: (message) => console.log(message),
    });

    if (result.seeded) {
      const seconds = (result.durationMs / 1000).toFixed(2);
      console.log(
        `Done: ${result.users.toLocaleString('en-US')} users, ` +
          `${result.hobbyLinks.toLocaleString('en-US')} hobby links in ${seconds}s`,
      );
    }
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
