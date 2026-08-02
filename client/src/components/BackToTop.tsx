import { useEffect, useState } from 'react';

/**
 * Returns to the top of a long list.
 *
 * With fifty thousand rows behind an infinite scroll, getting back by scrolling
 * is not realistic — this is the only way out short of reloading.
 */
const SHOW_AFTER_PX = 1200;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    // Passive: this listener never calls preventDefault, and saying so lets the
    // browser keep scrolling off the main thread.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="border-border bg-surface text-text-muted shadow-raised hover:text-text hover:border-border-strong fixed right-5 bottom-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
        <path
          d="M8 13V4m0 0L4 8m4-4 4 4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
