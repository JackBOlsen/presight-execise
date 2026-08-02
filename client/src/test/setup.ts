import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * jsdom does not implement `matchMedia`, which the theme uses to follow the
 * operating system. A working stub — rather than a no-op — keeps that behaviour
 * testable instead of merely non-crashing.
 */
type Listener = (event: MediaQueryListEvent) => void;

const listeners = new Set<Listener>();
let prefersDark = false;

/** Lets a test simulate the OS switching theme. */
export function setPrefersDark(value: boolean): void {
  prefersDark = value;
  for (const listener of listeners) {
    listener({ matches: value } as MediaQueryListEvent);
  }
}

beforeEach(() => {
  prefersDark = false;
  listeners.clear();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();

  // jsdom does not implement scrollTo, which the virtualizer calls. Stubbed so
  // the warning does not drown out output that matters.
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => {},
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
});
