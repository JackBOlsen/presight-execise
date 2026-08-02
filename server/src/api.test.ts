import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Database } from './db/connection.js';
import { FIXTURE_USERS, createFixtureDatabase } from './test/fixture.js';

/**
 * End-to-end through the HTTP layer.
 *
 * The app is built over a disposable in-memory database, so these run with no
 * port, no seeded file and no shared state — while still exercising real
 * routing, real query-string parsing and the real error contract.
 */
describe('API', () => {
  let db: Database;
  let app: Express;

  beforeEach(() => {
    db = createFixtureDatabase();
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /api/health', () => {
    it('reports ok with a real row count', () => {
      // Counting proves the database is queryable, not merely that the process
      // is up — which is what makes it usable as a container healthcheck.
      return request(app)
        .get('/api/health')
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ status: 'ok', users: FIXTURE_USERS.length });
        });
    });
  });

  describe('GET /api/users', () => {
    it('returns a page with metadata', async () => {
      const { body } = await request(app).get('/api/users?limit=5').expect(200);
      expect(body.data).toHaveLength(5);
      expect(body.total).toBe(FIXTURE_USERS.length);
      expect(body.pageInfo.hasMore).toBe(true);
    });

    it('accepts a repeated parameter as multiple values', async () => {
      // ?hobby=Chess&hobby=Reading must mean both, not the last one.
      const { body } = await request(app)
        .get('/api/users?hobby=Chess&hobby=Reading&limit=50')
        .expect(200);
      expect(
        body.data.map((u: { id: number }) => u.id).sort((a: number, b: number) => a - b),
      ).toEqual([1, 3, 12]);
    });

    it('accepts a single occurrence of the same parameter', async () => {
      const { body } = await request(app).get('/api/users?hobby=Chess&limit=50').expect(200);
      expect(body.total).toBe(7);
    });

    it('applies sort and order', async () => {
      const { body } = await request(app).get('/api/users?sort=age&order=desc&limit=3').expect(200);
      expect(body.data.map((u: { age: number }) => u.age)).toEqual([92, 86, 83]);
    });

    it('pages through the whole set over HTTP without duplicates', async () => {
      const seen: number[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const url: string = `/api/users?sort=nationality&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const { body } = await request(app).get(url).expect(200);
        seen.push(...body.data.map((u: { id: number }) => u.id));
        if (!body.pageInfo.hasMore) break;
        cursor = body.pageInfo.nextCursor;
      }
      expect(new Set(seen).size).toBe(FIXTURE_USERS.length);
      expect(seen).toEqual([3, 4, 6, 7, 1, 2, 8, 9, 11, 12, 5, 10]);
    });

    it('escapes a literal wildcard in the text filter', async () => {
      const { body } = await request(app).get('/api/users?q=%25').expect(200);
      expect(body.total).toBe(0);
    });
  });

  describe('GET /api/facets', () => {
    it('returns both groups shaped as { value, count }', async () => {
      const { body } = await request(app).get('/api/facets').expect(200);
      expect(body.hobbies[0]).toEqual({ value: 'Chess', count: 7 });
      expect(body.nationalities[0]).toEqual({ value: 'American', count: 4 });
    });

    it('reflects the active filters', async () => {
      const { body } = await request(app).get('/api/facets?nationality=British').expect(200);
      expect(body.nationalities).toEqual([{ value: 'British', count: 4 }]);
    });

    it('validates its own parameters', async () => {
      const { body } = await request(app)
        .get(`/api/facets?q=${'a'.repeat(500)}`)
        .expect(400);
      expect(body.error.code).toBe('invalid_query');
    });

    it('ignores sort and paging parameters', async () => {
      // Facets describe which users match, not the order they are read in.
      const plain = await request(app).get('/api/facets?q=ada').expect(200);
      const sorted = await request(app)
        .get('/api/facets?q=ada&sort=age&order=desc&limit=1')
        .expect(200);
      expect(sorted.body).toEqual(plain.body);
    });
  });

  describe('error contract', () => {
    it.each([
      ['unknown sort field', '/api/users?sort=email', 400, 'invalid_query'],
      [
        'SQL in the sort field',
        '/api/users?sort=age%3B%20DROP%20TABLE%20users',
        400,
        'invalid_query',
      ],
      ['limit above the cap', '/api/users?limit=5000', 400, 'invalid_query'],
      ['limit below the floor', '/api/users?limit=0', 400, 'invalid_query'],
      ['non-numeric limit', '/api/users?limit=abc', 400, 'invalid_query'],
      ['unknown order', '/api/users?order=sideways', 400, 'invalid_query'],
      ['malformed cursor', '/api/users?cursor=nonsense', 400, 'invalid_cursor'],
      ['unknown route', '/api/nope', 404, 'not_found'],
    ])('%s -> %i', async (_label, url, status, code) => {
      const { body } = await request(app).get(url).expect(status);
      expect(body.error.code).toBe(code);
      expect(typeof body.error.message).toBe('string');
    });

    it('names the offending parameter', async () => {
      const { body } = await request(app).get('/api/users?limit=5000').expect(400);
      expect(body.error.details).toEqual([expect.objectContaining({ path: 'limit' })]);
    });

    it('rejects a cursor issued for a different sort', async () => {
      const first = await request(app).get('/api/users?sort=age&limit=3').expect(200);
      const { body } = await request(app)
        .get(
          `/api/users?sort=last_name&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`,
        )
        .expect(400);
      expect(body.error.code).toBe('cursor_sort_mismatch');
    });

    it('leaves the data intact after an injection attempt', async () => {
      await request(app).get('/api/users?sort=age%3B%20DROP%20TABLE%20users').expect(400);
      await request(app)
        .get("/api/users?nationality=British'%3B%20DROP%20TABLE%20users%3B--")
        .expect(200);
      const { body } = await request(app).get('/api/health').expect(200);
      expect(body.users).toBe(FIXTURE_USERS.length);
    });

    it('does not advertise the framework', async () => {
      const response = await request(app).get('/api/health').expect(200);
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });
});
