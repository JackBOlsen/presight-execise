import { ApiErrorResponseSchema } from 'presight-shared';
import type { ZodType } from 'zod';

/**
 * The HTTP boundary.
 *
 * Every response is validated against the shared schema before it reaches
 * React. The client genuinely cannot trust what comes back — a stale deployed
 * server, a proxy misconfiguration returning HTML, a gateway answering 200 with
 * an error body — and failing loudly here beats `hobbies.map is not a function`
 * thrown deep inside a virtualised row, where the stack says nothing useful.
 */

export type ApiErrorKind = 'network' | 'http' | 'contract';

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { kind: ApiErrorKind; status?: number; code?: string; cause?: unknown },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ApiClientError';
    this.kind = options.kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
  }

  /**
   * Whether retrying could plausibly succeed. A rejected query string will fail
   * identically forever, so the error UI should not invite a pointless retry.
   */
  get isRetryable(): boolean {
    if (this.kind === 'network') return true;
    if (this.status === undefined) return false;
    return this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init: { signal?: AbortSignal | undefined } = {},
): Promise<T> {
  // A request that never settles would leave the UI in a permanent loading
  // state, which reads as a frozen page rather than as a failure.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    // Let a caller-initiated cancellation propagate untouched: React Query
    // aborts superseded requests constantly, and those are not failures.
    if (init.signal?.aborted) throw error;
    throw new ApiClientError('Could not reach the server.', { kind: 'network', cause: error });
  }

  if (!response.ok) {
    throw new ApiClientError(await describeFailure(response), {
      kind: 'http',
      status: response.status,
      code: await extractCode(response),
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiClientError('The server returned a response that was not JSON.', {
      kind: 'contract',
      status: response.status,
      cause: error,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // Logged in full because the message shown to a user cannot usefully
    // describe a schema mismatch, but a developer needs the detail.
    console.error(`Response from ${path} did not match the expected shape`, parsed.error.issues);
    throw new ApiClientError('The server returned unexpected data.', {
      kind: 'contract',
      status: response.status,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

/** Bodies are read once, so both helpers work from a cached clone. */
const failureBodies = new WeakMap<Response, unknown>();

async function readBody(response: Response): Promise<unknown> {
  if (failureBodies.has(response)) return failureBodies.get(response);
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }
  failureBodies.set(response, body);
  return body;
}

async function describeFailure(response: Response): Promise<string> {
  const parsed = ApiErrorResponseSchema.safeParse(await readBody(response));
  if (parsed.success) return parsed.data.error.message;
  if (response.status >= 500) return 'The server ran into a problem.';
  return `Request failed with status ${response.status}.`;
}

async function extractCode(response: Response): Promise<string | undefined> {
  const parsed = ApiErrorResponseSchema.safeParse(await readBody(response));
  return parsed.success ? parsed.data.error.code : undefined;
}
