import express, { type Express } from 'express';
import { HealthResponseSchema } from 'presight-shared';
import type { Database } from './db/connection.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { countAllUsers } from './users/repository.js';
import { createApiRouter } from './users/routes.js';

/**
 * Builds the Express application.
 *
 * A factory taking the database rather than a module that opens its own
 * connection and starts listening: the tests construct an app over a disposable
 * in-memory database and drive it directly, with no port and no global state.
 *
 * There is deliberately no CORS middleware. The client is same-origin in both
 * environments — Vite proxies `/api` in development, nginx proxies it in the
 * container — so a permissive cross-origin policy would widen the surface
 * without enabling anything the application needs.
 */
export function createApp(db: Database): Express {
  const app = express();

  // Removes the framework fingerprint from every response.
  app.disable('x-powered-by');

  /**
   * Liveness plus a real read, so the container is only reported healthy once
   * the database is actually queryable — not merely once the process is up.
   */
  app.get('/api/health', (_req, res) => {
    res.json(HealthResponseSchema.parse({ status: 'ok', users: countAllUsers(db) }));
  });

  app.use('/api', createApiRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
