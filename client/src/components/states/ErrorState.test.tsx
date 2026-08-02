import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('shows the error message', () => {
    render(<ErrorState error={new Error('Could not reach the server.')} onRetry={() => {}} />);
    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument();
  });

  it('falls back to a readable message for a non-Error', () => {
    render(<ErrorState error="something odd" onRetry={() => {}} />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it('retries on request', async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new Error('boom')} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers a retry for a failure that might resolve itself', () => {
    const error = new ApiClientError('Could not reach the server.', { kind: 'network' });
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers a retry for a server error', () => {
    const error = new ApiClientError('The server ran into a problem.', {
      kind: 'http',
      status: 503,
    });
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('withholds retry when retrying cannot possibly help', () => {
    // A rejected query string fails identically every time, so a retry button
    // would be a false promise.
    const error = new ApiClientError('One or more query parameters are invalid.', {
      kind: 'http',
      status: 400,
      code: 'invalid_query',
    });
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('is distinguishable from the empty state', () => {
    // The two mean opposite things — "there is nobody" versus "we could not
    // ask" — and must not be mistaken for one another.
    render(<ErrorState error={new Error('boom')} onRetry={() => {}} />);
    expect(screen.getByText('Could not load the directory')).toBeInTheDocument();
    expect(screen.queryByText(/No people found/)).not.toBeInTheDocument();
  });
});
