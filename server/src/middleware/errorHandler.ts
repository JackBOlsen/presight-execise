import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config.js';
import { ApiError, notFound } from '../errors.js';

/**
 * Every failure leaves the API in the same shape — `{ error: { code, message,
 * details? } }` — so the client can handle one error contract rather than
 * guessing from the status code alone.
 */

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route matches ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    });
    return;
  }

  // Anything reaching here is a bug rather than a rejected request, so it is
  // logged in full but reported generically: an unexpected message can carry
  // SQL fragments or file paths that should not leave the server. The real
  // message is included outside production, where the reader is the developer.
  console.error('Unhandled error:', error);

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: config.isProduction
        ? 'An unexpected error occurred.'
        : error instanceof Error
          ? error.message
          : String(error),
    },
  });
};
