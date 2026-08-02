import { useEffect, useState } from 'react';

/**
 * Delay propagating a rapidly changing value.
 *
 * Used for the text filter so a request is not issued per keystroke. The input
 * itself stays uncontrolled by this — the field must update instantly or typing
 * feels broken; it is only the resulting query that waits.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
