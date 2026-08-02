import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'presight-shared';
import { describe, expect, it } from 'vitest';
import { UserCard } from './UserCard';

/**
 * The card's contract with the brief: show up to two hobbies and summarise the
 * rest as "+n". The counting boundaries are where this goes wrong, so they get
 * a case each.
 */
const buildUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  avatar: 'https://example.test/1.svg',
  first_name: 'Ada',
  last_name: 'Lovelace',
  age: 36,
  nationality: 'British',
  hobbies: ['Chess', 'Reading'],
  ...overrides,
});

describe('UserCard', () => {
  it('shows the name, nationality and age', () => {
    render(<UserCard user={buildUser()} />);
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('British')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
  });

  describe('hobby display', () => {
    it('shows nothing but a note when there are none', () => {
      render(<UserCard user={buildUser({ hobbies: [] })} />);
      expect(screen.getByText('No hobbies listed')).toBeInTheDocument();
      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it('shows a single hobby without a counter', () => {
      render(<UserCard user={buildUser({ hobbies: ['Chess'] })} />);
      expect(screen.getByText('Chess')).toBeInTheDocument();
      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it('shows exactly two without a counter', () => {
      // The boundary: two fit, so "+0" must never appear.
      render(<UserCard user={buildUser({ hobbies: ['Chess', 'Reading'] })} />);
      expect(screen.getByText('Chess')).toBeInTheDocument();
      expect(screen.getByText('Reading')).toBeInTheDocument();
      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it('shows two plus a counter for the third', () => {
      render(<UserCard user={buildUser({ hobbies: ['Chess', 'Reading', 'Yoga'] })} />);
      expect(screen.getByText('Chess')).toBeInTheDocument();
      expect(screen.getByText('Reading')).toBeInTheDocument();
      expect(screen.queryByText('Yoga')).not.toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('counts all ten correctly', () => {
      const hobbies = Array.from({ length: 10 }, (_, i) => `Hobby${i}`);
      render(<UserCard user={buildUser({ hobbies })} />);
      expect(screen.getByText('+8')).toBeInTheDocument();
    });

    it('names the hidden hobbies on hover', async () => {
      // The count alone is not much use without a way to see what it stands for.
      render(<UserCard user={buildUser({ hobbies: ['Chess', 'Reading', 'Yoga', 'Baking'] })} />);
      const counter = screen.getByText('+2');
      expect(counter).toHaveAttribute('title', 'Yoga, Baking');
      await userEvent.hover(counter);
    });
  });

  describe('nationality flag', () => {
    it('decorates a known nationality', () => {
      const { container } = render(<UserCard user={buildUser({ nationality: 'Danish' })} />);
      expect(container.textContent).toContain('🇩🇰');
    });

    it('renders an unknown nationality without one', () => {
      // Presentation-only, so an unmapped value loses the emoji, not the person.
      const { container } = render(<UserCard user={buildUser({ nationality: 'Atlantean' })} />);
      expect(screen.getByText('Atlantean')).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\p{Regional_Indicator}/u);
    });
  });

  it('keeps a fixed height, which virtualisation depends on', () => {
    // Rows of varying height make the scrollbar resize as the list measures
    // itself, which reads as jitter while scrolling.
    const short = render(<UserCard user={buildUser({ hobbies: [] })} />);
    const tall = render(
      <UserCard
        user={buildUser({
          first_name: 'Bartholomew',
          last_name: 'Featherstonehaugh-Vandermeer',
          hobbies: Array.from({ length: 10 }, (_, i) => `A very long hobby name ${i}`),
        })}
      />,
    );

    const heightOf = (result: { container: HTMLElement }) =>
      (result.container.querySelector('article') as HTMLElement).style.height;

    expect(heightOf(short)).toBe(heightOf(tall));
    expect(heightOf(short)).toBe('104px');
  });
});
