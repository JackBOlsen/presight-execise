import { useEffect, useRef } from 'react';

/**
 * Return to the top of the page when the view state changes.
 *
 * Without this, changing the sort while scrolled deep into the list leaves the
 * reader stranded. The list is virtualised against the window, so its height is
 * a function of how many rows are loaded: 400 rows is roughly 46,000px of
 * document. Switching the sort starts a new query at page one, the document
 * collapses to ~3,500px, and the browser clamps the scroll position to the new
 * maximum — so the user lands at the *end* of a freshly ordered list, having
 * asked only to reorder it.
 *
 * Filter changes have the same shape whenever the result set shrinks.
 *
 * Deliberately not smooth: at 46,000px an animated scroll is a long, useless
 * journey past content the user did not ask to see.
 *
 * @param key A value that changes exactly when the result set or its order does.
 */
export function useScrollToTopOnChange(key: string): void {
  // Seeded with the initial key so that opening a shared link does not scroll —
  // there has been no change yet, and the browser may legitimately be restoring
  // a position on reload.
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    window.scrollTo({ top: 0 });
  }, [key]);
}
