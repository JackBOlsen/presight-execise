import type { DirectoryFilters, SortField } from 'presight-shared';
import type { SqlValue } from '../db/connection.js';

/**
 * Builds the WHERE fragment that defines a result set.
 *
 * This is the single place filter SQL is written. The paginated list, the total
 * count and both facet aggregates all call it, which is what guarantees the
 * "top 20" counts describe exactly the set being paginated rather than drifting
 * from it. A filter added here is automatically reflected everywhere.
 *
 * Every fragment references only the `users` table (aliased `u`) and correlated
 * subqueries — never the joined `nationalities` alias. That keeps the fragment
 * usable by the count query, which has no reason to pay for the join.
 */

export interface SqlFragment {
  /** Always a valid boolean expression; `1` when nothing is filtered. */
  sql: string;
  params: SqlValue[];
  /**
   * True when no filter is active, so callers can skip joining `users` purely
   * to apply a predicate that matches everything. Measurably worth branching
   * on: see the note in `topHobbies`.
   */
  isEmpty: boolean;
}

/** Maps an API sort field to the SQL expression it orders by. */
export const SORT_EXPRESSIONS: Readonly<Record<SortField, string>> = {
  first_name: 'u.first_name',
  last_name: 'u.last_name',
  age: 'u.age',
  // Sorting by nationality means sorting by its name, not its surrogate key.
  nationality: 'n.name',
};

/** Sort fields whose value is numeric, used to validate an incoming cursor. */
export const NUMERIC_SORT_FIELDS: ReadonlySet<SortField> = new Set<SortField>(['age']);

const LIKE_ESCAPE = '\\';

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * Turn user input into a prefix pattern with LIKE's wildcards neutralised.
 *
 * Without this, a query of `%` matches every user and `_` matches any single
 * character — the user's text would be silently interpreted as a pattern
 * language. Escaping keeps a search for "100%" a search for the literal
 * characters.
 *
 * The ESCAPE clause does not cost us the index: SQLite still reduces this to a
 * range scan over the NOCASE index, which EXPLAIN QUERY PLAN confirms.
 */
export function toPrefixPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `${LIKE_ESCAPE}${char}`);
  return `${escaped}%`;
}

export function buildFilterPredicate(filters: DirectoryFilters): SqlFragment {
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  if (filters.q.length > 0) {
    // Matches when either name part starts with the query. SQLite satisfies this
    // with a multi-index OR: one range seek per name index, then a union.
    clauses.push(
      `(u.first_name LIKE ? ESCAPE '${LIKE_ESCAPE}' OR u.last_name LIKE ? ESCAPE '${LIKE_ESCAPE}')`,
    );
    const pattern = toPrefixPattern(filters.q);
    params.push(pattern, pattern);
  }

  if (filters.nationality.length > 0) {
    // OR semantics: a user from any of the selected nationalities.
    clauses.push(
      `u.nationality_id IN (
         SELECT id FROM nationalities WHERE name IN (${placeholders(filters.nationality.length)})
       )`,
    );
    params.push(...filters.nationality);
  }

  if (filters.hobby.length > 0) {
    // AND semantics: a user holding *all* of the selected hobbies.
    //
    // Expressed as relational division — count how many of the requested
    // hobbies each user has and keep only those reaching the full total. This
    // relies on the caller having de-duplicated the requested names (the shared
    // query schema does), since a repeated name would raise the target above
    // what any user could reach.
    clauses.push(
      `u.id IN (
         SELECT uh.user_id
           FROM user_hobbies uh
           JOIN hobbies h ON h.id = uh.hobby_id
          WHERE h.name IN (${placeholders(filters.hobby.length)})
          GROUP BY uh.user_id
         HAVING COUNT(*) = ?
       )`,
    );
    params.push(...filters.hobby, filters.hobby.length);
  }

  return {
    sql: clauses.length > 0 ? clauses.join(' AND ') : '1',
    params,
    isEmpty: clauses.length === 0,
  };
}
