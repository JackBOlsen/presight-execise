import type { User } from 'presight-shared';
import { flagFor } from '../lib/nationality';
import { Avatar } from './Avatar';

/**
 * A single person, laid out to the structure the brief specifies:
 *
 *   |----------------------------------|
 *   | avatar      first_name+last_name |
 *   |             nationality      age |
 *   |                                  |
 *   |             (2 hobbies) (+n)     |
 *   |----------------------------------|
 *
 * Built as a two-column grid with the avatar spanning all three rows, so the
 * name, the nationality and the hobbies genuinely share a left edge rather than
 * lining up by coincidence of padding.
 *
 * The height is fixed. That is a virtualisation requirement rather than a
 * stylistic choice: rows of varying height make the scrollbar resize as the
 * list measures itself, which reads as jitter. Everything that could grow —
 * long names, many hobbies — is truncated instead.
 */

/** Shown on the card; the rest are summarised as "+n". */
const VISIBLE_HOBBIES = 2;

export const USER_CARD_HEIGHT = 104;
export const USER_CARD_GAP = 12;
export const USER_ROW_HEIGHT = USER_CARD_HEIGHT + USER_CARD_GAP;

export function UserCard({ user }: { user: User }) {
  const shown = user.hobbies.slice(0, VISIBLE_HOBBIES);
  const remaining = user.hobbies.length - shown.length;

  return (
    <article
      style={{ height: USER_CARD_HEIGHT }}
      className="border-border bg-surface rounded-card shadow-card hover:border-border-strong grid grid-cols-[56px_1fr] grid-rows-[auto_auto_1fr] items-start gap-x-4 border px-4 py-3 transition-colors"
    >
      <Avatar
        src={user.avatar}
        firstName={user.first_name}
        lastName={user.last_name}
        seed={user.id}
        className="row-span-3 h-14 w-14"
      />

      <h3 className="text-text col-start-2 truncate text-[0.9375rem] leading-6 font-semibold">
        {user.first_name} {user.last_name}
      </h3>

      <div className="col-start-2 flex items-center justify-between gap-3 leading-6">
        <span className="text-text-muted min-w-0 truncate text-sm">
          {flagFor(user.nationality) && (
            <span aria-hidden="true" className="mr-1.5">
              {flagFor(user.nationality)}
            </span>
          )}
          {user.nationality}
        </span>
        <span className="text-text-subtle shrink-0 text-sm" title={`${user.age} years old`}>
          {user.age}
        </span>
      </div>

      <div className="col-start-2 flex min-w-0 items-end gap-1.5 overflow-hidden pt-1">
        {shown.map((hobby) => (
          <span
            key={hobby}
            className="bg-accent-soft text-accent-text max-w-[9rem] truncate rounded-full px-2.5 py-1 text-xs font-medium"
          >
            {hobby}
          </span>
        ))}

        {remaining > 0 && (
          // Outlined rather than filled, so it reads as a count of what is
          // hidden rather than as a third hobby.
          <span
            className="border-border text-text-subtle shrink-0 rounded-full border px-2 py-1 text-xs font-medium"
            title={user.hobbies.slice(VISIBLE_HOBBIES).join(', ')}
          >
            +{remaining}
          </span>
        )}

        {user.hobbies.length === 0 && (
          <span className="text-text-subtle text-xs italic">No hobbies listed</span>
        )}
      </div>
    </article>
  );
}
