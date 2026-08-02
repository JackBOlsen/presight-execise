import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterDrawer } from './FilterDrawer';

const defaults = {
  open: false,
  onOpen: () => {},
  onClose: () => {},
  activeCount: 0,
  resultCount: 42,
  children: <p>Filter contents</p>,
};

describe('FilterDrawer', () => {
  it('shows a trigger and keeps the panel closed', () => {
    render(<FilterDrawer {...defaults} />);
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
    expect(screen.queryByText('Filter contents')).not.toBeInTheDocument();
  });

  it('counts the applied filters on the trigger', () => {
    // So the button says how much is hidden behind it, not merely that filters exist.
    render(<FilterDrawer {...defaults} activeCount={3} />);
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('3');
  });

  it('opens on click', async () => {
    const onOpen = vi.fn();
    render(<FilterDrawer {...defaults} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('renders its contents when open', () => {
    render(<FilterDrawer {...defaults} open />);
    expect(screen.getByText('Filter contents')).toBeInTheDocument();
  });

  it('shows the result count on the confirm button', () => {
    // Closing should report what the choices achieved.
    render(<FilterDrawer {...defaults} open resultCount={1234} />);
    expect(screen.getByRole('button', { name: 'Show 1,234 people' })).toBeInTheDocument();
  });

  it('uses the singular for one result', () => {
    render(<FilterDrawer {...defaults} open resultCount={1} />);
    expect(screen.getByRole('button', { name: 'Show 1 person' })).toBeInTheDocument();
  });

  describe('closing', () => {
    it('closes from the close button', async () => {
      const onClose = vi.fn();
      render(<FilterDrawer {...defaults} open onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Close filters' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes from the confirm button', async () => {
      const onClose = vi.fn();
      render(<FilterDrawer {...defaults} open onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: /Show 42 people/ }));
      expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', async () => {
      const onClose = vi.fn();
      render(<FilterDrawer {...defaults} open onClose={onClose} />);
      await userEvent.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    it('ignores Escape when already closed', async () => {
      const onClose = vi.fn();
      render(<FilterDrawer {...defaults} onClose={onClose} />);
      await userEvent.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('page scroll', () => {
    it('locks the page while open', () => {
      // Otherwise the list scrolls under the overlay and the reader loses their
      // place in fifty thousand rows.
      render(<FilterDrawer {...defaults} open />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores scrolling when closed', () => {
      const { rerender } = render(<FilterDrawer {...defaults} open />);
      expect(document.body.style.overflow).toBe('hidden');
      rerender(<FilterDrawer {...defaults} open={false} />);
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('restores scrolling when unmounted while open', () => {
      const { unmount } = render(<FilterDrawer {...defaults} open />);
      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });
});
