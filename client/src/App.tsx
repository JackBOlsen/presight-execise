import { useCallback, useState } from 'react';
import { toSearchParams } from 'presight-shared';
import { ActiveFilters } from './components/ActiveFilters';
import { BackToTop } from './components/BackToTop';
import { FilterDrawer } from './components/FilterDrawer';
import { FilterSidebar } from './components/FilterSidebar';
import { SearchInput } from './components/SearchInput';
import { SortControls } from './components/SortControls';
import { ThemeToggle } from './components/ThemeToggle';
import { UserList } from './components/UserList';
import { EmptyState } from './components/states/EmptyState';
import { ErrorState } from './components/states/ErrorState';
import { UserListSkeleton } from './components/states/UserListSkeleton';
import { useDirectoryFacets, useDirectoryUsers } from './hooks/useDirectoryData';
import { useDirectoryParams } from './hooks/useDirectoryParams';
import { useScrollToTopOnChange } from './hooks/useScrollToTopOnChange';
import { useSearchDraft } from './hooks/useSearchDraft';

/**
 * Composes the directory: header, filters, list.
 *
 * Deliberately holds no logic of its own beyond which region to render. The URL
 * state, the two queries, the search field's debounce and the theme each live in
 * their own hook or component, so this file reads as a layout rather than as a
 * place behaviour accumulates.
 */
export default function App() {
  const {
    state,
    hasFilters,
    setQuery,
    setSort,
    toggleOrder,
    toggleHobby,
    toggleNationality,
    clearFilters,
  } = useDirectoryParams();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const search = useSearchDraft(state.q, setQuery);

  const users = useDirectoryUsers(state);
  const facets = useDirectoryFacets(state);

  // The canonical query string changes exactly when the result set or its order
  // does — and not when scrolling loads another page, since paging lives in the
  // cursor rather than in the view state.
  useScrollToTopOnChange(toSearchParams(state).toString());

  const activeFilterCount = state.hobbies.length + state.nationalities.length + (state.q ? 1 : 0);

  const sidebar = (
    <FilterSidebar
      facets={facets.data}
      isLoading={facets.isPending}
      isError={facets.isError}
      onRetry={() => void facets.refetch()}
      selectedHobbies={state.hobbies}
      selectedNationalities={state.nationalities}
      onToggleHobby={toggleHobby}
      onToggleNationality={toggleNationality}
    />
  );

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-surface/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <h1 className="text-text hidden text-base font-semibold tracking-tight whitespace-nowrap sm:block">
            User Directory
          </h1>

          <SearchInput
            value={search.draft}
            onChange={search.onChange}
            isSearching={search.isTyping || users.isRefreshing}
          />

          <div className="ml-auto flex items-center gap-2">
            <SortControls
              sort={state.sort}
              order={state.order}
              onSortChange={setSort}
              onOrderToggle={toggleOrder}
            />

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[248px_1fr] lg:gap-8">
        {/* Sticky because the page itself scrolls: the filters must stay
            reachable while fifty thousand rows run past them. Hidden below the
            breakpoint, where the same content appears in the drawer. */}
        {/* Sticky, so the filters stay reachable while fifty thousand rows run
            past them — but a sticky element is pinned to the viewport, so with
            both groups expanded to twenty values the bottom of the list would
            sit below the fold with no way to reach it. Bounding the height and
            scrolling inside is what makes the full top-20 usable. */}
        <aside className="border-border bg-surface rounded-card scrollbar-slim hidden border p-4 lg:sticky lg:top-[4.75rem] lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:self-start lg:overflow-y-auto">
          {sidebar}
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <FilterDrawer
              open={drawerOpen}
              onOpen={() => setDrawerOpen(true)}
              onClose={closeDrawer}
              activeCount={activeFilterCount}
              resultCount={users.total}
            >
              {sidebar}
            </FilterDrawer>

            <p className="text-text-muted text-sm">
              <span className="text-text font-medium">{users.total.toLocaleString('en-US')}</span>{' '}
              {users.total === 1 ? 'person' : 'people'}
              {hasFilters && <span className="text-text-subtle"> matching your filters</span>}
            </p>
          </div>

          <ActiveFilters
            query={state.q}
            hobbies={state.hobbies}
            nationalities={state.nationalities}
            onClearQuery={() => setQuery('')}
            onRemoveHobby={toggleHobby}
            onRemoveNationality={toggleNationality}
            onClearAll={clearFilters}
          />

          {users.isInitialLoading ? (
            <UserListSkeleton />
          ) : users.isError ? (
            <ErrorState error={users.error} onRetry={() => void users.refetch()} />
          ) : users.users.length === 0 ? (
            <EmptyState
              query={state.q}
              hobbies={state.hobbies}
              nationalities={state.nationalities}
              onClearFilters={clearFilters}
            />
          ) : (
            // Dimmed rather than emptied while a new filter loads, so the page
            // does not collapse and reflow on every keystroke.
            <div
              className={
                users.isRefreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'
              }
            >
              <UserList
                users={users.users}
                hasNextPage={users.hasNextPage}
                isFetchingNextPage={users.isFetchingNextPage}
                fetchNextPage={users.fetchNextPage}
              />
            </div>
          )}
        </section>
      </main>

      <BackToTop />
    </div>
  );
}
