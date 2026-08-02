import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeQuery } from 'presight-shared';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Reconciles a search field that must feel instant with a URL that is the real
 * state.
 *
 * The field shows `draft` so every keystroke lands immediately, while the URL is
 * written behind a debounce. That leaves two writers for one value, and the
 * whole difficulty is telling them apart.
 *
 * `requested` records what this field last asked the URL to hold. When a URL
 * change matches it, the change is our own arriving back and the field already
 * shows it. When it does not, something else moved the search — the back button,
 * removing a chip, clearing all filters — and the URL wins.
 *
 * Without that distinction a pending debounce fires after the filters have
 * already been cleared and silently restores the old search, which looks like
 * the clear button not working.
 *
 * @param urlQuery The query as it currently appears in the URL.
 * @param commit   Writes a new query to the URL. Called debounced.
 */
export interface SearchDraft {
  /** What the input should display. */
  draft: string;
  /** Feed the input's onChange here. */
  onChange: (value: string) => void;
  /** True while the field holds something the URL has not caught up with. */
  isTyping: boolean;
}

const DEBOUNCE_MS = 300;

export function useSearchDraft(urlQuery: string, commit: (query: string) => void): SearchDraft {
  const [draft, setDraft] = useState(urlQuery);
  const requested = useRef(urlQuery);

  const { run: schedule, cancel } = useDebouncedCallback(commit, DEBOUNCE_MS);

  const onChange = useCallback(
    (value: string) => {
      setDraft(value);
      requested.current = value;
      schedule(value);
    },
    [schedule],
  );

  useEffect(() => {
    // Compared in the URL's canonical form. The field may legitimately hold
    // "joy " while the URL holds "joy"; treating that as somebody else's edit
    // would snatch the trailing space away mid-word, exactly when the user is
    // about to type a surname after it.
    if (urlQuery === normalizeQuery(requested.current)) return;

    // Somebody else changed it. Adopt the URL and drop any write we had
    // scheduled, whose stale value would otherwise undo what just happened.
    cancel();
    requested.current = urlQuery;
    setDraft(urlQuery);
  }, [urlQuery, cancel]);

  return {
    draft,
    onChange,
    // Canonical form here too, or a trailing space would leave the spinner
    // running forever against a query that has in fact been applied.
    isTyping: normalizeQuery(draft) !== urlQuery,
  };
}
