import { useCallback, useEffect, useRef } from 'react';

/**
 * Defer a call until the caller has been quiet for `delayMs`.
 *
 * Deliberately a debounced *callback* rather than a debounced *value*. A
 * debounced value is a second copy of the state that lags the real one, and
 * anything reading it can act on a value that is already stale — which is
 * exactly how the search box came to overwrite the URL a moment after something
 * else had cleared it.
 *
 * `cancel` is what makes that safe: when the value changes from somewhere other
 * than the caller, the scheduled write can be dropped before it fires.
 */
export interface DebouncedCallback<A extends unknown[]> {
  run: (...args: A) => void;
  cancel: () => void;
}

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): DebouncedCallback<A> {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Held in a ref so a changing callback identity does not restart the timer,
  // and so the call that eventually fires uses the latest one.
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });

  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  const run = useCallback(
    (...args: A) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        latest.current(...args);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  // A pending call must not fire into an unmounted component.
  useEffect(() => cancel, [cancel]);

  return { run, cancel };
}
