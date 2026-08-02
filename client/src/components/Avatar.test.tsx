import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

/**
 * Avatars are remote URLs, so the fallback is not a rare edge case — an offline
 * run, a blocked request or a rate-limited provider all hit it at once, across
 * every visible row.
 */
describe('Avatar', () => {
  const props = {
    src: 'https://example.test/1.svg',
    firstName: 'Ada',
    lastName: 'Lovelace',
    seed: 1,
  };

  it('renders the image while it loads successfully', () => {
    const { container } = render(<Avatar {...props} />);
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', props.src);
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to initials when the image fails', () => {
    const { container } = render(<Avatar {...props} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('clears a previous failure when the row is reused', () => {
    // Virtualised rows are recycled, so a failure for one person must not
    // suppress the next person's avatar in the same DOM node.
    const { container, rerender } = render(<Avatar {...props} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('AL')).toBeInTheDocument();

    rerender(
      <Avatar {...props} src="https://example.test/2.svg" firstName="Grace" lastName="Hopper" />,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/2.svg');
  });

  it('gives the same person the same fallback tint every time', () => {
    const first = render(<Avatar {...props} seed={7} />);
    fireEvent.error(first.container.querySelector('img')!);
    const second = render(<Avatar {...props} seed={7} />);
    fireEvent.error(second.container.querySelector('img')!);

    const classOf = (result: { container: HTMLElement }) =>
      result.container.firstElementChild?.className;
    expect(classOf(first)).toBe(classOf(second));
  });

  it('is hidden from screen readers, since the name is already adjacent', () => {
    const { container } = render(<Avatar {...props} />);
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
});
