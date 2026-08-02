import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchDraft } from './useSearchDraft';

/**
 * The reconciliation between a field that types instantly and a URL that is the
 * real state. Every test here is a race that produced a visible bug before the
 * `requested` ref existed.
 */
describe('useSearchDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drives the hook with a URL value the test controls, as the app does. */
  const setup = (initial = '') => {
    const commit = vi.fn();
    const view = renderHook(({ url }) => useSearchDraft(url, commit), {
      initialProps: { url: initial },
    });
    return { commit, ...view };
  };

  it('shows what was typed immediately', () => {
    const { result } = setup();
    act(() => result.current.onChange('ada'));
    expect(result.current.draft).toBe('ada');
  });

  it('does not write to the URL until typing stops', () => {
    const { commit, result } = setup();

    act(() => result.current.onChange('a'));
    act(() => result.current.onChange('ad'));
    act(() => result.current.onChange('ada'));
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('ada');
  });

  it('reports typing until the URL catches up', () => {
    const { result, rerender } = setup();

    act(() => result.current.onChange('ada'));
    expect(result.current.isTyping).toBe(true);

    rerender({ url: 'ada' });
    expect(result.current.isTyping).toBe(false);
  });

  it('keeps a trailing space without reporting it as unapplied', () => {
    // The field legitimately holds "ada " while the URL holds "ada" — a space
    // separates the given name from the family name, so it must survive.
    const { result, rerender } = setup();

    act(() => result.current.onChange('ada '));
    act(() => vi.advanceTimersByTime(300));
    rerender({ url: 'ada' });

    expect(result.current.draft).toBe('ada ');
    expect(result.current.isTyping).toBe(false);
  });

  describe('when something else changes the URL', () => {
    it('adopts the new value', () => {
      // The back button, removing a chip, clearing all filters.
      const { result, rerender } = setup('ada');
      rerender({ url: 'grace' });
      expect(result.current.draft).toBe('grace');
    });

    it('drops a write that was already scheduled', () => {
      // The bug this hook exists for: edit an applied search, clear the filters
      // before the debounce elapses, and the pending write fires a moment later
      // and silently restores what was just cleared.
      const { commit, result, rerender } = setup('ada');

      act(() => result.current.onChange('adam'));
      rerender({ url: '' });
      act(() => vi.advanceTimersByTime(300));

      expect(commit).not.toHaveBeenCalled();
      expect(result.current.draft).toBe('');
    });
  });

  it('does not fight its own change coming back', () => {
    const { result, rerender } = setup();

    act(() => result.current.onChange('ada'));
    act(() => vi.advanceTimersByTime(300));
    rerender({ url: 'ada' });

    // Still exactly what was typed — the effect recognised its own write and
    // left the field alone rather than resetting it.
    expect(result.current.draft).toBe('ada');
  });
});
