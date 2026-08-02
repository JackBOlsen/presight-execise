import { z } from 'zod';
import {
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
  MAX_FILTER_VALUES,
  MAX_QUERY_LENGTH,
  QUERY_PARAMS,
  SORT_FIELDS,
  SORT_ORDERS,
  type SortField,
  type SortOrder,
} from './constants.js';

/**
 * The browser URL is the single source of truth for the client's view state.
 * This module is the only place that knows how that state is spelled, so the
 * address bar and the outgoing API request are built from the same values.
 *
 * Unlike the server's request validation, parsing here is deliberately
 * forgiving: a hand-edited or stale shared link with `?sort=email` should fall
 * back to the default sort and keep the rest of the view, not blow up or fire a
 * request that 400s. Each field degrades on its own.
 */
export interface DirectoryState {
  q: string;
  nationalities: string[];
  hobbies: string[];
  sort: SortField;
  order: SortOrder;
}

export const DEFAULT_DIRECTORY_STATE: DirectoryState = {
  q: '',
  nationalities: [],
  hobbies: [],
  sort: DEFAULT_SORT_FIELD,
  order: DEFAULT_SORT_ORDER,
};

/** zod earns its place here: an unknown enum value falls back instead of throwing. */
const SortFieldSchema = z.enum(SORT_FIELDS).catch(DEFAULT_SORT_FIELD);
const SortOrderSchema = z.enum(SORT_ORDERS).catch(DEFAULT_SORT_ORDER);

/**
 * Trim, drop blanks, de-duplicate, and cap the length.
 *
 * Sorted so that selecting Chess then Hiking produces the same URL — and the
 * same cache key and the same HTTP request — as selecting them the other way
 * round. Selection order carries no meaning for an AND/OR filter, so
 * canonicalising it avoids pointless refetches.
 */
function normalizeFilterValues(values: readonly string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return [...new Set(cleaned)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_FILTER_VALUES);
}

export function parseDirectoryState(input: URLSearchParams | string): DirectoryState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;

  return {
    q: (params.get(QUERY_PARAMS.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    nationalities: normalizeFilterValues(params.getAll(QUERY_PARAMS.nationality)),
    hobbies: normalizeFilterValues(params.getAll(QUERY_PARAMS.hobby)),
    sort: SortFieldSchema.parse(params.get(QUERY_PARAMS.sort) ?? undefined),
    order: SortOrderSchema.parse(params.get(QUERY_PARAMS.order) ?? undefined),
  };
}

/**
 * Serialise view state back to a query string.
 *
 * Values equal to the default are omitted, so an untouched directory has a bare
 * URL and a shared link contains only what the sender actually chose.
 *
 * `extra` carries the paging arguments that belong to an API request but not to
 * the browser URL — the address bar should describe a view, not a scroll offset.
 */
export function toSearchParams(
  state: DirectoryState,
  extra?: { cursor?: string | undefined; limit?: number | undefined },
): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q) params.set(QUERY_PARAMS.q, state.q);
  for (const value of normalizeFilterValues(state.nationalities)) {
    params.append(QUERY_PARAMS.nationality, value);
  }
  for (const value of normalizeFilterValues(state.hobbies)) {
    params.append(QUERY_PARAMS.hobby, value);
  }
  if (state.sort !== DEFAULT_SORT_FIELD) params.set(QUERY_PARAMS.sort, state.sort);
  if (state.order !== DEFAULT_SORT_ORDER) params.set(QUERY_PARAMS.order, state.order);

  if (extra?.cursor) params.set(QUERY_PARAMS.cursor, extra.cursor);
  if (extra?.limit !== undefined) params.set(QUERY_PARAMS.limit, String(extra.limit));

  return params;
}

/** True when anything is narrowing the result set — drives the "clear all" affordance. */
export function hasActiveFilters(state: DirectoryState): boolean {
  return state.q.length > 0 || state.nationalities.length > 0 || state.hobbies.length > 0;
}

/** Add a value if absent, remove it if present. Used by the facet checkboxes. */
export function toggleFilterValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((existing) => existing !== value)
    : normalizeFilterValues([...values, value]);
}
