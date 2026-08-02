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
 * Turn user input into a substring pattern with LIKE's wildcards neutralised.
 *
 * Without the escaping, a query of `%` matches every user and `_` matches any
 * single character — the user's text would be silently interpreted as a pattern
 * language. Escaping keeps a search for "100%" a search for the literal
 * characters.
 *
 * Matching anywhere in the name rather than only at the start is a deliberate
 * reversal of the original design, and it costs the index. A leading `%` cannot
 * be reduced to a range scan, so every text search is now a scan of the two name
 * columns. That was measured before being accepted: the scan itself is ~15ms
 * over 50,000 rows, far below the 300ms the client debounces by, and the
 * alternative was a search where typing "son" finds Sonia but not Johnson,
 * Wilson or Anderson — 57 of the 2,367 people whose name actually contains it.
 *
 * The cost did not fall where it was expected, which is the reason the facet
 * aggregates in `repository.ts` are shaped the way they are. See the note there.
 */
export function toSearchPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `${LIKE_ESCAPE}${char}`);
  return `%${escaped}%`;
}

export interface FilterPredicateOptions {
  /**
   * Leave the nationality filter out of the clause.
   *
   * Used only by the nationality facet, and the reason is a conflict between
   * two requirements. Nationalities combine with OR, so applying that filter to
   * its own counts leaves exactly the selected nationalities in the result set —
   * every other value drops to zero and disappears from the group, making a
   * second nationality impossible to pick. The filter would be reachable only by
   * editing the URL.
   *
   * Hobbies do not have this problem and are deliberately left alone: they
   * combine with AND, so narrowing to Table Tennis players and then counting
   * their other hobbies is exactly the useful question.
   *
   * This is the standard treatment of multi-select OR facets — Solr and
   * Elasticsearch both provide it directly, as tag exclusion and post-filtering.
   */
  excludeNationality?: boolean;
}

export function buildFilterPredicate(
  filters: DirectoryFilters,
  options: FilterPredicateOptions = {},
): SqlFragment {
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  /**
   * Text filter.
   *
   * One word matches either name part anywhere within it, so both a surname
   * typed alone and a fragment from the middle of one will find someone. Two or
   * more words are read positionally — the first word is the given name and the
   * rest the family name — which is how someone typing a full name expects it to
   * be understood.
   *
   * Both halves may be partial: "Pet Jac" finds Peter Jacob. That is the reason
   * the columns are matched separately rather than against a concatenated
   * "first last" string, which looks equivalent but requires the first word to
   * be a *complete* given name for the space to line up.
   *
   * Two consequences accepted. Word order matters: "Jacob Peter" and "Peter
   * Jacob" are different searches, and ignoring order would mean a search for
   * one always returned the other, since they are mirror images. And a
   * multi-part surname typed in full — "Van Dyke" — is read as a given name plus
   * a family name and finds nobody; the surname's parts still match
   * individually.
   */
  const tokens = filters.q.split(/\s+/).filter((token) => token.length > 0);
  const [givenName, ...familyNameParts] = tokens;

  if (givenName !== undefined) {
    if (familyNameParts.length === 0) {
      clauses.push(
        `(u.first_name LIKE ? ESCAPE '${LIKE_ESCAPE}' OR u.last_name LIKE ? ESCAPE '${LIKE_ESCAPE}')`,
      );
      const pattern = toSearchPattern(givenName);
      params.push(pattern, pattern);
    } else {
      // Everything after the first word is treated as the family name, so a
      // double-barrelled surname survives being typed out in full.
      clauses.push(
        `(u.first_name LIKE ? ESCAPE '${LIKE_ESCAPE}' AND u.last_name LIKE ? ESCAPE '${LIKE_ESCAPE}')`,
      );
      params.push(toSearchPattern(givenName), toSearchPattern(familyNameParts.join(' ')));
    }
  }

  if (filters.nationality.length > 0 && !options.excludeNationality) {
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
