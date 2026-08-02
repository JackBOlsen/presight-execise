/**
 * Errors that carry the HTTP status and machine-readable code the API promises.
 *
 * Anything thrown that is not an `ApiError` is treated as a bug: the error
 * handler reports it as a 500 and does not leak its message to the client,
 * because an unexpected message can contain SQL fragments or file paths.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: unknown): ApiError {
  return new ApiError(400, code, message, details);
}

export function notFound(message = 'Resource not found.'): ApiError {
  return new ApiError(404, 'not_found', message);
}
