import { useEffect, useState } from 'react';
import { SORT_FIELDS, SORT_ORDERS } from 'presight-shared';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useDirectoryFacets, useDirectoryUsers } from './hooks/useDirectoryData';
import { useDirectoryParams } from './hooks/useDirectoryParams';
import { useTheme } from './hooks/useTheme';

/**
 * Foundation shell.
 *
 * Enough of the application to prove the whole path works end to end — URL
 * state, debounced input, both queries, theming — before the virtualised list,
 * the user card and the facet sidebar replace these placeholders.
 */
export default function App() {
  const { state, hasFilters, setQuery, setSort, toggleOrder, clearFilters } = useDirectoryParams();
  const { resolved, toggle } = useTheme();

  // The field updates instantly; only the resulting query waits.
  const [draft, setDraft] = useState(state.q);
  const debounced = useDebouncedValue(draft, 300);

  useEffect(() => {
    if (debounced !== state.q) setQuery(debounced);
  }, [debounced, state.q, setQuery]);

  // Keeps the field in step when the URL changes from elsewhere — the back
  // button, or a shared link opened in place.
  useEffect(() => {
    setDraft((current) => (current === state.q ? current : state.q));
  }, [state.q]);

  const users = useDirectoryUsers(state);
  const facets = useDirectoryFacets(state);

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="text-text mr-auto text-lg font-semibold tracking-tight">User Directory</h1>

          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search by name"
            aria-label="Search by first or last name"
            className="border-border bg-canvas text-text placeholder:text-text-subtle focus:border-accent rounded-control w-56 border px-3 py-2 text-sm transition-colors"
          />

          <select
            value={state.sort}
            onChange={(event) => setSort(event.target.value as (typeof SORT_FIELDS)[number])}
            aria-label="Sort by"
            className="border-border bg-canvas text-text rounded-control border px-3 py-2 text-sm"
          >
            {SORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field.replace('_', ' ')}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleOrder}
            aria-label={`Sort ${state.order === 'asc' ? 'ascending' : 'descending'}`}
            className="border-border bg-canvas text-text hover:bg-surface-hover rounded-control border px-3 py-2 text-sm"
          >
            {state.order === 'asc' ? '↑' : '↓'}{' '}
            {SORT_ORDERS.indexOf(state.order) === 0 ? 'Asc' : 'Desc'}
          </button>

          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle colour theme"
            className="border-border bg-canvas text-text hover:bg-surface-hover rounded-control border px-3 py-2 text-sm"
          >
            {resolved === 'dark' ? '☾' : '☀'}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="border-border bg-surface rounded-card border p-4">
          <h2 className="text-text mb-3 text-sm font-semibold">Filters</h2>
          {facets.isPending && <p className="text-text-subtle text-sm">Loading facets…</p>}
          {facets.isError && <p className="text-danger-text text-sm">Could not load filters.</p>}
          {facets.data && (
            <div className="space-y-4 text-sm">
              <FacetPreview title="Top hobbies" values={facets.data.hobbies} />
              <FacetPreview title="Top nationalities" values={facets.data.nationalities} />
            </div>
          )}
        </aside>

        <section>
          <div className="text-text-muted mb-3 flex items-center gap-3 text-sm" aria-live="polite">
            <span>
              {users.total.toLocaleString('en-US')} {users.total === 1 ? 'person' : 'people'}
            </span>
            {users.isRefreshing && <span className="text-text-subtle">updating…</span>}
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-accent-text underline">
                Clear filters
              </button>
            )}
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

          <ul className={users.isRefreshing ? 'space-y-2 opacity-60' : 'space-y-2'}>
            {users.users.map((user) => (
              <li
                key={user.id}
                className="border-border bg-surface rounded-card flex items-center gap-3 border p-3 text-sm"
              >
                <span className="text-text font-medium">
                  {user.first_name} {user.last_name}
                </span>
                <span className="text-text-muted">{user.nationality}</span>
                <span className="text-text-subtle ml-auto">{user.age}</span>
                <span className="text-text-subtle">{user.hobbies.length} hobbies</span>
              </li>
            ))}
          </ul>

          {users.hasNextPage && (
            <button
              type="button"
              onClick={() => users.fetchNextPage()}
              disabled={users.isFetchingNextPage}
              className="border-border bg-surface text-text hover:bg-surface-hover rounded-control mt-4 border px-4 py-2 text-sm"
            >
              {users.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

function FacetPreview({
  title,
  values,
}: {
  title: string;
  values: { value: string; count: number }[];
}) {
  return (
    <div>
      <h3 className="text-text-muted mb-1 text-xs font-semibold uppercase tracking-wide">
        {title}
      </h3>
      <ul className="space-y-1">
        {values.slice(0, 5).map((facet) => (
          <li key={facet.value} className="text-text flex justify-between">
            <span>{facet.value}</span>
            <span className="text-text-subtle">{facet.count.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
