import { useEffect, type ReactNode } from 'react';

/**
 * The sidebar as a slide-over, for screens too narrow to show it alongside.
 *
 * It stays open while filters are picked rather than closing on each selection,
 * because narrowing a directory is usually several choices in a row and the
 * counts update underneath. A footer button confirms and returns to the list.
 */
interface FilterDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Shown on the trigger, so the button says how much is applied. */
  activeCount: number;
  /** Result count, so closing the drawer shows what was achieved. */
  resultCount: number;
  children: ReactNode;
}

export function FilterDrawer({
  open,
  onOpen,
  onClose,
  activeCount,
  resultCount,
  children,
}: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return;

    // Without this the page behind the overlay scrolls under the finger, which
    // is disorienting and loses the reader's place in a 50,000-row list.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="border-border bg-surface text-text hover:border-border-strong rounded-control flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors lg:hidden"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
          <path
            d="M2 4h12M4.5 8h7M6.5 12h3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="bg-accent text-accent-contrast rounded-full px-1.5 py-0.5 text-xs leading-none font-semibold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <div className="bg-surface shadow-overlay absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col">
            <header className="border-border flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-text text-sm font-semibold">Filters</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close filters"
                className="text-text-subtle hover:text-text hover:bg-surface-hover rounded-full p-1.5 transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
                  <path
                    d="m4 4 8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4">{children}</div>

            <footer className="border-border border-t p-4">
              <button
                type="button"
                onClick={onClose}
                className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-control w-full py-2.5 text-sm font-medium transition-colors"
              >
                Show {resultCount.toLocaleString('en-US')} {resultCount === 1 ? 'person' : 'people'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
