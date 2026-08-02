import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsersResponseSchema, FacetsResponseSchema, type UsersQuery } from 'presight-shared';
import type { Database } from '../db/connection.js';
import { FIXTURE_USERS, NO_FILTERS, createFixtureDatabase } from '../test/fixture.js';
import { getFacets, listUsers } from './service.js';

/**
 * The mapping boundary: stored rows in, contract shapes out.
 *
 * What matters here is that the storage model does not leak — no foreign keys,
 * no separate hobby rows — and that the paging metadata a client depends on is
 * assembled correctly.
 */
describe('service', () => {
  let db: Database;

  beforeEach(() => {
    db = createFixtureDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const query = (overrides: Partial<UsersQuery> = {}): UsersQuery => ({
    ...NO_FILTERS,
    sort: 'last_name',
    order: 'asc',
    limit: 30,
    ...overrides,
  });

  describe('response shape', () => {
    it('exposes exactly the contract fields', () => {
      const { data } = listUsers(db, query());
      expect(Object.keys(data[0]!).sort()).toEqual([
        'age',
        'avatar',
        'first_name',
        'hobbies',
        'id',
        'last_name',
        'nationality',
      ]);
    });

    it('does not leak the nationality foreign key', () => {
      const { data } = listUsers(db, query());
      for (const user of data) {
        expect(user).not.toHaveProperty('nationality_id');
        expect(typeof user.nationality).toBe('string');
      }
    });

    it('inlines hobbies as an array', () => {
      const { data } = listUsers(db, query({ limit: 100 }));
      const ada = data.find((u) => u.id === 1)!;
      expect(ada.hobbies).toEqual(['Chess', 'Reading']);
    });

    it('gives a user with no hobbies an empty array rather than null', () => {
      // The card renders `hobbies.length`, so an absent junction row must not
      // become a missing property.
      const { data } = listUsers(db, query({ limit: 100 }));
      expect(data.find((u) => u.id === 4)!.hobbies).toEqual([]);
    });

    it('never exceeds ten hobbies', () => {
      const { data } = listUsers(db, query({ limit: 100 }));
      for (const user of data) expect(user.hobbies.length).toBeLessThanOrEqual(10);
      expect(data.find((u) => u.id === 12)!.hobbies).toHaveLength(10);
    });

    it('satisfies the shared response schema', () => {
      // The same schema the client validates against, so a mapping change that
      // breaks the contract fails here rather than in the browser.
      expect(UsersResponseSchema.safeParse(listUsers(db, query())).success).toBe(true);
    });
  });

  describe('pagination metadata', () => {
    it('reports the filtered total, not the page size', () => {
      expect(listUsers(db, query({ limit: 5 })).total).toBe(FIXTURE_USERS.length);
      expect(listUsers(db, query({ hobby: ['Chess'], limit: 2 })).total).toBe(7);
    });

    it('omits a cursor on the final page', () => {
      const result = listUsers(db, query({ limit: 100 }));
      expect(result.pageInfo.hasMore).toBe(false);
      expect(result.pageInfo.nextCursor).toBeNull();
    });

    it('issues a cursor while more remain', () => {
      const result = listUsers(db, query({ limit: 5 }));
      expect(result.pageInfo.hasMore).toBe(true);
      expect(typeof result.pageInfo.nextCursor).toBe('string');
    });

    it('advances to the next page without repeating or skipping', () => {
      const first = listUsers(db, query({ limit: 5, sort: 'age' }));
      const second = listUsers(
        db,
        query({ limit: 5, sort: 'age', cursor: first.pageInfo.nextCursor! }),
      );
      const third = listUsers(
        db,
        query({ limit: 5, sort: 'age', cursor: second.pageInfo.nextCursor! }),
      );

      const seen = [...first.data, ...second.data, ...third.data].map((u) => u.id);
      expect(new Set(seen).size).toBe(FIXTURE_USERS.length);
      expect(seen).toEqual(listUsers(db, query({ limit: 100, sort: 'age' })).data.map((u) => u.id));
      expect(third.pageInfo.hasMore).toBe(false);
    });

    it('issues a cursor carrying the active sort value', () => {
      // Sorting by nationality must encode the nationality, not the surname,
      // or the next page seeks into the wrong ordering.
      const byNationality = listUsers(db, query({ limit: 3, sort: 'nationality' }));
      const next = listUsers(
        db,
        query({ limit: 3, sort: 'nationality', cursor: byNationality.pageInfo.nextCursor! }),
      );
      expect(next.data.map((u) => u.id)).toEqual([7, 1, 2]);
    });

    it.each(['first_name', 'last_name'] as const)(
      'encodes the %s value when that is the active sort',
      (sort) => {
        // Each sort must put its own column in the cursor; encoding the wrong
        // one would seek into a different ordering entirely.
        const first = listUsers(db, query({ limit: 4, sort }));
        const second = listUsers(db, query({ limit: 4, sort, cursor: first.pageInfo.nextCursor! }));
        const whole = listUsers(db, query({ limit: 100, sort })).data.map((u) => u.id);

        expect([...first.data, ...second.data].map((u) => u.id)).toEqual(whole.slice(0, 8));
      },
    );

    it('returns a well-formed empty result', () => {
      const result = listUsers(db, query({ q: 'zzzz' }));
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    });
  });

  describe('facets', () => {
    it('returns both groups', () => {
      const facets = getFacets(db, NO_FILTERS);
      expect(facets.hobbies.length).toBeGreaterThan(0);
      expect(facets.nationalities.length).toBeGreaterThan(0);
      expect(FacetsResponseSchema.safeParse(facets).success).toBe(true);
    });

    it('shapes each entry as { value, count }', () => {
      const facets = getFacets(db, NO_FILTERS);
      expect(Object.keys(facets.hobbies[0]!).sort()).toEqual(['count', 'value']);
    });

    it('changes when the filters change', () => {
      const all = getFacets(db, NO_FILTERS);
      const british = getFacets(db, { ...NO_FILTERS, nationality: ['British'] });
      expect(british.hobbies).not.toEqual(all.hobbies);
      expect(british.nationalities).toEqual([{ value: 'British', count: 4 }]);
    });
  });
});
