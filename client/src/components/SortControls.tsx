import { SORT_FIELDS, type SortField, type SortOrder } from 'presight-shared';

/**
 * Sort field and direction.
 *
 * A select plus a direction toggle rather than a four-way segmented control:
 * eight combinations would need eight targets, and the pairing reads more
 * naturally as "by age, descending".
 */
const FIELD_LABELS: Record<SortField, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  age: 'Age',
  nationality: 'Nationality',
};

/** What ascending actually means for each field, since it is not obvious for a number. */
const DIRECTION_LABELS: Record<SortField, Record<SortOrder, string>> = {
  first_name: { asc: 'A to Z', desc: 'Z to A' },
  last_name: { asc: 'A to Z', desc: 'Z to A' },
  age: { asc: 'Youngest first', desc: 'Oldest first' },
  nationality: { asc: 'A to Z', desc: 'Z to A' },
};

interface SortControlsProps {
  sort: SortField;
  order: SortOrder;
  onSortChange: (sort: SortField) => void;
  onOrderToggle: () => void;
}

export function SortControls({ sort, order, onSortChange, onOrderToggle }: SortControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-field" className="text-text-muted hidden text-sm sm:block">
        Sort
      </label>

      <select
        id="sort-field"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortField)}
        aria-label="Sort by"
        className="border-border bg-canvas text-text hover:border-border-strong rounded-control cursor-pointer border px-3 py-2 text-sm transition-colors"
      >
        {SORT_FIELDS.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABELS[field]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onOrderToggle}
        title={DIRECTION_LABELS[sort][order]}
        aria-label={`Sort direction: ${DIRECTION_LABELS[sort][order]}`}
        className="border-border bg-canvas text-text-muted hover:border-border-strong hover:text-text rounded-control flex items-center gap-1.5 border px-2.5 py-2 text-sm transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          // Rotating the same arrow rather than swapping two icons makes the
          // change legible as a reversal.
          className={`h-4 w-4 transition-transform duration-200 ${order === 'desc' ? 'rotate-180' : ''}`}
        >
          <path
            d="M8 13V3m0 0L4 7m4-4 4 4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="hidden lg:inline">{DIRECTION_LABELS[sort][order]}</span>
      </button>
    </div>
  );
}
