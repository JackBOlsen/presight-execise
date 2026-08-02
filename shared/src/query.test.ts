import { describe, expect, it } from 'vitest';
import { FacetsQuerySchema, UsersQuerySchema } from './query.js';

/**
 * Request validation is strict on purpose: anything the server cannot make
 * sense of is a 400 rather than a silent fallback, because a request that
 * quietly ignored `sort=email` would return correct-looking but wrong data.
 */
describe('UsersQuerySchema', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(UsersQuerySchema.parse({})).toEqual({
      q: '',
      nationality: [],
      hobby: [],
      sort: 'last_name',
      order: 'asc',
      limit: 30,
    });
  });

  describe('repeated parameters', () => {
    it('accepts a bare string when the parameter appears once', () => {
      expect(UsersQuerySchema.parse({ hobby: 'Chess' }).hobby).toEqual(['Chess']);
    });

    it('accepts an array when it appears several times', () => {
      expect(UsersQuerySchema.parse({ hobby: ['Chess', 'Yoga'] }).hobby).toEqual(['Chess', 'Yoga']);
    });

    it('trims values and drops blanks', () => {
      expect(UsersQuerySchema.parse({ hobby: ['  Chess  ', '', '   '] }).hobby).toEqual(['Chess']);
    });

    it('de-duplicates', () => {
      // Load-bearing rather than cosmetic: the match-all-hobbies query compares
      // a row count against the number of requested hobbies, so a repeated
      // value would raise the target above what any user could reach.
      expect(UsersQuerySchema.parse({ hobby: ['Chess', 'Chess', ' Chess '] }).hobby).toEqual([
        'Chess',
      ]);
    });

    it('rejects an absurdly long filter list', () => {
      const many = Array.from({ length: 200 }, (_, i) => `Hobby${i}`);
      expect(UsersQuerySchema.safeParse({ hobby: many }).success).toBe(false);
    });
  });

  describe('sort', () => {
    it.each(['first_name', 'last_name', 'age', 'nationality'])('accepts %s', (sort) => {
      expect(UsersQuerySchema.parse({ sort }).sort).toBe(sort);
    });

    it.each([
      ['an unknown column', 'email'],
      ['SQL', 'age; DROP TABLE users'],
      ['a qualified column', 'users.age'],
      ['an empty value', ''],
    ])('rejects %s', (_label, sort) => {
      // This allow-list is the only thing standing between the query string and
      // the ORDER BY clause.
      expect(UsersQuerySchema.safeParse({ sort }).success).toBe(false);
    });
  });

  describe('limit', () => {
    it('coerces from its query-string form', () => {
      expect(UsersQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    });

    it.each([
      ['above the cap', '5000'],
      ['zero', '0'],
      ['negative', '-1'],
      ['fractional', '10.5'],
      ['not a number', 'abc'],
    ])('rejects %s', (_label, limit) => {
      expect(UsersQuerySchema.safeParse({ limit }).success).toBe(false);
    });

    it('accepts the boundaries', () => {
      expect(UsersQuerySchema.parse({ limit: '1' }).limit).toBe(1);
      expect(UsersQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    });
  });

  it('rejects an unknown order', () => {
    expect(UsersQuerySchema.safeParse({ order: 'sideways' }).success).toBe(false);
  });

  it('trims and caps the text filter', () => {
    expect(UsersQuerySchema.parse({ q: '  ada  ' }).q).toBe('ada');
    expect(UsersQuerySchema.safeParse({ q: 'a'.repeat(500) }).success).toBe(false);
  });

  it('treats an absent cursor as absent rather than empty', () => {
    expect(UsersQuerySchema.parse({}).cursor).toBeUndefined();
    expect(UsersQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('FacetsQuerySchema', () => {
  it('accepts the same filters as the list endpoint', () => {
    expect(FacetsQuerySchema.parse({ q: 'ada', hobby: 'Chess', nationality: ['Danish'] })).toEqual({
      q: 'ada',
      hobby: ['Chess'],
      nationality: ['Danish'],
    });
  });

  it('carries no sort or paging, which facets do not depend on', () => {
    const parsed = FacetsQuerySchema.parse({ sort: 'age', limit: '5', cursor: 'abc' });
    expect(parsed).not.toHaveProperty('sort');
    expect(parsed).not.toHaveProperty('limit');
    expect(parsed).not.toHaveProperty('cursor');
  });
});
