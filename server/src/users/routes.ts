import { Router } from 'express';
import { FacetsQuerySchema, UsersQuerySchema } from 'presight-shared';
import type { ZodError } from 'zod';
import type { Database } from '../db/connection.js';
import { badRequest } from '../errors.js';
import * as service from './service.js';

/**
 * HTTP layer. Its only jobs are to validate the request and serialise the
 * result — no SQL, no mapping, no business rules.
 */

/** Surface which parameter was wrong, rather than a bare "bad request". */
function describeIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function createApiRouter(db: Database): Router {
  const router = Router();

  router.get('/users', (req, res) => {
    const parsed = UsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest(
        'invalid_query',
        'One or more query parameters are invalid.',
        describeIssues(parsed.error),
      );
    }
    res.json(service.listUsers(db, parsed.data));
  });

  router.get('/facets', (req, res) => {
    // Same filters as /users, minus sort and paging — facets do not depend on
    // either, so scrolling and re-sorting never recompute them.
    const parsed = FacetsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest(
        'invalid_query',
        'One or more query parameters are invalid.',
        describeIssues(parsed.error),
      );
    }
    res.json(service.getFacets(db, parsed.data));
  });

  return router;
}
