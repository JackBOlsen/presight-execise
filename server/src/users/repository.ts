import type { DirectoryFilters, SortField, SortOrder } from 'presight-shared';
import type { Database, SqlValue } from '../db/connection.js';
import type { Cursor } from './cursor.js';
import { SORT_EXPRESSIONS, buildFilterPredicate } from './predicates.js';

/**
 * All SQL lives here. Rows leave this module in their database shape; turning
 * them into the API's `User` is the service layer's job.
 *
 * Nothing above this layer knows that nationality is a foreign key, that
 * hobbies are a junction table, or how pagination is expressed — which is what
 * lets the storage model change without the HTTP contract moving.
 */

/** A user as stored, with the nationality name resolved by the join. */
export interface UserRow {
  id: number;
  avatar: string;
  first_name: string;
  last_name: string;
  age: number;
  nationality: string;
}

export interface ListUsersParams {
  filters: DirectoryFilters;
  sort: SortField;
  order: SortOrder;
  cursor?: Cursor | undefined;
  limit: number;
}

export interface ListUsersResult {
  rows: UserRow[];
  hasMore: boolean;
}

export function listUsers(db: Database, params: ListUsersParams): ListUsersResult {
  const { filters, sort, order, cursor, limit } = params;
  const sortExpression = SORT_EXPRESSIONS[sort];
  const direction = order === 'asc' ? 'ASC' : 'DESC';

  const filter = buildFilterPredicate(filters);
  const values: SqlValue[] = [...filter.params];

  let keyset = '';
  if (cursor) {
    // Row-value comparison. `(last_name, id) > (?, ?)` is precisely "ordered
    // after this row", including the tie-break, in a form SQLite can satisfy
    // with a seek on the (sort_column, id) index rather than a filter.
    const comparison = order === 'asc' ? '>' : '<';
    keyset = ` AND (${sortExpression}, u.id) ${comparison} (?, ?)`;
    values.push(cursor.value, cursor.id);
  }

  // One row beyond the page size tells us whether more exist, without a second
  // query and without the client having to compare against the total.
  values.push(limit + 1);

  const rows = db
    .prepare(
      `SELECT u.id, u.avatar, u.first_name, u.last_name, u.age, n.name AS nationality
         FROM users u
         JOIN nationalities n ON n.id = u.nationality_id
        WHERE ${filter.sql}${keyset}
        ORDER BY ${sortExpression} ${direction}, u.id ${direction}
        LIMIT ?`,
    )
    .all(...values) as unknown as UserRow[];

  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Total users matching the filters. Deliberately skips the nationality join. */
export function countUsers(db: Database, filters: DirectoryFilters): number {
  const filter = buildFilterPredicate(filters);
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM users u WHERE ${filter.sql}`)
    .get(...filter.params) as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * Hobbies for the users on the current page, in one query.
 *
 * Fetching them per user would be an N+1; aggregating them with
 * `group_concat` in the main query would make separators ambiguous for any
 * hobby containing one. A second keyed query is both cheaper and unambiguous.
 */
export function hobbiesForUsers(db: Database, userIds: readonly number[]): Map<number, string[]> {
  const byUser = new Map<number, string[]>();
  if (userIds.length === 0) return byUser;

  const rows = db
    .prepare(
      `SELECT uh.user_id AS userId, h.name AS name
         FROM user_hobbies uh
         JOIN hobbies h ON h.id = uh.hobby_id
        WHERE uh.user_id IN (${userIds.map(() => '?').join(', ')})
        ORDER BY uh.user_id, h.name`,
    )
    .all(...userIds) as unknown as { userId: number; name: string }[];

  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) existing.push(row.name);
    else byUser.set(row.userId, [row.name]);
  }
  return byUser;
}

export interface FacetRow {
  value: string;
  count: number;
}

/**
 * Facet aggregates over the filtered set.
 *
 * Ordered by count descending with the value as a tie-break, so two values with
 * equal counts keep a stable relative order between requests instead of
 * shuffling and making the sidebar appear to flicker.
 */
export function topNationalities(
  db: Database,
  filters: DirectoryFilters,
  limit: number,
): FacetRow[] {
  // Counted within the text and hobby filters, but not within the nationality
  // filter itself — otherwise selecting one nationality removes every other from
  // the group and a second can never be chosen. See FilterPredicateOptions.
  const filter = buildFilterPredicate(filters, { excludeNationality: true });

  // Two shapes, for the same reason `topHobbies` has two: which one wins depends
  // on whether the filter reads columns outside the index.
  //
  // With no filter, driving the join from `nationalities` is ideal — SQLite
  // walks the 48 lookup rows and satisfies each from the covering
  // (nationality_id, id) index without ever touching `users`. 3ms.
  //
  // Add a text filter and that same plan becomes the worst one available: the
  // LIKE has to read `first_name` and `last_name`, so each of the 50,000 index
  // entries turns into a random primary-key lookup into `users`. Measured at
  // 193ms, and — the giveaway — 193ms even for a query matching nobody, because
  // the cost is the lookups rather than the matches.
  //
  // Materialising the filtered rows first replaces those lookups with one
  // sequential scan, then groups what survives. 193ms → 34ms on the broadest
  // query, 195ms → 15ms when nothing matches. Identical results either way,
  // which a test pins.
  const sql = filter.isEmpty
    ? `SELECT n.name AS value, COUNT(*) AS count
         FROM users u
         JOIN nationalities n ON n.id = u.nationality_id
        WHERE ${filter.sql}
        GROUP BY n.id, n.name
        ORDER BY count DESC, value ASC
        LIMIT ?`
    : `WITH matched AS MATERIALIZED (
         SELECT u.nationality_id AS nationality_id FROM users u WHERE ${filter.sql}
       )
       SELECT n.name AS value, c.count AS count
         FROM (
           SELECT nationality_id AS nid, COUNT(*) AS count
             FROM matched
            GROUP BY nationality_id
         ) c
         JOIN nationalities n ON n.id = c.nid
        ORDER BY c.count DESC, n.name ASC
        LIMIT ?`;

  return db.prepare(sql).all(...filter.params, limit) as unknown as FacetRow[];
}

export function topHobbies(db: Database, filters: DirectoryFilters, limit: number): FacetRow[] {
  const filter = buildFilterPredicate(filters);

  // The join to `users` exists only to apply user-level filters. With none
  // active it is pure overhead, and expensive overhead: aggregating 250k
  // junction rows means 250k primary-key lookups into `users` to satisfy a
  // predicate that matches everything. Measured at 497ms with the join versus
  // 15ms without, for identical results — and the unfiltered case is the very
  // first request the client makes.
  const sql = filter.isEmpty
    ? `SELECT h.name AS value, COUNT(*) AS count
         FROM user_hobbies uh
         JOIN hobbies h ON h.id = uh.hobby_id
        GROUP BY uh.hobby_id
        ORDER BY count DESC, value ASC
        LIMIT ?`
    : // The filtered path aggregates the junction table against a *set* of
      // matching user ids rather than joining every junction row to `users` and
      // testing the predicate there. The join form re-evaluates the filter once
      // per hobby link — up to 250,000 times, against a text filter that now
      // scans two columns. Resolving the user set once and probing it instead
      // takes the broadest search from 544ms to 101ms, and the unfiltered-but-
      // still-joined case from 555ms to 119ms, for byte-identical results.
      `SELECT h.name AS value, c.count AS count
         FROM (
           SELECT uh.hobby_id AS hid, COUNT(*) AS count
             FROM user_hobbies uh
            WHERE uh.user_id IN (SELECT u.id FROM users u WHERE ${filter.sql})
            GROUP BY uh.hobby_id
         ) c
         JOIN hobbies h ON h.id = c.hid
        ORDER BY c.count DESC, h.name ASC
        LIMIT ?`;

  return db.prepare(sql).all(...filter.params, limit) as unknown as FacetRow[];
}

/** Row count, used by the health endpoint to prove the database is readable. */
export function countAllUsers(db: Database): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}
