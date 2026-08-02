import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FACET_LIMIT,
  type DirectoryFilters,
  type SortField,
  type SortOrder,
} from 'presight-shared';
import type { Database } from '../db/connection.js';
import {
  EXPECTED_HOBBY_COUNTS,
  EXPECTED_NATIONALITY_COUNTS,
  FIXTURE_NATIONALITIES,
  FIXTURE_USERS,
  NO_FILTERS,
  createFixtureDatabase,
} from '../test/fixture.js';
import {
  countUsers,
  hobbiesForUsers,
  listUsers,
  topHobbies,
  topNationalities,
} from './repository.js';

/**
 * The filtering, sorting and pagination semantics the brief specifies, checked
 * against a dataset small enough to verify by hand.
 */
describe('repository', () => {
  let db: Database;

  beforeEach(() => {
    db = createFixtureDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const filters = (overrides: Partial<DirectoryFilters> = {}): DirectoryFilters => ({
    ...NO_FILTERS,
    ...overrides,
  });

  /** Ids of everything matching, in the given order, ignoring paging. */
  const idsFor = (f: DirectoryFilters, sort: SortField = 'last_name', order: SortOrder = 'asc') =>
    listUsers(db, { filters: f, sort, order, limit: 100 }).rows.map((row) => row.id);

  describe('text filter', () => {
    it('matches a first-name prefix, ignoring case', () => {
      expect(idsFor(filters({ q: 'ada' })).sort()).toEqual([1, 8]);
      expect(idsFor(filters({ q: 'ADA' })).sort()).toEqual([1, 8]);
      expect(idsFor(filters({ q: 'AdA' })).sort()).toEqual([1, 8]);
    });

    it('matches a last-name prefix too', () => {
      // Zed Aardvark matches on surname alone.
      expect(idsFor(filters({ q: 'aard' }))).toEqual([12]);
    });

    it('searches both name parts at once', () => {
      // First names Ada, Alan, Alonzo, ADA plus the surname Aardvark.
      expect(idsFor(filters({ q: 'a' })).sort((a, b) => a - b)).toEqual([1, 2, 4, 8, 12]);
    });

    it('anchors at the start rather than matching anywhere', () => {
      // "ing" appears inside Turing but must not match it.
      expect(idsFor(filters({ q: 'ing' }))).toEqual([]);
    });

    it('treats % as a literal character, not a wildcard', () => {
      // Without escaping this would match every user in the table.
      expect(idsFor(filters({ q: '%' }))).toEqual([]);
      expect(idsFor(filters({ q: 'Per%' }))).toEqual([11]);
      expect(idsFor(filters({ q: 'Per%y' }))).toEqual([11]);
    });

    it('treats _ as a literal character too', () => {
      // As a wildcard this would match every name of at least one character.
      expect(idsFor(filters({ q: '_' }))).toEqual([]);
      expect(idsFor(filters({ q: 'P_r' }))).toEqual([]);
    });

    it('returns nothing for a query that matches nobody', () => {
      expect(idsFor(filters({ q: 'zzzz' }))).toEqual([]);
    });

    describe('a full name', () => {
      it('reads two words as given name then family name', () => {
        // Ada Lovelace (1) and ADA Lovelace (8).
        expect(idsFor(filters({ q: 'Ada Lovelace' })).sort((a, b) => a - b)).toEqual([1, 8]);
        expect(idsFor(filters({ q: 'Zed Aardvark' }))).toEqual([12]);
      });

      it('accepts a partial on both halves', () => {
        // The reason each column is matched separately rather than against a
        // concatenated "first last" string, which needs a complete first name.
        expect(idsFor(filters({ q: 'Al Tur' }))).toEqual([2]);
        expect(idsFor(filters({ q: 'Ze Aar' }))).toEqual([12]);
        expect(idsFor(filters({ q: 'Ada Love' })).sort((a, b) => a - b)).toEqual([1, 8]);
      });

      it('is case-insensitive across both words', () => {
        expect(idsFor(filters({ q: 'aDa lOvE' })).sort((a, b) => a - b)).toEqual([1, 8]);
      });

      it('respects word order', () => {
        // Reversing the words is a different search, not the same one. This is
        // what lets a search exclude someone whose names are the mirror image.
        expect(idsFor(filters({ q: 'Turing Alan' }))).toEqual([]);
        expect(idsFor(filters({ q: 'Aardvark Zed' }))).toEqual([]);
      });

      it('does not let the second word match the first name again', () => {
        // "Ada Ada" must not match Ada Lovelace by satisfying both words from
        // the given name — the loose behaviour a plain token search would have.
        expect(idsFor(filters({ q: 'Ada Ada' }))).toEqual([]);
      });

      it('requires both words to match', () => {
        expect(idsFor(filters({ q: 'Ada Turing' }))).toEqual([]);
        expect(idsFor(filters({ q: 'Grace Lovelace' }))).toEqual([]);
      });

      it('still escapes wildcards in either word', () => {
        expect(idsFor(filters({ q: 'Per%y Perc' }))).toEqual([11]);
        expect(idsFor(filters({ q: 'Per%y %' }))).toEqual([]);
        expect(idsFor(filters({ q: '% %' }))).toEqual([]);
      });

      it('tolerates extra whitespace between the words', () => {
        expect(idsFor(filters({ q: 'Alan   Turing' }))).toEqual([2]);
      });

      it('treats everything after the first word as the family name', () => {
        // Nobody in the fixture has a two-part surname, so this finds nobody —
        // but it must not silently fall back to matching on the first word.
        expect(idsFor(filters({ q: 'Alan Turing Extra' }))).toEqual([]);
      });
    });
  });

  describe('nationality filter (OR)', () => {
    it('matches a single nationality', () => {
      expect(idsFor(filters({ nationality: ['British'] })).sort((a, b) => a - b)).toEqual([
        1, 2, 8, 9,
      ]);
    });

    it('widens with each additional nationality', () => {
      const one = idsFor(filters({ nationality: ['British'] }));
      const two = idsFor(filters({ nationality: ['British', 'Danish'] }));
      expect(two.length).toBeGreaterThan(one.length);
      expect(two.sort((a, b) => a - b)).toEqual([1, 2, 8, 9, 11, 12]);
    });

    it('returns nothing for a nationality nobody has', () => {
      expect(idsFor(filters({ nationality: ['Martian'] }))).toEqual([]);
    });
  });

  describe('hobby filter (AND)', () => {
    it('matches a single hobby', () => {
      expect(idsFor(filters({ hobby: ['Chess'] })).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 5, 7, 11, 12,
      ]);
    });

    it('narrows with each additional hobby', () => {
      // Only users holding *every* selected hobby.
      expect(idsFor(filters({ hobby: ['Chess', 'Reading'] })).sort((a, b) => a - b)).toEqual([
        1, 3, 12,
      ]);
      expect(
        idsFor(filters({ hobby: ['Chess', 'Reading', 'Sailing'] })).sort((a, b) => a - b),
      ).toEqual([3, 12]);
    });

    it('matches the user holding all ten', () => {
      expect(
        idsFor(filters({ hobby: ['Baking', 'Cooking', 'Hiking', 'Painting', 'Yoga'] })),
      ).toEqual([12]);
    });

    it('returns nothing when one selected hobby does not exist', () => {
      // The count can never reach the requested total, which is the correct
      // answer rather than silently ignoring the unknown value.
      expect(idsFor(filters({ hobby: ['Chess', 'Skydiving'] }))).toEqual([]);
      expect(idsFor(filters({ hobby: ['Skydiving'] }))).toEqual([]);
    });

    it('never matches the user with no hobbies', () => {
      const withChess = idsFor(filters({ hobby: ['Chess'] }));
      expect(withChess).not.toContain(4);
    });
  });

  describe('filters combine', () => {
    it('applies text, hobby and nationality together', () => {
      // q=a gives 1, 2, 4, 8, 12; of those Chess leaves 1, 2, 12.
      expect(idsFor(filters({ q: 'a', hobby: ['Chess'] })).sort((a, b) => a - b)).toEqual([
        1, 2, 12,
      ]);
      // Adding British leaves 1 and 2.
      expect(
        idsFor(filters({ q: 'a', hobby: ['Chess'], nationality: ['British'] })).sort(
          (a, b) => a - b,
        ),
      ).toEqual([1, 2]);
    });

    it('yields nothing when the combination is unsatisfiable', () => {
      expect(idsFor(filters({ nationality: ['Dutch'], hobby: ['Sailing'] }))).toEqual([]);
    });
  });

  describe('countUsers', () => {
    it('counts everything when unfiltered', () => {
      expect(countUsers(db, filters())).toBe(FIXTURE_USERS.length);
    });

    it('counts the filtered set, not the page', () => {
      expect(countUsers(db, filters({ hobby: ['Chess'] }))).toBe(7);
      expect(countUsers(db, filters({ nationality: ['British', 'Danish'] }))).toBe(6);
      expect(countUsers(db, filters({ q: 'zzzz' }))).toBe(0);
    });
  });

  describe('sorting', () => {
    it('orders by last name, breaking ties on id', () => {
      // Two Lovelaces (1 and 8) sit next to each other and must stay in id order.
      expect(idsFor(filters(), 'last_name', 'asc')).toEqual([
        12, 9, 4, 5, 3, 7, 6, 1, 8, 11, 10, 2,
      ]);
    });

    it('orders by age, breaking ties on id', () => {
      // 30: 11, 12 — 36: 1, 8.
      expect(idsFor(filters(), 'age', 'asc')).toEqual([11, 12, 1, 8, 2, 3, 10, 9, 5, 6, 7, 4]);
    });

    it('orders by nationality name, breaking ties on id', () => {
      expect(idsFor(filters(), 'nationality', 'asc')).toEqual([
        3, 4, 6, 7, 1, 2, 8, 9, 11, 12, 5, 10,
      ]);
    });

    it('reverses cleanly, including the tie-breaker', () => {
      const ascending = idsFor(filters(), 'age', 'asc');
      const descending = idsFor(filters(), 'age', 'desc');
      expect(descending).toEqual([...ascending].reverse());
    });

    it('is stable across identical calls', () => {
      expect(idsFor(filters(), 'age', 'asc')).toEqual(idsFor(filters(), 'age', 'asc'));
    });

    it.each(['first_name', 'last_name', 'age', 'nationality'] as const)(
      'produces a total order for %s (no two rows compare equal)',
      (sort) => {
        for (const order of ['asc', 'desc'] as const) {
          const ids = idsFor(filters(), sort, order);
          expect(new Set(ids).size).toBe(FIXTURE_USERS.length);
        }
      },
    );
  });

  describe('keyset pagination', () => {
    /** Page through the whole set the way a client would. */
    const walk = (sort: SortField, order: SortOrder, pageSize: number) => {
      const collected: number[] = [];
      let cursor: { value: string | number; id: number } | undefined;
      for (let guard = 0; guard < 100; guard++) {
        const page = listUsers(db, {
          filters: filters(),
          sort,
          order,
          limit: pageSize,
          ...(cursor && { cursor }),
        });
        collected.push(...page.rows.map((row) => row.id));
        if (!page.hasMore) return collected;
        const last = page.rows.at(-1)!;
        const value =
          sort === 'age' ? last.age : sort === 'nationality' ? last.nationality : last[sort];
        cursor = { value, id: last.id };
      }
      throw new Error('pagination did not terminate');
    };

    it.each([
      ['first_name', 'asc'],
      ['first_name', 'desc'],
      ['last_name', 'asc'],
      ['last_name', 'desc'],
      ['age', 'asc'],
      ['age', 'desc'],
      ['nationality', 'asc'],
      ['nationality', 'desc'],
    ] as const)('walks %s %s without duplicates or gaps', (sort, order) => {
      const expected = idsFor(filters(), sort, order);
      for (const pageSize of [1, 2, 5, 7]) {
        // Page size must not affect which users are seen, only how they arrive.
        expect(walk(sort, order, pageSize)).toEqual(expected);
      }
    });

    it('reports hasMore only while more remain', () => {
      const page = listUsers(db, { filters: filters(), sort: 'age', order: 'asc', limit: 5 });
      expect(page.rows).toHaveLength(5);
      expect(page.hasMore).toBe(true);

      const all = listUsers(db, { filters: filters(), sort: 'age', order: 'asc', limit: 100 });
      expect(all.rows).toHaveLength(FIXTURE_USERS.length);
      expect(all.hasMore).toBe(false);
    });

    it('reports no more when the page exactly exhausts the set', () => {
      // The off-by-one worth guarding: a full final page must not claim another.
      const page = listUsers(db, {
        filters: filters(),
        sort: 'age',
        order: 'asc',
        limit: FIXTURE_USERS.length,
      });
      expect(page.rows).toHaveLength(FIXTURE_USERS.length);
      expect(page.hasMore).toBe(false);
    });

    it('respects filters while paginating', () => {
      const f = filters({ hobby: ['Chess'] });
      const expected = listUsers(db, {
        filters: f,
        sort: 'age',
        order: 'asc',
        limit: 100,
      }).rows.map((r) => r.id);
      const first = listUsers(db, { filters: f, sort: 'age', order: 'asc', limit: 3 });
      const last = first.rows.at(-1)!;
      const second = listUsers(db, {
        filters: f,
        sort: 'age',
        order: 'asc',
        limit: 3,
        cursor: { value: last.age, id: last.id },
      });
      expect([...first.rows, ...second.rows].map((r) => r.id)).toEqual(expected.slice(0, 6));
    });
  });

  describe('hobbiesForUsers', () => {
    it('groups hobbies by user in one query', () => {
      const result = hobbiesForUsers(db, [1, 3, 12]);
      expect(result.get(1)).toEqual(['Chess', 'Reading']);
      expect(result.get(3)).toEqual(['Chess', 'Reading', 'Sailing']);
      expect(result.get(12)).toHaveLength(10);
    });

    it('omits a user with no hobbies rather than inventing an entry', () => {
      const result = hobbiesForUsers(db, [1, 4]);
      expect(result.has(4)).toBe(false);
    });

    it('returns an empty map for no ids', () => {
      expect(hobbiesForUsers(db, []).size).toBe(0);
    });

    it('returns hobbies in a stable alphabetical order', () => {
      expect(hobbiesForUsers(db, [12]).get(12)).toEqual(
        [...(hobbiesForUsers(db, [12]).get(12) ?? [])].sort(),
      );
    });
  });

  describe('facets', () => {
    it('counts every hobby over the whole set', () => {
      const facets = topHobbies(db, filters(), FACET_LIMIT);
      expect(Object.fromEntries(facets.map((f) => [f.value, f.count]))).toEqual(
        EXPECTED_HOBBY_COUNTS,
      );
    });

    it('counts every nationality over the whole set', () => {
      const facets = topNationalities(db, filters(), FACET_LIMIT);
      expect(Object.fromEntries(facets.map((f) => [f.value, f.count]))).toEqual(
        EXPECTED_NATIONALITY_COUNTS,
      );
    });

    it('orders by count descending, then value ascending', () => {
      // American and British both have 4, Dutch and Finnish both have 1, so the
      // alphabetical tie-break is what keeps the sidebar from reshuffling.
      expect(topNationalities(db, filters(), FACET_LIMIT).map((f) => f.value)).toEqual([
        'American',
        'British',
        'Danish',
        'Dutch',
        'Finnish',
      ]);
      expect(topHobbies(db, filters(), FACET_LIMIT).map((f) => f.value)).toEqual([
        'Chess',
        'Reading',
        'Running',
        'Writing',
        'Sailing',
        'Baking',
        'Cooking',
        'Hiking',
        'Painting',
        'Yoga',
      ]);
    });

    it('truncates to the requested limit', () => {
      expect(topHobbies(db, filters(), 3).map((f) => f.value)).toEqual([
        'Chess',
        'Reading',
        'Running',
      ]);
    });

    it('reflects the active filters rather than the whole dataset', () => {
      // British users are 1, 2, 8, 9 — between them Chess, Reading and Running
      // appear twice each.
      const facets = topHobbies(db, filters({ nationality: ['British'] }), FACET_LIMIT);
      expect(Object.fromEntries(facets.map((f) => [f.value, f.count]))).toEqual({
        Chess: 2,
        Reading: 2,
        Running: 2,
      });
    });

    it('reflects the text filter', () => {
      const facets = topNationalities(db, filters({ q: 'ada' }), FACET_LIMIT);
      expect(facets).toEqual([{ value: 'British', count: 2 }]);
    });

    it('applies a selected nationality to its own facet (spec-literal)', () => {
      // The brief asks for counts over the current result set, so selecting a
      // nationality leaves only that nationality in the group. The client keeps
      // selected values visible separately so they remain removable.
      const facets = topNationalities(db, filters({ nationality: ['Danish'] }), FACET_LIMIT);
      expect(facets).toEqual([{ value: 'Danish', count: 2 }]);
    });

    it('counts a facet value consistently with the result total', () => {
      const facets = topNationalities(db, filters({ hobby: ['Chess'] }), FACET_LIMIT);
      const total = countUsers(db, filters({ hobby: ['Chess'] }));
      expect(facets.reduce((sum, f) => sum + f.count, 0)).toBe(total);
    });

    it('gives identical hobby counts whether or not the users join is taken', () => {
      // topHobbies skips the users join when nothing is filtered, which is a
      // large performance win but a behavioural risk. Selecting every
      // nationality matches everybody while forcing the joined path, so the two
      // branches must agree exactly.
      const viaFastPath = topHobbies(db, filters(), FACET_LIMIT);
      const viaJoin = topHobbies(
        db,
        filters({ nationality: [...FIXTURE_NATIONALITIES] }),
        FACET_LIMIT,
      );
      expect(viaJoin).toEqual(viaFastPath);
    });

    it('returns empty groups when nothing matches', () => {
      expect(topHobbies(db, filters({ q: 'zzzz' }), FACET_LIMIT)).toEqual([]);
      expect(topNationalities(db, filters({ q: 'zzzz' }), FACET_LIMIT)).toEqual([]);
    });
  });
});
