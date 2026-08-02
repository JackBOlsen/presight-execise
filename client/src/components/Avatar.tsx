import { useEffect, useState } from 'react';

/**
 * A user's avatar, with initials as a fallback.
 *
 * The seeded avatars are remote URLs, so an offline run, a blocked request or a
 * rate-limited provider would otherwise leave a grid of broken-image icons.
 * Falling back to initials on a tinted background keeps the list looking
 * designed rather than broken.
 */
interface AvatarProps {
  src: string;
  firstName: string;
  lastName: string;
  /** Seeds the fallback tint, so a given person keeps the same colour. */
  seed: number;
  className?: string;
}

/** Muted, theme-aware tints. Chosen to stay legible against the text colour. */
const TINTS = [
  'bg-[oklch(88%_0.06_264)] dark:bg-[oklch(38%_0.07_264)]',
  'bg-[oklch(88%_0.06_180)] dark:bg-[oklch(38%_0.07_180)]',
  'bg-[oklch(89%_0.06_140)] dark:bg-[oklch(38%_0.07_140)]',
  'bg-[oklch(90%_0.06_70)]  dark:bg-[oklch(38%_0.07_70)]',
  'bg-[oklch(89%_0.06_20)]  dark:bg-[oklch(38%_0.07_20)]',
  'bg-[oklch(88%_0.06_320)] dark:bg-[oklch(38%_0.07_320)]',
];

export function Avatar({ src, firstName, lastName, seed, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // Recycled rows reuse this component for a different person, so a previous
  // failure must not carry over to the next avatar.
  useEffect(() => setFailed(false), [src]);

  const initials = `${firstName.at(0) ?? ''}${lastName.at(0) ?? ''}`.toUpperCase();
  const tint = TINTS[seed % TINTS.length];

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={`text-text flex items-center justify-center rounded-full text-sm font-semibold ${tint} ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      // The name is already adjacent in the card, so announcing it again would
      // just repeat it to a screen reader.
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-surface-hover rounded-full object-cover ${className}`}
    />
  );
}
