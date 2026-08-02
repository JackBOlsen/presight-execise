/**
 * Values that both ends of the wire must agree on.
 *
 * These live here rather than being duplicated so that, for example, adding a
 * sort field is a single edit that the server's validation, the client's URL
 * parser and the TypeScript types all pick up at once.
 */

/** Sort fields exposed by the API. Doubles as the server's ORDER BY allow-list. */
export const SORT_FIELDS = ['first_name', 'last_name', 'age', 'nationality'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_SORT_FIELD: SortField = 'last_name';
export const DEFAULT_SORT_ORDER: SortOrder = 'asc';

/** Page size bounds. The maximum exists so a client cannot ask for the whole table. */
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 30;

/** How many values each facet group returns — "top 20 hobbies / nationalities". */
export const FACET_LIMIT = 20;

/** Domain rule from the brief: a user has between 0 and 10 hobbies. */
export const MIN_HOBBIES_PER_USER = 0;
export const MAX_HOBBIES_PER_USER = 10;

/** Upper bound on the free-text filter, mirrored by the client input's maxLength. */
export const MAX_QUERY_LENGTH = 100;

/**
 * Guard against absurdly long filter lists. Well above the 20 values a facet
 * group can ever offer, but low enough to keep the generated SQL sane.
 */
export const MAX_FILTER_VALUES = 50;

/**
 * Query string parameter names, shared by the browser URL and the API request
 * so the two are always literally the same string.
 *
 * Multi-value filters are repeated (`?hobby=Chess&hobby=Hiking`) rather than
 * comma-joined, so a value containing a comma cannot corrupt the filter.
 */
export const QUERY_PARAMS = {
  q: 'q',
  nationality: 'nationality',
  hobby: 'hobby',
  sort: 'sort',
  order: 'order',
  cursor: 'cursor',
  limit: 'limit',
} as const;
