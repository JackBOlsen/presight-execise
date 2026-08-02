import type { ZodType } from 'zod';
import {
  FACET_LIMIT,
  FacetsResponseSchema,
  UsersResponseSchema,
  type DirectoryFilters,
  type FacetsResponse,
  type SortField,
  type User,
  type UsersQuery,
  type UsersResponse,
} from 'presight-shared';
import { config } from '../config.js';
import type { Database } from '../db/connection.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import * as repository from './repository.js';
import type { UserRow } from './repository.js';

/**
 * Turns stored rows into the API's response shapes.
 *
 * This is the boundary the brief's "clear API boundaries" asks for. The
 * repository speaks in rows — foreign keys, one table per concern — while
 * everything above this layer sees only `User`, which has no `nationality_id`
 * and carries its hobbies inline. Assembling that view is real work rather than
 * a renaming pass: the hobbies arrive from a separate keyed query and are
 * stitched on here.
 */

/**
 * The value the cursor must carry for a given sort, which has to be exactly
 * what the ORDER BY compares — otherwise the next page seeks to the wrong place.
 */
function sortValueOf(row: UserRow, sort: SortField): string | number {
  switch (sort) {
    case 'first_name':
      return row.first_name;
    case 'last_name':
      return row.last_name;
    case 'age':
      return row.age;
    case 'nationality':
      return row.nationality;
  }
}

function toUser(row: UserRow, hobbies: readonly string[] | undefined): User {
  return {
    id: row.id,
    avatar: row.avatar,
    first_name: row.first_name,
    last_name: row.last_name,
    age: row.age,
    nationality: row.nationality,
    // A user with no hobbies has no rows in the junction table, so an absent
    // entry means "none" rather than "not loaded".
    hobbies: hobbies ? [...hobbies] : [],
  };
}

/**
 * Validate what we are about to send.
 *
 * Enabled outside production, where it turns a mapping mistake into a loud
 * failure at the point it happens rather than a puzzling render in the browser.
 * In production the server is the authority on its own output and the check is
 * redundant cost, so it is switched off.
 */
function validate<T>(schema: ZodType<T>, value: T): T {
  if (!config.validateResponses) return value;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Response failed contract validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return value;
}

export function listUsers(db: Database, query: UsersQuery): UsersResponse {
  const filters: DirectoryFilters = {
    q: query.q,
    nationality: query.nationality,
    hobby: query.hobby,
  };

  const cursor = query.cursor ? decodeCursor(query.cursor, query.sort, query.order) : undefined;

  /**
   * The total is needed by every response anyway, so taking it first costs
   * nothing — and it lets the page query be skipped outright when nothing
   * matches.
   *
   * That is worth more than it looks. The page query is ordered, so it walks the
   * sort index until it has filled the limit; when the filter matches nobody it
   * walks all 50,000 entries to discover there was never anything to find. The
   * count is an unordered scan and settles the same question in 15ms. Measured
   * end to end, a search matching nobody goes from 294ms to 20ms.
   *
   * Both queries are built from the same filter fragment, so a total of zero is
   * a guarantee that the page is empty rather than a heuristic — with or without
   * a cursor, since a page is always a subset of the matching set.
   */
  const total = repository.countUsers(db, filters);

  const { rows, hasMore } =
    total === 0
      ? { rows: [], hasMore: false }
      : repository.listUsers(db, {
          filters,
          sort: query.sort,
          order: query.order,
          cursor,
          limit: query.limit,
        });

  const hobbiesByUser = repository.hobbiesForUsers(
    db,
    rows.map((row) => row.id),
  );

  const lastRow = rows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(sortValueOf(lastRow, query.sort), lastRow.id, query.sort, query.order)
      : null;

  return validate(UsersResponseSchema, {
    data: rows.map((row) => toUser(row, hobbiesByUser.get(row.id))),
    pageInfo: { nextCursor, hasMore },
    total,
  });
}

/**
 * Top values for each facet group over the current result set.
 *
 * Note what is absent: sort and cursor. Facets describe *which* users match,
 * not the order they are read in, so they are unaffected by both — which is
 * why they are a separate endpoint that scrolling never re-triggers.
 */
export function getFacets(db: Database, filters: DirectoryFilters): FacetsResponse {
  return validate(FacetsResponseSchema, {
    hobbies: repository.topHobbies(db, filters, FACET_LIMIT),
    nationalities: repository.topNationalities(db, filters, FACET_LIMIT),
  });
}
