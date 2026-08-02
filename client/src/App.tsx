import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeQuery } from 'presight-shared';
import { ActiveFilters } from './components/ActiveFilters';
import { BackToTop } from './components/BackToTop';
import { FilterDrawer } from './components/FilterDrawer';
import { FilterSidebar } from './components/FilterSidebar';
import { SearchInput } from './components/SearchInput';
import { SortControls } from './components/SortControls';
import { UserList } from './components/UserList';
import { EmptyState } from './components/states/EmptyState';
import { ErrorState } from './components/states/ErrorState';
import { UserListSkeleton } from './components/states/UserListSkeleton';
import { useDebouncedCallback } from './hooks/useDebouncedCallback';
import { useDirectoryFacets, useDirectoryUsers } from './hooks/useDirectoryData';
import { useDirectoryParams } from './hooks/useDirectoryParams';
import { useTheme } from './hooks/useTheme';

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
  const { resolved, toggle } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  /**
   * The search box shows `draft` so typing feels instant, while the URL — the
   * real state — is written behind a debounce.
   *
   * `requestedQuery` records what this field last asked the URL to hold, which
   * is how an update we caused is told apart from one we did not. Without that
   * distinction a pending write can fire after something else has already
   * changed the URL and silently put the old search back.
   */
  const [draft, setDraft] = useState(state.q);
  const requestedQuery = useRef(state.q);

  const { run: scheduleQuery, cancel: cancelScheduledQuery } = useDebouncedCallback(setQuery, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setDraft(value);
      requestedQuery.current = value;
      scheduleQuery(value);
    },
    [scheduleQuery],
  );

  useEffect(() => {
    // Our own change arriving back, compared in the URL's canonical form. The
    // field may legitimately hold "joy " while the URL holds "joy"; treating
    // that as somebody else's edit would snatch the trailing space away
    // mid-word, exactly when the user is about to type a surname after it.
    if (state.q === normalizeQuery(requestedQuery.current)) return;

    // Anything else changed the search — the back button, removing a chip,
    // clearing all filters. The URL wins, so adopt it and drop any write we had
    // scheduled, whose stale value would otherwise undo what just happened.
    cancelScheduledQuery();
    requestedQuery.current = state.q;
    setDraft(state.q);
  }, [state.q, cancelScheduledQuery]);

  const users = useDirectoryUsers(state);
  const facets = useDirectoryFacets(state);

  // Compared in canonical form too, or a trailing space would leave the search
  // spinner running forever against a query that has in fact been applied.
  const isTyping = normalizeQuery(draft) !== state.q;
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
            value={draft}
            onChange={handleSearchChange}
            isSearching={isTyping || users.isRefreshing}
          />

          <div className="ml-auto flex items-center gap-2">
            <SortControls
              sort={state.sort}
              order={state.order}
              onSortChange={setSort}
              onOrderToggle={toggleOrder}
            />

            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle colour theme"
              className="border-border bg-canvas text-text-muted hover:border-border-strong hover:text-text rounded-control border p-2 transition-colors"
            >
              {resolved === 'dark' ? (
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                  <path d="M10 2a8 8 0 1 0 8 8 6.5 6.5 0 0 1-8-8Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                  <circle cx="10" cy="10" r="3.5" fill="currentColor" />
                  <path
                    d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2m13.66-5.66-1.06 1.06M5.4 14.6l-1.06 1.06m11.32 0-1.06-1.06M5.4 5.4 4.34 4.34"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[248px_1fr] lg:gap-8">
        {/* Sticky because the page itself scrolls: the filters must stay
            reachable while fifty thousand rows run past them. Hidden below the
            breakpoint, where the same content appears in the drawer. */}
        <aside className="border-border bg-surface rounded-card hidden border p-4 lg:sticky lg:top-[4.75rem] lg:block lg:self-start">
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
