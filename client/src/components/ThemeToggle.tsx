import { useTheme } from '../hooks/useTheme';

/**
 * Switches between light and dark.
 *
 * Owns its own state rather than taking props: the theme is global, `useTheme`
 * already reads and writes it, and threading it through the layout would make
 * every parent aware of a concern none of them have.
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle colour theme"
      className="border-border bg-canvas text-text-muted hover:border-border-strong hover:text-text rounded-control border p-2 transition-colors"
    >
      {resolved === 'dark' ? (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M10 2a8 8 0 1 0 8 8 6.5 6.5 0 0 1-8-8Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
          <circle cx="10" cy="10" r="3.5" fill="currentColor" />
          <path
            d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2m13.66-5.66-1.06 1.06M5.4 14.6l-1.06 1.06m11.32 0-1.06-1.06M5.4 5.4 4.34 4.34"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
