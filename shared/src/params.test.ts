import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTORY_STATE,
  hasActiveFilters,
  parseDirectoryState,
  toSearchParams,
  toggleFilterValue,
  type DirectoryState,
} from './params.js';

/**
 * The browser URL is the client's single source of truth, so these tests are
 * really about one property: whatever a user configures must survive being
 * written to a link, shared, and read back on another machine.
 */
describe('parseDirectoryState', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseDirectoryState('')).toEqual(DEFAULT_DIRECTORY_STATE);
  });

  it('reads every field', () => {
    expect(
      parseDirectoryState('q=ann&hobby=Chess&hobby=Yoga&nationality=Danish&sort=age&order=desc'),
    ).toEqual({
      q: 'ann',
      hobbies: ['Chess', 'Yoga'],
      nationalities: ['Danish'],
      sort: 'age',
      order: 'desc',
    });
  });

  it('degrades one bad field without discarding the rest', () => {
    // A stale or hand-edited link should still show something sensible rather
    // than resetting the whole view or firing a request that 400s.
    const state = parseDirectoryState('q=ann&sort=email&order=desc&hobby=Chess');
    expect(state.sort).toBe('last_name');
    expect(state.q).toBe('ann');
    expect(state.order).toBe('desc');
    expect(state.hobbies).toEqual(['Chess']);
  });

  it('falls back on an unknown order', () => {
    expect(parseDirectoryState('order=sideways').order).toBe('asc');
  });

  it('trims, de-duplicates and drops blank filter values', () => {
    expect(parseDirectoryState('hobby=Chess&hobby=+Chess+&hobby=&hobby=Yoga').hobbies).toEqual([
      'Chess',
      'Yoga',
    ]);
  });

  it('caps an over-long text filter rather than dropping it', () => {
    expect(parseDirectoryState(`q=${'a'.repeat(500)}`).q).toHaveLength(100);
  });
});

describe('toSearchParams', () => {
  it('omits values equal to the default, keeping an untouched URL bare', () => {
    expect(toSearchParams(DEFAULT_DIRECTORY_STATE).toString()).toBe('');
  });

  it('repeats multi-value filters instead of joining them with commas', () => {
    const qs = toSearchParams({ ...DEFAULT_DIRECTORY_STATE, hobbies: ['Chess', 'Yoga'] });
    expect(qs.toString()).toBe('hobby=Chess&hobby=Yoga');
  });

  it('keeps a comma inside a value intact through a round trip', () => {
    // The reason for repeated parameters rather than comma-joining.
    const state = { ...DEFAULT_DIRECTORY_STATE, nationalities: ['Bosnia, Herzegovina'] };
    expect(parseDirectoryState(toSearchParams(state)).nationalities).toEqual([
      'Bosnia, Herzegovina',
    ]);
  });

  it('produces the same string regardless of selection order', () => {
    // Canonical output means the same view yields the same URL, the same cache
    // key and the same HTTP request, so re-picking filters cannot cause a refetch.
    const a = toSearchParams({ ...DEFAULT_DIRECTORY_STATE, hobbies: ['Yoga', 'Chess'] });
    const b = toSearchParams({ ...DEFAULT_DIRECTORY_STATE, hobbies: ['Chess', 'Yoga'] });
    expect(a.toString()).toBe(b.toString());
  });

  it('carries paging arguments only when asked', () => {
    expect(toSearchParams(DEFAULT_DIRECTORY_STATE, { cursor: 'abc', limit: 30 }).toString()).toBe(
      'cursor=abc&limit=30',
    );
  });

  it('round-trips a fully populated state', () => {
    const original: DirectoryState = {
      q: 'ann',
      nationalities: ['Danish', 'German'],
      hobbies: ['Chess', 'Hiking'],
      sort: 'age',
      order: 'desc',
    };
    expect(parseDirectoryState(toSearchParams(original))).toEqual(original);
  });
});

describe('helpers', () => {
  it('toggleFilterValue adds then removes', () => {
    expect(toggleFilterValue([], 'Chess')).toEqual(['Chess']);
    expect(toggleFilterValue(['Chess'], 'Chess')).toEqual([]);
    expect(toggleFilterValue(['Yoga'], 'Chess')).toEqual(['Chess', 'Yoga']);
  });

  it('hasActiveFilters reflects anything that narrows the set', () => {
    expect(hasActiveFilters(DEFAULT_DIRECTORY_STATE)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_DIRECTORY_STATE, q: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_DIRECTORY_STATE, hobbies: ['Chess'] })).toBe(true);
    // Sort narrows nothing, so it must not count as an active filter.
    expect(hasActiveFilters({ ...DEFAULT_DIRECTORY_STATE, sort: 'age' })).toBe(false);
  });
});
