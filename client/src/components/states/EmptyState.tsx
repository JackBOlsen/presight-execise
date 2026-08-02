/**
 * Shown when the filters match nobody.
 *
 * Deliberately names what is currently applied. "No results" leaves the user to
 * work out which of four filters is the culprit; listing them turns the dead end
 * into an obvious next action, and the button makes that action one click.
 */
interface EmptyStateProps {
  query: string;
  hobbies: string[];
  nationalities: string[];
  onClearFilters: () => void;
}

export function EmptyState({ query, hobbies, nationalities, onClearFilters }: EmptyStateProps) {
  const parts = [
    query && `matching “${query}”`,
    hobbies.length > 0 && `with ${formatList(hobbies)}`,
    nationalities.length > 0 && `from ${formatList(nationalities, 'or')}`,
  ].filter(Boolean) as string[];

  return (
    <div className="border-border bg-surface rounded-card flex flex-col items-center border border-dashed px-6 py-16 text-center">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="text-text-subtle mb-4 h-12 w-12"
      >
        <circle cx="21" cy="21" r="13" stroke="currentColor" strokeWidth="2.5" opacity="0.45" />
        <path d="m31 31 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M16 21h10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>

      <h2 className="text-text mb-1 text-base font-semibold">No people found</h2>

      <p className="text-text-muted mb-5 max-w-sm text-sm">
        {parts.length > 0
          ? `Nobody ${parts.join(', ')}. Try removing a filter.`
          : 'The directory appears to be empty.'}
      </p>

      {parts.length > 0 && (
        <button
          type="button"
          onClick={onClearFilters}
          className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-control px-4 py-2 text-sm font-medium transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

/** "Chess", "Chess and Yoga", "Chess, Yoga and Baking". */
function formatList(values: string[], conjunction = 'and'): string {
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(', ')} ${conjunction} ${values.at(-1)}`;
}
