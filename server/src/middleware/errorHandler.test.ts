import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, badRequest, notFound } from '../errors.js';
import { errorHandler, notFoundHandler } from './errorHandler.js';

type Handlers = { errorHandler: typeof errorHandler; notFoundHandler: typeof notFoundHandler };

/**
 * How the API behaves when something goes wrong that nobody planned for.
 *
 * The security-relevant case is the last one: an unexpected error's message can
 * contain SQL fragments, file paths or connection details, so it must not be
 * echoed back to a client in production.
 */
describe('errorHandler', () => {
  beforeEach(() => {
    // The handler logs every unexpected error; keep that out of the test output.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * An app whose single route throws whatever the test supplies.
   *
   * Uses the statically imported handlers by default. That matters: the
   * handler recognises an `ApiError` with `instanceof`, and a dynamically
   * re-imported module would carry a *different* class of the same name, so
   * the check would silently fail and every error would look like a 500.
   */
  function appThrowing(
    error: unknown,
    handlers: Handlers = { errorHandler, notFoundHandler },
  ): Express {
    const app = express();
    app.get('/boom', () => {
      throw error;
    });
    app.use(handlers.notFoundHandler);
    app.use(handlers.errorHandler);
    return app;
  }

  it('reports an ApiError with its own status and code', async () => {
    const app = appThrowing(badRequest('invalid_query', 'Bad parameter.', [{ path: 'limit' }]));
    const { body } = await request(app).get('/boom').expect(400);
    expect(body).toEqual({
      error: { code: 'invalid_query', message: 'Bad parameter.', details: [{ path: 'limit' }] },
    });
  });

  it('omits details when there are none', async () => {
    const app = appThrowing(notFound('Nothing here.'));
    const { body } = await request(app).get('/boom').expect(404);
    expect(body.error).toEqual({ code: 'not_found', message: 'Nothing here.' });
    expect(body.error).not.toHaveProperty('details');
  });

  it('honours a custom status', async () => {
    const app = appThrowing(new ApiError(418, 'teapot', 'No coffee.'));
    await request(app).get('/boom').expect(418);
  });

  it('turns an unexpected error into a 500', async () => {
    const app = appThrowing(new Error('kaboom'));
    const { body } = await request(app).get('/boom').expect(500);
    expect(body.error.code).toBe('internal_error');
  });

  it('surfaces the real message outside production, where the reader is a developer', async () => {
    const app = appThrowing(new Error('kaboom'));
    const { body } = await request(app).get('/boom').expect(500);
    expect(body.error.message).toBe('kaboom');
  });

  it('withholds the real message in production', async () => {
    // An unexpected message can carry SQL fragments or file paths.
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    // Reloaded so config re-reads NODE_ENV. Safe here specifically because this
    // case throws a plain Error, so no `instanceof ApiError` check is involved.
    const production = (await import('./errorHandler.js')) as Handlers;

    const app = appThrowing(
      new Error('SQLITE_ERROR: no such column: secret in /srv/app/data/users.db'),
      production,
    );
    const { body } = await request(app).get('/boom').expect(500);

    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(body.error.message).not.toMatch(/SQLITE|secret|srv/);
  });

  it('logs the unexpected error in full regardless', async () => {
    const app = appThrowing(new Error('kaboom'));
    await request(app).get('/boom').expect(500);
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
  });

  it('handles a thrown non-Error value', async () => {
    const app = appThrowing('just a string');
    const { body } = await request(app).get('/boom').expect(500);
    expect(body.error.code).toBe('internal_error');
  });

  it('answers an unmatched route with the same error contract', async () => {
    const app = appThrowing(new Error('unused'));
    const { body } = await request(app).get('/no-such-route').expect(404);
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('/no-such-route');
  });
});
