import type { FacetValue } from 'presight-shared';
import { useState } from 'react';

/**
 * One group of filter values with their counts.
 *
 * The counts describe the *current* result set rather than the whole dataset,
 * so this list changes as filters are applied — which is the point: it tells
 * you what narrowing further would actually get you.
 */

/** Shown before the group is expanded. Twenty of each would make a very long sidebar. */
const COLLAPSED_COUNT = 8;

interface FacetGroupProps {
  title: string;
  values: FacetValue[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Rendered when the group is empty, which reads better than a blank space. */
  emptyMessage: string;
}

export function FacetGroup({ title, values, selected, onToggle, emptyMessage }: FacetGroupProps) {
  const [expanded, setExpanded] = useState(false);

  /**
   * A selected value must stay visible so it can be switched off again.
   *
   * In practice the API always returns it — everything in the result set holds
   * a selected hobby, so it ranks first — but that is a property of the current
   * filter semantics rather than a guarantee, and a filter you cannot remove
   * would strand the user.
   */
  const missingSelected = selected
    .filter((value) => !values.some((facet) => facet.value === value))
    .map((value) => ({ value, count: 0 }));

  const all = [...missingSelected, ...values];
  const visible = expanded ? all : all.slice(0, COLLAPSED_COUNT);
  const hidden = all.length - visible.length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-text text-sm font-semibold">{title}</h3>
        {selected.length > 0 && (
          <span className="text-accent-text text-xs font-medium">{selected.length} selected</span>
        )}
      </div>

      {all.length === 0 ? (
        <p className="text-text-subtle text-sm">{emptyMessage}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {visible.map((facet) => {
            const isSelected = selected.includes(facet.value);
            return (
              <li key={facet.value}>
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    isSelected ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(facet.value)}
                    className="accent-accent h-3.5 w-3.5 shrink-0 cursor-pointer"
                  />
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      isSelected ? 'text-accent-text font-medium' : 'text-text'
                    }`}
                    title={facet.value}
                  >
                    {facet.value}
                  </span>
                  <span className="text-text-subtle shrink-0 text-xs">
                    {facet.count.toLocaleString('en-US')}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-accent-text hover:text-accent mt-1.5 px-2 text-xs font-medium transition-colors"
        >
          Show {hidden} more
        </button>
      )}

      {expanded && all.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-text-subtle hover:text-text mt-1.5 px-2 text-xs font-medium transition-colors"
        >
          Show fewer
        </button>
      )}
    </section>
  );
}
