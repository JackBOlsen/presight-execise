import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseSchema,
  FacetsResponseSchema,
  HealthResponseSchema,
  UserSchema,
  UsersResponseSchema,
} from './schemas.js';

/**
 * The response contract, which the client validates every payload against.
 *
 * These tests are mostly about what must be *rejected*: the point of validating
 * at the boundary is that version skew, a proxy returning HTML, or a 200
 * carrying an error body fail loudly instead of surfacing as
 * `hobbies.map is not a function` inside a virtualised row.
 */
const validUser = {
  id: 1,
  avatar: 'https://api.dicebear.com/9.x/notionists-neutral/svg?seed=1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  age: 36,
  nationality: 'British',
  hobbies: ['Chess', 'Reading'],
};

describe('UserSchema', () => {
  it('accepts a well-formed user', () => {
    expect(UserSchema.safeParse(validUser).success).toBe(true);
  });

  it('accepts a user with no hobbies', () => {
    expect(UserSchema.safeParse({ ...validUser, hobbies: [] }).success).toBe(true);
  });

  it('accepts a user with exactly ten hobbies', () => {
    const hobbies = Array.from({ length: 10 }, (_, i) => `Hobby ${i}`);
    expect(UserSchema.safeParse({ ...validUser, hobbies }).success).toBe(true);
  });

  it('rejects an eleventh hobby', () => {
    // Restates the domain rule at the boundary, so a mapping bug that
    // duplicated hobbies fails rather than skewing the facet counts.
    const hobbies = Array.from({ length: 11 }, (_, i) => `Hobby ${i}`);
    expect(UserSchema.safeParse({ ...validUser, hobbies }).success).toBe(false);
  });

  it('rejects a leaked foreign key in place of the nationality name', () => {
    const { nationality: _omitted, ...rest } = validUser;
    expect(UserSchema.safeParse({ ...rest, nationality_id: 3 }).success).toBe(false);
  });

  it.each([
    ['a missing field', { ...validUser, age: undefined }],
    ['a null hobbies array', { ...validUser, hobbies: null }],
    ['hobbies as a string', { ...validUser, hobbies: 'Chess' }],
    ['an age as a string', { ...validUser, age: '36' }],
    ['a negative age', { ...validUser, age: -1 }],
    ['a fractional id', { ...validUser, id: 1.5 }],
    ['an id of zero', { ...validUser, id: 0 }],
    ['an empty name', { ...validUser, first_name: '' }],
    ['a non-URL avatar', { ...validUser, avatar: 'not-a-url' }],
  ])('rejects %s', (_label, user) => {
    expect(UserSchema.safeParse(user).success).toBe(false);
  });
});

describe('UsersResponseSchema', () => {
  const valid = {
    data: [validUser],
    pageInfo: { nextCursor: 'eyJ2IjoiTG92ZWxhY2UiLCJpZCI6MX0', hasMore: true },
    total: 1234,
  };

  it('accepts a well-formed response', () => {
    expect(UsersResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null cursor on the final page', () => {
    const last = { ...valid, pageInfo: { nextCursor: null, hasMore: false } };
    expect(UsersResponseSchema.safeParse(last).success).toBe(true);
  });

  it('accepts an empty result set', () => {
    const empty = { data: [], pageInfo: { nextCursor: null, hasMore: false }, total: 0 };
    expect(UsersResponseSchema.safeParse(empty).success).toBe(true);
  });

  it.each([
    ['an HTML error page served as 200', '<!doctype html><html>Gateway error</html>'],
    ['an error body', { error: { code: 'oops', message: 'boom' } }],
    ['a bare array', [validUser]],
    ['missing pagination metadata', { data: [validUser], total: 1 }],
    ['a negative total', { ...valid, total: -1 }],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(UsersResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe('FacetsResponseSchema', () => {
  it('accepts up to twenty values per group', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}`, count: 20 - i }));
    expect(FacetsResponseSchema.safeParse({ hobbies: twenty, nationalities: [] }).success).toBe(
      true,
    );
  });

  it('rejects more than twenty', () => {
    const over = Array.from({ length: 21 }, (_, i) => ({ value: `v${i}`, count: 1 }));
    expect(FacetsResponseSchema.safeParse({ hobbies: over, nationalities: [] }).success).toBe(
      false,
    );
  });

  it('rejects a zero count, which would mean an entry nobody matches', () => {
    const zero = [{ value: 'Chess', count: 0 }];
    expect(FacetsResponseSchema.safeParse({ hobbies: zero, nationalities: [] }).success).toBe(
      false,
    );
  });

  it('requires both groups', () => {
    expect(FacetsResponseSchema.safeParse({ hobbies: [] }).success).toBe(false);
  });
});

describe('HealthResponseSchema and ApiErrorResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(HealthResponseSchema.safeParse({ status: 'ok', users: 50000 }).success).toBe(true);
  });

  it('rejects any status other than ok', () => {
    expect(HealthResponseSchema.safeParse({ status: 'degraded', users: 0 }).success).toBe(false);
  });

  it('accepts an error body with and without details', () => {
    expect(ApiErrorResponseSchema.safeParse({ error: { code: 'x', message: 'y' } }).success).toBe(
      true,
    );
    expect(
      ApiErrorResponseSchema.safeParse({ error: { code: 'x', message: 'y', details: [1, 2] } })
        .success,
    ).toBe(true);
  });

  it('rejects an error body missing its code', () => {
    expect(ApiErrorResponseSchema.safeParse({ error: { message: 'y' } }).success).toBe(false);
  });
});
