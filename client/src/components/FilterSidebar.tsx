import type { FacetsResponse } from 'presight-shared';
import { FacetGroup } from './FacetGroup';

/**
 * The filter sidebar.
 *
 * Loads and fails independently of the list: a failed facet request should not
 * blank out results that arrived perfectly well, and vice versa.
 */
interface FilterSidebarProps {
  facets: FacetsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedHobbies: string[];
  selectedNationalities: string[];
  onToggleHobby: (hobby: string) => void;
  onToggleNationality: (nationality: string) => void;
}

export function FilterSidebar({
  facets,
  isLoading,
  isError,
  onRetry,
  selectedHobbies,
  selectedNationalities,
  onToggleHobby,
  onToggleNationality,
}: FilterSidebarProps) {
  if (isLoading) return <FilterSkeleton />;

  if (isError) {
    return (
      <div className="text-center">
        <p className="text-text-muted mb-2 text-sm">Filters could not be loaded.</p>
        <button
          type="button"
          onClick={onRetry}
          className="border-border text-text hover:bg-surface-hover rounded-control border px-3 py-1.5 text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!facets) return null;

  return (
    <div className="space-y-6">
      <FacetGroup
        title="Hobbies"
        values={facets.hobbies}
        selected={selectedHobbies}
        onToggle={onToggleHobby}
        emptyMessage="No hobbies in these results."
      />
      <FacetGroup
        title="Nationalities"
        values={facets.nationalities}
        selected={selectedNationalities}
        onToggle={onToggleNationality}
        emptyMessage="No nationalities in these results."
      />
    </div>
  );
}

/** Matches the real groups' geometry so nothing shifts when data arrives. */
function FilterSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="bg-surface-hover mb-3 h-4 w-24 animate-pulse rounded" />
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="flex items-center gap-2.5 px-2">
                <div className="bg-surface-hover h-3.5 w-3.5 shrink-0 animate-pulse rounded" />
                <div
                  className="bg-surface-hover h-3.5 flex-1 animate-pulse rounded"
                  style={{ maxWidth: `${70 - row * 6}%` }}
                />
                <div className="bg-surface-hover h-3 w-6 shrink-0 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
