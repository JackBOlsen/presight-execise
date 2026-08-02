import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilters } from './ActiveFilters';

const defaults = {
  query: '',
  hobbies: [],
  nationalities: [],
  onClearQuery: () => {},
  onRemoveHobby: () => {},
  onRemoveNationality: () => {},
  onClearAll: () => {},
};

describe('ActiveFilters', () => {
  it('renders nothing when nothing is applied', () => {
    const { container } = render(<ActiveFilters {...defaults} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a chip for each applied filter', () => {
    render(
      <ActiveFilters {...defaults} query="ada" hobbies={['Chess']} nationalities={['Danish']} />,
    );
    expect(screen.getByText('“ada”')).toBeInTheDocument();
    expect(screen.getByText('Chess')).toBeInTheDocument();
    expect(screen.getByText('Danish')).toBeInTheDocument();
  });

  it('removes a hobby', async () => {
    const onRemoveHobby = vi.fn();
    render(<ActiveFilters {...defaults} hobbies={['Chess']} onRemoveHobby={onRemoveHobby} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Chess' }));
    expect(onRemoveHobby).toHaveBeenCalledWith('Chess');
  });

  it('removes a nationality', async () => {
    const onRemoveNationality = vi.fn();
    render(
      <ActiveFilters
        {...defaults}
        nationalities={['Danish']}
        onRemoveNationality={onRemoveNationality}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Danish' }));
    expect(onRemoveNationality).toHaveBeenCalledWith('Danish');
  });

  it('clears the text filter', async () => {
    const onClearQuery = vi.fn();
    render(<ActiveFilters {...defaults} query="ada" onClearQuery={onClearQuery} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter “ada”' }));
    expect(onClearQuery).toHaveBeenCalled();
  });

  it('offers "clear all" only when more than one filter is applied', () => {
    const { rerender } = render(<ActiveFilters {...defaults} hobbies={['Chess']} />);
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    rerender(<ActiveFilters {...defaults} hobbies={['Chess', 'Yoga']} />);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('lets a nationality be removed here even though the sidebar hides the alternatives', async () => {
    // Facet counts describe the current result set, so selecting a nationality
    // leaves only that one in its group. This bar is the reliable way back.
    const onRemoveNationality = vi.fn();
    render(
      <ActiveFilters
        {...defaults}
        nationalities={['Danish']}
        onRemoveNationality={onRemoveNationality}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Danish' }));
    expect(onRemoveNationality).toHaveBeenCalledWith('Danish');
  });
});
