import { render, screen, waitFor } from '@testing-library/react';
import type { User } from 'presight-shared';
import { describe, expect, it, vi } from 'vitest';
import { UserList } from './UserList';

/**
 * Virtualisation and infinite loading.
 *
 * jsdom reports a real window height but zero-size elements, so these assert
 * behaviour that does not depend on layout: that only a window of rows is
 * mounted, and that reaching the end of the loaded data asks for more.
 */
const buildUsers = (count: number): User[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    avatar: `https://example.test/${index + 1}.svg`,
    first_name: `First${index + 1}`,
    last_name: `Last${index + 1}`,
    age: 20 + (index % 50),
    nationality: 'Danish',
    hobbies: ['Chess'],
  }));

const defaults = {
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => {},
};

describe('UserList', () => {
  it('renders the users it is given', () => {
    render(<UserList {...defaults} users={buildUsers(3)} />);
    expect(screen.getByText('First1 Last1')).toBeInTheDocument();
  });

  it('mounts only a window of rows rather than the whole list', () => {
    // The point of virtualising: 5,000 users must not become 5,000 DOM nodes.
    render(<UserList {...defaults} users={buildUsers(5000)} />);
    const rendered = screen.getAllByRole('listitem');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
  });

  it('reserves the full scroll height for the whole list', () => {
    // So the scrollbar reflects the real length even though most rows are absent.
    render(<UserList {...defaults} users={buildUsers(1000)} />);
    const list = screen.getByRole('list', { name: 'People' });
    expect(Number.parseInt(list.style.height, 10)).toBeGreaterThan(100_000);
  });

  it('positions rows without gaps between them', () => {
    render(<UserList {...defaults} users={buildUsers(50)} />);
    const offsets = screen
      .getAllByRole('listitem')
      .map((row) => Number.parseInt(row.style.transform.replace(/\D+/g, ''), 10));
    const steps = offsets.slice(1).map((value, index) => value - offsets[index]!);
    // A single consistent step means no overlap and no visual gap.
    expect(new Set(steps).size).toBe(1);
  });

  describe('infinite loading', () => {
    it('asks for the next page when the end of the loaded data is in view', async () => {
      const fetchNextPage = vi.fn();
      // Few enough users that the rendered window reaches the end immediately.
      render(
        <UserList {...defaults} users={buildUsers(5)} hasNextPage fetchNextPage={fetchNextPage} />,
      );
      await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
    });

    it('does not ask again while a page is already loading', () => {
      const fetchNextPage = vi.fn();
      render(
        <UserList
          {...defaults}
          users={buildUsers(5)}
          hasNextPage
          isFetchingNextPage
          fetchNextPage={fetchNextPage}
        />,
      );
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('does not ask when there is nothing more to load', () => {
      const fetchNextPage = vi.fn();
      render(<UserList {...defaults} users={buildUsers(5)} fetchNextPage={fetchNextPage} />);
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('shows a loader while fetching more', () => {
      render(<UserList {...defaults} users={buildUsers(5)} hasNextPage isFetchingNextPage />);
      expect(screen.getByRole('status', { name: 'Loading more people' })).toBeInTheDocument();
    });

    it('says so once everything has been shown', () => {
      render(<UserList {...defaults} users={buildUsers(3)} />);
      expect(screen.getByText(/that is everyone/)).toBeInTheDocument();
    });

    it('says nothing about the end when the list is empty', () => {
      render(<UserList {...defaults} users={[]} />);
      expect(screen.queryByText(/that is everyone/)).not.toBeInTheDocument();
    });
  });
});
