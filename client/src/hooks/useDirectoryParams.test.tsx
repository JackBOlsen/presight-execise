import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useDirectoryParams } from './useDirectoryParams';

/**
 * The client's central promise: the URL *is* the view state, so reloading or
 * sharing a link restores exactly what the sender was looking at.
 *
 * These render the hook inside a real router so the assertions are about the
 * actual address bar rather than an internal copy of the state.
 */
function wrapperFor(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

/** Exposes both the hook and the resulting location. */
function renderDirectory(initialUrl = '/') {
  return renderHook(() => ({ params: useDirectoryParams(), location: useLocation() }), {
    wrapper: wrapperFor(initialUrl),
  });
}

describe('useDirectoryParams', () => {
  describe('reading', () => {
    it('starts from defaults on a bare URL', () => {
      const { result } = renderDirectory('/');
      expect(result.current.params.state).toEqual({
        q: '',
        nationalities: [],
        hobbies: [],
        sort: 'last_name',
        order: 'asc',
      });
      expect(result.current.params.hasFilters).toBe(false);
    });

    it('restores a fully specified view from the URL', () => {
      const { result } = renderDirectory(
        '/?q=ann&hobby=Chess&hobby=Yoga&nationality=Danish&sort=age&order=desc',
      );
      expect(result.current.params.state).toEqual({
        q: 'ann',
        hobbies: ['Chess', 'Yoga'],
        nationalities: ['Danish'],
        sort: 'age',
        order: 'desc',
      });
      expect(result.current.params.hasFilters).toBe(true);
    });

    it('survives an unrecognised sort without losing the rest', () => {
      const { result } = renderDirectory('/?q=ann&sort=email&order=desc');
      expect(result.current.params.state.sort).toBe('last_name');
      expect(result.current.params.state.q).toBe('ann');
      expect(result.current.params.state.order).toBe('desc');
    });
  });

  describe('writing', () => {
    it('reflects a hobby selection in the URL', () => {
      const { result } = renderDirectory('/');
      act(() => result.current.params.toggleHobby('Chess'));
      expect(result.current.location.search).toBe('?hobby=Chess');
      expect(result.current.params.state.hobbies).toEqual(['Chess']);
    });

    it('removes a hobby when toggled again', () => {
      const { result } = renderDirectory('/?hobby=Chess');
      act(() => result.current.params.toggleHobby('Chess'));
      expect(result.current.location.search).toBe('');
      expect(result.current.params.state.hobbies).toEqual([]);
    });

    it('accumulates several filters', () => {
      const { result } = renderDirectory('/');
      act(() => result.current.params.toggleHobby('Yoga'));
      act(() => result.current.params.toggleHobby('Chess'));
      act(() => result.current.params.toggleNationality('Danish'));
      // Canonical order, so re-selecting the same filters differently cannot
      // produce a different URL or a different cache key.
      expect(result.current.location.search).toBe('?nationality=Danish&hobby=Chess&hobby=Yoga');
    });

    it('omits defaults, so an untouched view has a bare URL', () => {
      const { result } = renderDirectory('/?sort=age');
      act(() => result.current.params.setSort('last_name'));
      expect(result.current.location.search).toBe('');
    });

    it('flips the sort direction', () => {
      const { result } = renderDirectory('/');
      act(() => result.current.params.toggleOrder());
      expect(result.current.location.search).toBe('?order=desc');
      act(() => result.current.params.toggleOrder());
      expect(result.current.location.search).toBe('');
    });

    it('clears filters but keeps the chosen sort', () => {
      // Clearing filters is about what is shown, not the order it is shown in.
      const { result } = renderDirectory('/?q=ann&hobby=Chess&sort=age&order=desc');
      act(() => result.current.params.clearFilters());
      expect(result.current.params.state).toEqual({
        q: '',
        hobbies: [],
        nationalities: [],
        sort: 'age',
        order: 'desc',
      });
    });

    it('resets everything with clearAll', () => {
      const { result } = renderDirectory('/?q=ann&hobby=Chess&sort=age&order=desc');
      act(() => result.current.params.clearAll());
      expect(result.current.location.search).toBe('');
    });
  });

  describe('history behaviour', () => {
    it('replaces rather than pushes while typing', () => {
      // Otherwise typing eight characters buries the previous page under eight
      // history entries and the back button becomes useless.
      const { result } = renderDirectory('/');
      act(() => result.current.params.setQuery('a'));
      act(() => result.current.params.setQuery('an'));
      act(() => result.current.params.setQuery('ann'));
      expect(result.current.location.search).toBe('?q=ann');
      expect(window.history.length).toBeLessThan(5);
    });

    it('round-trips a filter selection back to the same state', () => {
      const { result: first } = renderDirectory('/');
      act(() => first.current.params.toggleHobby('Chess'));
      act(() => first.current.params.toggleNationality('Danish'));
      act(() => first.current.params.setSort('age'));
      const shared = first.current.location.search;

      // Opening the produced link must reconstruct the same view.
      const { result: second } = renderDirectory(`/${shared}`);
      expect(second.current.params.state).toEqual(first.current.params.state);
    });
  });
});
