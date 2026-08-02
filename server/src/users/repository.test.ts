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
    it('matches a first name, ignoring case', () => {
      expect(idsFor(filters({ q: 'ada' })).sort()).toEqual([1, 8]);
      expect(idsFor(filters({ q: 'ADA' })).sort()).toEqual([1, 8]);
      expect(idsFor(filters({ q: 'AdA' })).sort()).toEqual([1, 8]);
    });

    it('matches a last name too', () => {
      // Zed Aardvark matches on surname alone.
      expect(idsFor(filters({ q: 'aard' }))).toEqual([12]);
    });

    it('matches anywhere in a name, not only at the start', () => {
      // The whole point of the substring filter. "ing" appears in the middle of
      // Turing; anchoring at the start would find nobody, which is exactly how
      // a search for "son" used to miss every Johnson and Anderson.
      expect(idsFor(filters({ q: 'ing' }))).toEqual([2]);
      expect(idsFor(filters({ q: 'opp' }))).toEqual([3]);
      // The tail of a surname, which a prefix match can never reach.
      expect(idsFor(filters({ q: 'vark' }))).toEqual([12]);
    });

    it('searches both name parts at once', () => {
      // Everyone with an "a" anywhere in either name — which is everybody
      // except Tim Berners.
      expect(idsFor(filters({ q: 'a' })).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12,
      ]);
    });

    it('treats % as a literal character, not a wildcard', () => {
      // Per%y is the only name containing a literal %. Without escaping, the
      // pattern would collapse to "%%%" and match all twelve users, so the
      // single result is what proves the ESCAPE clause is doing its job.
      expect(idsFor(filters({ q: '%' }))).toEqual([11]);
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
      // An "e" anywhere in either name gives 1, 3, 5, 8, 9, 11, 12. Chess is
      // held by 1, 2, 3, 5, 7, 11, 12 — so the two together leave 1, 3, 5, 11,
      // 12, with the text filter genuinely excluding two Chess players rather
      // than being satisfied by everybody the hobby already matched.
      expect(idsFor(filters({ q: 'e', hobby: ['Chess'] })).sort((a, b) => a - b)).toEqual([
        1, 3, 5, 11, 12,
      ]);
      // British is 1, 2, 8, 9, so all three together leave only Ada Lovelace.
      expect(
        idsFor(filters({ q: 'e', hobby: ['Chess'], nationality: ['British'] })).sort(
          (a, b) => a - b,
        ),
      ).toEqual([1]);
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

    describe('the nationality group excludes its own filter', () => {
      it('keeps the other nationalities selectable', () => {
        // Nationalities combine with OR. Counting them within their own filter
        // would leave only the selected one in the group, so a second could
        // never be picked and the "match any of these" requirement would be
        // reachable only by editing the URL.
        const facets = topNationalities(db, filters({ nationality: ['Danish'] }), FACET_LIMIT);
        expect(facets.map((f) => f.value)).toEqual([
          'American',
          'British',
          'Danish',
          'Dutch',
          'Finnish',
        ]);
      });

      it('counts each nationality over the whole set, not the selection', () => {
        const withSelection = topNationalities(
          db,
          filters({ nationality: ['Danish'] }),
          FACET_LIMIT,
        );
        const without = topNationalities(db, filters(), FACET_LIMIT);
        expect(withSelection).toEqual(without);
      });

      it('lets a second nationality be added', () => {
        const facets = topNationalities(
          db,
          filters({ nationality: ['Danish', 'Dutch'] }),
          FACET_LIMIT,
        );
        expect(facets.map((f) => f.value)).toContain('British');
        // And the list itself does honour the OR: Danish (11, 12) plus Dutch (5).
        expect(idsFor(filters({ nationality: ['Danish', 'Dutch'] })).sort((a, b) => a - b)).toEqual(
          [5, 11, 12],
        );
      });

      it('still narrows by the text and hobby filters', () => {
        // Only its own filter is excluded; the others still apply, which is what
        // keeps the counts describing the set being browsed.
        expect(
          topNationalities(db, filters({ q: 'ada', nationality: ['Danish'] }), FACET_LIMIT),
        ).toEqual([{ value: 'British', count: 2 }]);

        expect(
          topNationalities(
            db,
            filters({ hobby: ['Sailing'], nationality: ['Danish'] }),
            FACET_LIMIT,
          ),
        ).toEqual([
          { value: 'American', count: 1 },
          { value: 'Danish', count: 1 },
        ]);
      });
    });

    it('keeps the hobby group narrowing, since hobbies combine with AND', () => {
      // The asymmetry is deliberate. Narrowing to Chess players and counting
      // their other hobbies is the useful question; doing the same for an OR
      // filter is a dead end.
      const all = topHobbies(db, filters(), FACET_LIMIT);
      const withChess = topHobbies(db, filters({ hobby: ['Chess'] }), FACET_LIMIT);
      expect(withChess).not.toEqual(all);
      expect(Object.fromEntries(withChess.map((f) => [f.value, f.count]))).toEqual({
        Chess: 7,
        Reading: 3,
        Writing: 2,
        Baking: 1,
        Cooking: 1,
        Hiking: 1,
        Painting: 1,
        Running: 2,
        Sailing: 2,
        Yoga: 1,
      });
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

    /**
     * Both facet queries take a second shape once a filter is active — the
     * counts are aggregated over a materialised set of matching rows rather than
     * by joining and testing the predicate per row. That is worth 6x and 5x
     * respectively now that the text filter scans, but it is a different query
     * producing a number nobody can eyeball, so both are pinned to counts
     * derived by hand from the fixture table.
     *
     * `q: 'a'` is chosen because it matches everyone except Tim Berners — a
     * single, traceable omission. He is the fixture's only other Runner, so
     * Running dropping from 4 to 3 is the assertion that proves the filter
     * reached the aggregate at all.
     */
    it('counts nationalities correctly on the filtered (materialised) path', () => {
      expect(topNationalities(db, filters({ q: 'a' }), FACET_LIMIT)).toEqual([
        { value: 'American', count: 4 },
        { value: 'British', count: 3 },
        { value: 'Danish', count: 2 },
        { value: 'Dutch', count: 1 },
        { value: 'Finnish', count: 1 },
      ]);
    });

    it('counts hobbies correctly on the filtered path', () => {
      expect(topHobbies(db, filters({ q: 'a' }), FACET_LIMIT)).toEqual([
        { value: 'Chess', count: 7 },
        { value: 'Reading', count: 5 },
        { value: 'Running', count: 3 },
        { value: 'Writing', count: 3 },
        { value: 'Sailing', count: 2 },
        { value: 'Baking', count: 1 },
        { value: 'Cooking', count: 1 },
        { value: 'Hiking', count: 1 },
        { value: 'Painting', count: 1 },
        { value: 'Yoga', count: 1 },
      ]);
    });

    it('returns empty groups when nothing matches', () => {
      expect(topHobbies(db, filters({ q: 'zzzz' }), FACET_LIMIT)).toEqual([]);
      expect(topNationalities(db, filters({ q: 'zzzz' }), FACET_LIMIT)).toEqual([]);
    });
  });
});
