import { flagFor } from '../lib/nationality';

/**
 * A summary of everything currently narrowing the results, each removable.
 *
 * This is the safety net for the sidebar's behaviour. Facet counts describe the
 * current result set, so selecting a nationality leaves only that nationality
 * in its group — a user who scrolled past the sidebar, or who is on a narrow
 * screen with it collapsed, needs somewhere else to see and undo what is
 * applied.
 */
interface ActiveFiltersProps {
  query: string;
  hobbies: string[];
  nationalities: string[];
  onClearQuery: () => void;
  onRemoveHobby: (hobby: string) => void;
  onRemoveNationality: (nationality: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({
  query,
  hobbies,
  nationalities,
  onClearQuery,
  onRemoveHobby,
  onRemoveNationality,
  onClearAll,
}: ActiveFiltersProps) {
  const count = (query ? 1 : 0) + hobbies.length + nationalities.length;
  if (count === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {query && <Chip label={`“${query}”`} onRemove={onClearQuery} />}

      {nationalities.map((value) => (
        <Chip
          key={`nationality-${value}`}
          label={value}
          prefix={flagFor(value)}
          onRemove={() => onRemoveNationality(value)}
        />
      ))}

      {hobbies.map((value) => (
        <Chip key={`hobby-${value}`} label={value} onRemove={() => onRemoveHobby(value)} />
      ))}

      {count > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-text-muted hover:text-text ml-1 text-xs font-medium underline underline-offset-2 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function Chip({
  label,
  prefix,
  onRemove,
}: {
  label: string;
  prefix?: string | undefined;
  onRemove: () => void;
}) {
  return (
    <span className="border-accent-border bg-accent-soft text-accent-text inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-xs font-medium">
      {prefix && <span aria-hidden="true">{prefix}</span>}
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="hover:bg-accent-border/60 rounded-full p-0.5 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3 w-3">
          <path
            d="m4.5 4.5 7 7M11.5 4.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}
