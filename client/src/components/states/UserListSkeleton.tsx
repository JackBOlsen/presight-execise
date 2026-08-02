import { USER_CARD_GAP, USER_CARD_HEIGHT } from '../UserCard';

/**
 * Placeholder cards for the first load.
 *
 * Built from the same height and column constants as the real card, so when
 * data arrives nothing moves. A skeleton whose geometry only roughly matches
 * causes a visible jump at exactly the moment the user starts reading, which is
 * worse than showing nothing at all.
 */
export function UserListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ paddingBottom: USER_CARD_GAP }}>
          <div
            style={{
              height: USER_CARD_HEIGHT,
              // Later rows fade out, so the list reads as continuing beyond the
              // fold rather than as eight items that failed to load.
              opacity: 1 - index * 0.1,
            }}
            className="border-border bg-surface rounded-card grid grid-cols-[56px_1fr] grid-rows-[auto_auto_1fr] items-start gap-x-4 border px-4 py-3"
          >
            <div className="bg-surface-hover row-span-3 h-14 w-14 animate-pulse rounded-full" />

            <div className="bg-surface-hover col-start-2 h-4 w-40 animate-pulse rounded" />

            <div className="col-start-2 mt-2 flex items-center justify-between">
              <div className="bg-surface-hover h-3 w-24 animate-pulse rounded" />
              <div className="bg-surface-hover h-3 w-6 animate-pulse rounded" />
            </div>

            <div className="col-start-2 mt-3 flex items-end gap-1.5">
              <div className="bg-surface-hover h-6 w-16 animate-pulse rounded-full" />
              <div className="bg-surface-hover h-6 w-20 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
