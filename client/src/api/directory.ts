import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
  FacetsResponseSchema,
  UsersResponseSchema,
  toSearchParams,
  type DirectoryState,
  type FacetsResponse,
  type UsersResponse,
} from 'presight-shared';
import { apiRequest } from './client';

/**
 * Requests are built from the same `toSearchParams` the browser URL uses, so
 * the address bar and the outgoing call cannot describe different views.
 */

const API_BASE = '/api';

export function fetchUsers(
  state: DirectoryState,
  options: { cursor?: string | undefined; limit?: number; signal?: AbortSignal | undefined } = {},
): Promise<UsersResponse> {
  const params = toSearchParams(state, {
    cursor: options.cursor,
    limit: options.limit ?? DEFAULT_PAGE_SIZE,
  });
  return apiRequest(`${API_BASE}/users?${params}`, UsersResponseSchema, { signal: options.signal });
}

export function fetchFacets(
  state: DirectoryState,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<FacetsResponse> {
  // Sort and order are deliberately dropped: facets describe which users match,
  // not the order they are read in, so including them would invalidate the
  // cache — and recompute twenty-row aggregates — every time the sort changed.
  // Setting them to their defaults means `toSearchParams` omits them entirely.
  const params = toSearchParams({
    q: state.q,
    nationalities: state.nationalities,
    hobbies: state.hobbies,
    sort: DEFAULT_SORT_FIELD,
    order: DEFAULT_SORT_ORDER,
  });
  return apiRequest(`${API_BASE}/facets?${params}`, FacetsResponseSchema, {
    signal: options.signal,
  });
}
