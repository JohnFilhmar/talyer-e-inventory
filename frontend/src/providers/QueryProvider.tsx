'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * A response the server has already decided about. Retrying one changes
 * nothing, and for 429 it actively makes things worse.
 *
 * A network failure has no `response` at all and is deliberately excluded, so
 * a dropped connection still gets its one retry.
 */
function isClientError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * QueryProvider component
 * 
 * Provides TanStack Query client to the entire application.
 * Configured with sensible defaults for caching and refetching.
 */
export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Create QueryClient instance inside component to avoid sharing state between requests
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't refetch on window focus in development
            refetchOnWindowFocus: process.env.NODE_ENV === 'production',
            // Retry once, but never a 4xx. A 404, 403 or 422 will fail again
            // identically, and retrying a 429 doubles the request rate against
            // the limiter that is already rejecting it — the client digs its
            // own hole deeper exactly when it needs to back off.
            retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
            // Consider data stale after 30 seconds
            staleTime: 30 * 1000,
            // Cache data for 5 minutes
            gcTime: 5 * 60 * 1000,
          },
          mutations: {
            // Same rule, and it matters more here: a retried mutation is a
            // second write attempt, not just a wasted read.
            retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

export default QueryProvider;
