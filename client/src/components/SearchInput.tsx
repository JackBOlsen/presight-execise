import { MAX_QUERY_LENGTH } from 'presight-shared';

/**
 * The text filter.
 *
 * Controlled by the caller rather than owning its own value, because the value
 * has to survive the URL changing underneath it — pressing back, or opening a
 * shared link in place, must update the field.
 */
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Shows the trailing spinner while a request for this text is in flight. */
  isSearching?: boolean;
}

export function SearchInput({ value, onChange, isSearching = false }: SearchInputProps) {
  return (
    <div className="relative flex-1 sm:max-w-xs">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="text-text-subtle pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.75" />
        <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>

      <input
        type="search"
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by name"
        aria-label="Search by first or last name"
        // The native clear affordance is suppressed in favour of the button
        // below, which is themable and consistent across browsers.
        className="border-border bg-canvas text-text placeholder:text-text-subtle focus:border-accent rounded-control w-full border py-2 pr-9 pl-9 text-sm transition-colors [&::-webkit-search-cancel-button]:appearance-none"
      />

      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {isSearching && (
          <span
            aria-hidden="true"
            className="border-border border-t-accent mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2"
          />
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="text-text-subtle hover:text-text hover:bg-surface-hover rounded-full p-1 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
