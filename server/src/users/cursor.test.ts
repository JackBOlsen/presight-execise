import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/**
 * Cursors are the mechanism that makes paging immune to duplicates and gaps, so
 * the interesting cases are the ones where a cursor is not what it claims.
 */
describe('cursor', () => {
  it('round-trips a string sort value', () => {
    const cursor = encodeCursor('Lovelace', 42, 'last_name', 'asc');
    expect(decodeCursor(cursor, 'last_name', 'asc')).toEqual({ value: 'Lovelace', id: 42 });
  });

  it('round-trips a numeric sort value', () => {
    const cursor = encodeCursor(36, 7, 'age', 'desc');
    expect(decodeCursor(cursor, 'age', 'desc')).toEqual({ value: 36, id: 7 });
  });

  it('is opaque and URL-safe', () => {
    // Encoded rather than plain so clients do not start constructing their own,
    // and base64url so it needs no escaping in a query string.
    const cursor = encodeCursor('Ann O’Neill & Co', 1, 'last_name', 'asc');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(cursor)).toBe(cursor);
  });

  describe('rejects a cursor that does not belong to the request', () => {
    it('when the sort field changed', () => {
      // The dangerous case: seeking to a position in an ordering that no longer
      // exists would silently skip and repeat users rather than fail.
      const cursor = encodeCursor('Lovelace', 42, 'last_name', 'asc');
      expect(() => decodeCursor(cursor, 'age', 'asc')).toThrow(ApiError);
      try {
        decodeCursor(cursor, 'age', 'asc');
      } catch (error) {
        expect((error as ApiError).code).toBe('cursor_sort_mismatch');
        expect((error as ApiError).status).toBe(400);
      }
    });

    it('when only the direction changed', () => {
      const cursor = encodeCursor('Lovelace', 42, 'last_name', 'asc');
      expect(() => decodeCursor(cursor, 'last_name', 'desc')).toThrow(/cursor was issued/);
    });

    it('when the value type does not match the sort field', () => {
      // A string compared against a numeric column would not error in SQLite —
      // it would apply type-ordering rules and quietly return the wrong rows.
      const forged = Buffer.from(
        JSON.stringify({ v: 'thirty-six', id: 1, s: 'age', o: 'asc' }),
      ).toString('base64url');
      expect(() => decodeCursor(forged, 'age', 'asc')).toThrow(/does not match sort=age/);
    });
  });

  describe('rejects malformed input', () => {
    it.each([
      ['not base64 at all', 'not-a-cursor!!'],
      ['base64 of non-JSON', Buffer.from('hello').toString('base64url')],
      ['JSON of the wrong shape', Buffer.from(JSON.stringify({ nope: 1 })).toString('base64url')],
      [
        'a missing id',
        Buffer.from(JSON.stringify({ v: 'a', s: 'age', o: 'asc' })).toString('base64url'),
      ],
      [
        'a negative id',
        Buffer.from(JSON.stringify({ v: 'a', id: -1, s: 'last_name', o: 'asc' })).toString(
          'base64url',
        ),
      ],
      [
        'an unknown sort field',
        Buffer.from(JSON.stringify({ v: 'a', id: 1, s: 'email', o: 'asc' })).toString('base64url'),
      ],
      ['an empty string', ''],
    ])('%s', (_label, raw) => {
      expect(() => decodeCursor(raw, 'last_name', 'asc')).toThrow(ApiError);
    });
  });
});
