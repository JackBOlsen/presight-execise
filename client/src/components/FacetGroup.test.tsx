import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FacetGroup } from './FacetGroup';

const values = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: `Value${index + 1}`,
    count: (count - index) * 10,
  }));

const defaults = {
  title: 'Hobbies',
  selected: [],
  onToggle: () => {},
  emptyMessage: 'No hobbies in these results.',
};

describe('FacetGroup', () => {
  it('shows each value with its count', () => {
    render(<FacetGroup {...defaults} values={[{ value: 'Chess', count: 1234 }]} />);
    expect(screen.getByText('Chess')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('reports a value as selected', () => {
    render(<FacetGroup {...defaults} values={values(3)} selected={['Value2']} />);
    expect(screen.getByRole('checkbox', { name: /Value2/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Value1/ })).not.toBeChecked();
  });

  it('reports how many are selected', () => {
    render(<FacetGroup {...defaults} values={values(5)} selected={['Value1', 'Value2']} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const onToggle = vi.fn();
    render(<FacetGroup {...defaults} values={values(3)} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Value2/ }));
    expect(onToggle).toHaveBeenCalledWith('Value2');
  });

  it('toggles a selected value back off', async () => {
    const onToggle = vi.fn();
    render(
      <FacetGroup {...defaults} values={values(3)} selected={['Value1']} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Value1/ }));
    expect(onToggle).toHaveBeenCalledWith('Value1');
  });

  describe('collapsing', () => {
    it('shows only the first eight to start with', () => {
      // Twenty of each group would make a very long sidebar.
      render(<FacetGroup {...defaults} values={values(20)} />);
      expect(screen.getAllByRole('checkbox')).toHaveLength(8);
      expect(screen.getByText('Show 12 more')).toBeInTheDocument();
    });

    it('reveals the rest on request', async () => {
      render(<FacetGroup {...defaults} values={values(20)} />);
      await userEvent.click(screen.getByText('Show 12 more'));
      expect(screen.getAllByRole('checkbox')).toHaveLength(20);
    });

    it('collapses again', async () => {
      render(<FacetGroup {...defaults} values={values(20)} />);
      await userEvent.click(screen.getByText('Show 12 more'));
      await userEvent.click(screen.getByText('Show fewer'));
      expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    });

    it('offers no expander when everything already fits', () => {
      render(<FacetGroup {...defaults} values={values(4)} />);
      expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
    });
  });

  it('keeps a selected value visible even if the API stops returning it', () => {
    // A filter that cannot be switched off would strand the user with results
    // they did not ask for and no way back.
    render(<FacetGroup {...defaults} values={values(3)} selected={['Vanished']} />);
    expect(screen.getByRole('checkbox', { name: /Vanished/ })).toBeChecked();
  });

  it('explains an empty group rather than leaving a blank space', () => {
    render(<FacetGroup {...defaults} values={[]} />);
    expect(screen.getByText('No hobbies in these results.')).toBeInTheDocument();
  });
});
