import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { User } from 'presight-shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { USER_CARD_GAP, USER_ROW_HEIGHT, UserCard } from './UserCard';

/**
 * The virtualised, infinitely scrolling list.
 *
 * Virtualised against the *window* rather than an inner scroll container. With
 * a sidebar alongside, a nested scroller would mean two scrollbars on desktop
 * and, on touch devices, a region that swallows the page scroll once the cursor
 * is over it. Scrolling the page is what a directory should do.
 *
 * The next page is requested when the last *rendered* row approaches the end of
 * the loaded data. A sentinel element at the bottom of the list — the usual
 * IntersectionObserver approach — does not work under virtualisation, because
 * the bottom of the list is not mounted until the user is already there.
 */

/** How many rows from the end to begin loading, so the next page lands before it is needed. */
const PREFETCH_THRESHOLD = 8;

/** Extra rows rendered outside the viewport, hiding latency during a fast flick. */
const OVERSCAN = 6;

interface UserListProps {
  users: User[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function UserList({ users, hasNextPage, isFetchingNextPage, fetchNextPage }: UserListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * How far the list sits below the top of the document. The window
   * virtualizer measures against the page, so without this every row would be
   * positioned one header too high.
   */
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setScrollMargin(listRef.current?.offsetTop ?? 0);
    measure();
    // The header wraps at narrow widths, which moves the list down the page.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: users.length,
    estimateSize: () => USER_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    // Rows are a fixed height, so the estimate is exact. Keying by id rather
    // than index means React reuses the right row when results change.
    getItemKey: (index) => users[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastRenderedIndex = virtualItems.at(-1)?.index ?? -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (lastRenderedIndex >= users.length - PREFETCH_THRESHOLD) {
      fetchNextPage();
    }
  }, [lastRenderedIndex, users.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={listRef}>
      <div
        role="list"
        aria-label="People"
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualItems.map((item) => {
          const user = users[item.index];
          if (!user) return null;

          return (
            <div
              key={item.key}
              role="listitem"
              data-index={item.index}
              // The gap lives inside the measured element so its height matches
              // the estimate exactly, leaving nothing for the virtualizer to
              // correct and no scrollbar jitter as rows mount.
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                paddingBottom: USER_CARD_GAP,
                transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <UserCard user={user} />
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="flex justify-center py-6" role="status" aria-label="Loading more people">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="bg-text-subtle h-2 w-2 animate-bounce rounded-full"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}

      {!hasNextPage && users.length > 0 && (
        <p className="text-text-subtle py-6 text-center text-sm">
          {users.length.toLocaleString('en-US')} shown — that is everyone.
        </p>
      )}
    </div>
  );
}
