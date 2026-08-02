import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const defaults = {
  query: '',
  hobbies: [],
  nationalities: [],
  onClearFilters: () => {},
};

describe('EmptyState', () => {
  it('names the text filter that produced nothing', () => {
    // "No results" leaves the user to work out which filter is the culprit.
    render(<EmptyState {...defaults} query="zzzz" />);
    expect(screen.getByText(/matching “zzzz”/)).toBeInTheDocument();
  });

  it('names the selected hobbies', () => {
    render(<EmptyState {...defaults} hobbies={['Chess', 'Yoga']} />);
    expect(screen.getByText(/with Chess and Yoga/)).toBeInTheDocument();
  });

  it('joins three or more readably', () => {
    render(<EmptyState {...defaults} hobbies={['Chess', 'Yoga', 'Baking']} />);
    expect(screen.getByText(/with Chess, Yoga and Baking/)).toBeInTheDocument();
  });

  it('uses "or" for nationalities, matching their filter semantics', () => {
    // Nationalities widen the search; hobbies narrow it. The wording should not
    // imply the wrong one.
    render(<EmptyState {...defaults} nationalities={['Danish', 'Dutch']} />);
    expect(screen.getByText(/from Danish or Dutch/)).toBeInTheDocument();
  });

  it('describes every active filter together', () => {
    render(<EmptyState {...defaults} query="ada" hobbies={['Chess']} nationalities={['Danish']} />);
    const text = screen.getByText(/Nobody/).textContent ?? '';
    expect(text).toContain('“ada”');
    expect(text).toContain('Chess');
    expect(text).toContain('Danish');
  });

  it('offers to clear the filters', async () => {
    const onClearFilters = vi.fn();
    render(<EmptyState {...defaults} hobbies={['Chess']} onClearFilters={onClearFilters} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('offers nothing to clear when no filter is applied', () => {
    // An empty unfiltered directory is a different situation: clearing would
    // change nothing, so the button would be a dead end.
    render(<EmptyState {...defaults} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('The directory appears to be empty.')).toBeInTheDocument();
  });
});
