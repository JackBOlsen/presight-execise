import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
  MAX_FILTER_VALUES,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  MIN_PAGE_SIZE,
  SORT_FIELDS,
  SORT_ORDERS,
} from './constants.js';

/**
 * Request validation for the API.
 *
 * Strict on purpose: anything the server cannot make sense of is a 400 rather
 * than a silent fallback, because a request that quietly ignored `sort=email`
 * would return correct-looking but wrong data. The client's URL parser
 * (see `params.ts`) is deliberately lenient instead.
 *
 * Parsing here is also what makes the ORDER BY clause safe — the sort field can
 * only ever be one of `SORT_FIELDS`, so no user input reaches the SQL.
 */

/**
 * A repeated query parameter (`?hobby=Chess&hobby=Hiking`), normalised to a
 * clean array. Express hands us a bare string when the parameter appears once.
 *
 * Values are trimmed, blanks dropped, and duplicates removed. Deduplication is
 * load-bearing rather than cosmetic: the "match all selected hobbies" query
 * counts matching rows and compares against the number of requested hobbies,
 * so `?hobby=Chess&hobby=Chess` would otherwise never match anybody.
 */
const FilterValuesSchema = z
  .union([z.string(), z.array(z.string())])
  .default([])
  .transform((value) => {
    const list = Array.isArray(value) ? value : [value];
    const cleaned = list.map((item) => item.trim()).filter((item) => item.length > 0);
    return [...new Set(cleaned)];
  })
  .pipe(z.array(z.string()).max(MAX_FILTER_VALUES));

/**
 * The filters that define a result set. Shared by `/api/users` and
 * `/api/facets` so the facet counts always describe exactly the set being
 * paginated.
 */
export const DirectoryFiltersSchema = z.object({
  q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
  nationality: FilterValuesSchema,
  hobby: FilterValuesSchema,
});
export type DirectoryFilters = z.infer<typeof DirectoryFiltersSchema>;

/** `/api/facets` needs nothing beyond the filters — facets ignore sort and paging. */
export const FacetsQuerySchema = DirectoryFiltersSchema;
export type FacetsQuery = z.infer<typeof FacetsQuerySchema>;

/** `/api/users` adds ordering and keyset paging on top of the filters. */
export const UsersQuerySchema = DirectoryFiltersSchema.extend({
  sort: z.enum(SORT_FIELDS).default(DEFAULT_SORT_FIELD),
  order: z.enum(SORT_ORDERS).default(DEFAULT_SORT_ORDER),
  /** Opaque; produced by a previous response's `pageInfo.nextCursor`. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type UsersQuery = z.infer<typeof UsersQuerySchema>;
