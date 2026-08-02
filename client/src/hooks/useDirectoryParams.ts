import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_DIRECTORY_STATE,
  hasActiveFilters,
  parseDirectoryState,
  toSearchParams,
  toggleFilterValue,
  type DirectoryState,
  type SortField,
  type SortOrder,
} from 'presight-shared';

/**
 * The browser URL is the single source of truth for the view.
 *
 * There is no second copy of this state in React, which is what makes
 * "reloading or sharing the URL restores the same view" true by construction
 * rather than by a synchronisation effect that can fall out of step. Every
 * control reads from here and writes back through here.
 */
export interface UseDirectoryParamsResult {
  state: DirectoryState;
  hasFilters: boolean;
  setQuery: (q: string) => void;
  toggleHobby: (hobby: string) => void;
  toggleNationality: (nationality: string) => void;
  setSort: (sort: SortField) => void;
  setOrder: (order: SortOrder) => void;
  toggleOrder: () => void;
  clearFilters: () => void;
  clearAll: () => void;
}

export function useDirectoryParams(): UseDirectoryParamsResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => parseDirectoryState(searchParams), [searchParams]);

  const commit = useCallback(
    (next: DirectoryState, options: { replace?: boolean } = {}) => {
      setSearchParams(toSearchParams(next), { replace: options.replace ?? false });
    },
    [setSearchParams],
  );

  const setQuery = useCallback(
    (q: string) => {
      // Replaced rather than pushed: typing eight characters should not bury
      // the previous page under eight history entries.
      commit({ ...state, q }, { replace: true });
    },
    [commit, state],
  );

  const toggleHobby = useCallback(
    (hobby: string) => commit({ ...state, hobbies: toggleFilterValue(state.hobbies, hobby) }),
    [commit, state],
  );

  const toggleNationality = useCallback(
    (nationality: string) =>
      commit({ ...state, nationalities: toggleFilterValue(state.nationalities, nationality) }),
    [commit, state],
  );

  const setSort = useCallback((sort: SortField) => commit({ ...state, sort }), [commit, state]);

  const setOrder = useCallback((order: SortOrder) => commit({ ...state, order }), [commit, state]);

  const toggleOrder = useCallback(
    () => commit({ ...state, order: state.order === 'asc' ? 'desc' : 'asc' }),
    [commit, state],
  );

  const clearFilters = useCallback(
    // Keeps the chosen sort: clearing filters is about what is shown, not the
    // order it is shown in.
    () => commit({ ...state, q: '', hobbies: [], nationalities: [] }),
    [commit, state],
  );

  const clearAll = useCallback(() => commit(DEFAULT_DIRECTORY_STATE), [commit]);

  return {
    state,
    hasFilters: hasActiveFilters(state),
    setQuery,
    toggleHobby,
    toggleNationality,
    setSort,
    setOrder,
    toggleOrder,
    clearFilters,
    clearAll,
  };
}
