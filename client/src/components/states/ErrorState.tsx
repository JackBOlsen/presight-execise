import { ApiClientError } from '../../api/client';

/**
 * Shown when the list could not be loaded.
 *
 * Visually distinct from the empty state, because the two mean opposite things:
 * "there is nobody" is an answer, while "we could not ask" is a failure. Making
 * them look alike teaches users to read a broken app as an empty one.
 *
 * Retry is offered only when retrying could plausibly work. A rejected query
 * string fails identically every time, so a retry button there is a false
 * promise.
 */
interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message =
    error instanceof Error ? error.message : 'Something went wrong loading the directory.';
  const canRetry = !(error instanceof ApiClientError) || error.isRetryable;

  return (
    <div className="border-danger-soft bg-danger-soft rounded-card flex flex-col items-center border px-6 py-16 text-center">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="text-danger mb-4 h-12 w-12"
      >
        <path
          d="M24 8 4 42h40L24 8Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M24 20v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="35.5" r="1.75" fill="currentColor" />
      </svg>

      <h2 className="text-text mb-1 text-base font-semibold">Could not load the directory</h2>

      <p className="text-danger-text mb-5 max-w-md text-sm">{message}</p>

      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-danger rounded-control px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
