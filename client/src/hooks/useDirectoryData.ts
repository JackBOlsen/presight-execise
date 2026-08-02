import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toSearchParams, type DirectoryState, type User } from 'presight-shared';
import { useMemo } from 'react';
import { fetchFacets, fetchUsers } from '../api/directory';

/**
 * Data access for the directory.
 *
 * The two queries are separate because their inputs are: the list depends on
 * the filters *and* the sort *and* the scroll position, while the facets depend
 * only on the filters. Keeping them apart means scrolling never recomputes the
 * sidebar aggregates, and changing the sort does not either.
 */

/**
 * The canonical query string doubles as the cache key. Two states that describe
 * the same view produce the same string, so re-selecting filters in a different
 * order cannot cause a refetch.
 */
export const directoryKeys = {
  users: (state: DirectoryState) => ['users', toSearchParams(state).toString()] as const,
  facets: (state: DirectoryState) =>
    [
      'facets',
      toSearchParams({
        q: state.q,
        nationalities: state.nationalities,
        hobbies: state.hobbies,
        sort: 'last_name',
        order: 'asc',
      }).toString(),
    ] as const,
};

export function useDirectoryUsers(state: DirectoryState) {
  const query = useInfiniteQuery({
    queryKey: directoryKeys.users(state),
    queryFn: ({ pageParam, signal }) => fetchUsers(state, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    // `undefined` rather than `null` is what tells React Query there is no next
    // page; the API returns null, so it has to be mapped.
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    // Keeps the previous results on screen while a new filter loads, so the
    // list dims instead of collapsing to empty on every keystroke.
    placeholderData: keepPreviousData,
  });

  // Virtualisation needs one flat array, not an array of pages.
  const users = useMemo<User[]>(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  return {
    ...query,
    users,
    total: query.data?.pages[0]?.total ?? 0,
    /** True only on a first load, when there is nothing to show yet. */
    isInitialLoading: query.isPending,
    /** True while replacing results that are still on screen. */
    isRefreshing: query.isPlaceholderData || (query.isFetching && !query.isFetchingNextPage),
  };
}

export function useDirectoryFacets(state: DirectoryState) {
  return useQuery({
    queryKey: directoryKeys.facets(state),
    queryFn: ({ signal }) => fetchFacets(state, { signal }),
    placeholderData: keepPreviousData,
  });
}
