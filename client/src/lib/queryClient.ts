import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client';

/**
 * Query defaults.
 *
 * The important one is the retry policy: a 400 from a rejected query string
 * will fail identically every time, so retrying it only delays the error the
 * user needs to see. Network blips and 5xx are worth another attempt.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError) return error.isRetryable && failureCount < 2;
          return failureCount < 2;
        },
        // The dataset is seeded and static, so refetching on every window focus
        // would be pure noise.
        refetchOnWindowFocus: false,
        staleTime: 60_000,
      },
    },
  });
}
