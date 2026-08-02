import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme';

export interface UseThemeResult {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Flips to the opposite of what is currently displayed. */
  toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    setResolved(applyTheme(preference));
  }, [preference]);

  useEffect(() => {
    // Only while following the system: if the OS switches to dark at sunset,
    // the page should follow without a reload.
    if (preference !== 'system') return;
    // Guarded because `matchMedia` is absent outside a browser; the app then
    // simply keeps whatever theme was resolved at mount.
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => setResolved(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    storeTheme(next);
    setPreferenceState(next);
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolveTheme(readStoredTheme()) === 'dark' ? 'light' : 'dark');
  }, [setPreference]);

  return { preference, resolved, setPreference, toggle };
}
