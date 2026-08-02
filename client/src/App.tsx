import { useEffect, useState } from 'react';
import { ActiveFilters } from './components/ActiveFilters';
import { FilterSidebar } from './components/FilterSidebar';
import { SearchInput } from './components/SearchInput';
import { SortControls } from './components/SortControls';
import { UserList } from './components/UserList';
import { useDebouncedValue } from './hooks/useDebouncedValue';
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

  // The field updates instantly; only the resulting query waits.
  const [draft, setDraft] = useState(state.q);
  const debounced = useDebouncedValue(draft, 300);

  useEffect(() => {
    if (debounced !== state.q) setQuery(debounced);
  }, [debounced, state.q, setQuery]);

  // Keeps the field in step when the URL changes from elsewhere — the back
  // button, a shared link opened in place, or a chip being removed.
  useEffect(() => {
    setDraft((current) => (current === state.q ? current : state.q));
  }, [state.q]);

  const users = useDirectoryUsers(state);
  const facets = useDirectoryFacets(state);

  const isTyping = draft !== state.q;

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-surface/85 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="text-text text-base font-semibold tracking-tight whitespace-nowrap">
            User Directory
          </h1>

          <SearchInput
            value={draft}
            onChange={setDraft}
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

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[248px_1fr] lg:gap-8">
        {/* Sticky because the page itself scrolls: the filters must stay
            reachable while fifty thousand rows run past them. */}
        <aside className="border-border bg-surface rounded-card border p-4 lg:sticky lg:top-[4.75rem] lg:self-start">
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
        </aside>

        <section className="min-w-0">
          <ActiveFilters
            query={state.q}
            hobbies={state.hobbies}
            nationalities={state.nationalities}
            onClearQuery={() => setDraft('')}
            onRemoveHobby={toggleHobby}
            onRemoveNationality={toggleNationality}
            onClearAll={clearFilters}
          />

          <div className="text-text-muted mb-3 flex items-center gap-3 text-sm">
            <span>
              <span className="text-text font-medium">{users.total.toLocaleString('en-US')}</span>{' '}
              {users.total === 1 ? 'person' : 'people'}
            </span>
            {hasFilters && <span className="text-text-subtle">matching your filters</span>}
          </div>

          {users.isInitialLoading && <p className="text-text-subtle text-sm">Loading…</p>}

          {users.isError && (
            <p className="text-danger-text text-sm">
              {users.error instanceof Error ? users.error.message : 'Something went wrong.'}
            </p>
          )}

          {!users.isInitialLoading && !users.isError && users.users.length === 0 && (
            <p className="text-text-subtle text-sm">No people match these filters.</p>
          )}

          {/* Dimmed rather than emptied while a new filter loads, so the page
              does not collapse and reflow on every keystroke. */}
          <div
            className={users.isRefreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          >
            <UserList
              users={users.users}
              hasNextPage={users.hasNextPage}
              isFetchingNextPage={users.isFetchingNextPage}
              fetchNextPage={users.fetchNextPage}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
