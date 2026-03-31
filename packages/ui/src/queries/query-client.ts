/**
 * TanStack Query Client Configuration
 *
 * Central configuration for React Query.
 * Provides sensible defaults for caching, retries, and error handling.
 */

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

/**
 * Safely format a query/mutation key for logging.
 * Handles keys containing objects, arrays, or non-string values.
 */
function formatKeyForLogging(key: readonly unknown[] | undefined): string {
  if (!key || key.length === 0) return 'unknown';
  return key
    .map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part === 'number' || typeof part === 'boolean') return String(part);
      try {
        return JSON.stringify(part);
      } catch {
        return '[unserializable]';
      }
    })
    .join('/');
}

const POWERSYNC_DRIVEN_QUERY_ROOTS = new Set(['history', 'profile', 'progression', 'journey']);

function getQueryRootFromFilters(filters: unknown): string | null {
  if (!filters || typeof filters !== 'object') return null;
  const queryKey = (filters as { queryKey?: unknown }).queryKey;
  if (!Array.isArray(queryKey) || queryKey.length === 0) return null;
  const root = queryKey[0];
  return typeof root === 'string' ? root : null;
}

function installPowerSyncInvalidationGuard(client: QueryClient): void {
  if (!import.meta.env.DEV) return;

  const originalInvalidateQueries = client.invalidateQueries.bind(client);
  client.invalidateQueries = (...args: Parameters<QueryClient['invalidateQueries']>) => {
    const root = getQueryRootFromFilters(args[0]);
    if (root && POWERSYNC_DRIVEN_QUERY_ROOTS.has(root)) {
      console.warn('[QueryGuard] invalidateQueries on PowerSync-driven key:', args[0]);
    }
    return originalInvalidateQueries(...args);
  };

  const originalRemoveQueries = client.removeQueries.bind(client);
  client.removeQueries = (...args: Parameters<QueryClient['removeQueries']>) => {
    const root = getQueryRootFromFilters(args[0]);
    if (root && POWERSYNC_DRIVEN_QUERY_ROOTS.has(root)) {
      console.warn('[QueryGuard] removeQueries on PowerSync-driven key:', args[0]);
    }
    return originalRemoveQueries(...args);
  };
}

/**
 * Create a configured QueryClient instance.
 * Call this once in apps/web and provide via QueryClientProvider.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Global error logging for queries
        console.error(`[Query Error] ${formatKeyForLogging(query.queryKey)}:`, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // Global error logging for mutations
        const key = formatKeyForLogging(mutation.options.mutationKey);
        console.error(`[Mutation Error] ${key}:`, error);
      },
    }),
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Retry failed queries 3 times with exponential backoff
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Don't refetch on window focus for mobile app
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect - we use Realtime for that
        refetchOnReconnect: false,
      },
      mutations: {
        // Retry mutations once
        retry: 1,
      },
    },
  });

  installPowerSyncInvalidationGuard(client);
  return client;
}

// Singleton instance for use outside React (e.g., Realtime handlers)
let queryClientInstance: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClientInstance) {
    queryClientInstance = createQueryClient();
  }
  return queryClientInstance;
}

/**
 * Get the current QueryClient instance if it has been set by the app.
 * Unlike getQueryClient(), this does NOT create a new instance.
 */
export function getOptionalQueryClient(): QueryClient | null {
  return queryClientInstance;
}

export function setQueryClient(client: QueryClient): void {
  queryClientInstance = client;
  // Expose for debugging (dev only)
  if (typeof window !== 'undefined') {
    try {
      const isDev = import.meta.env?.DEV;
      if (isDev) {
        (window as unknown as { queryClient: QueryClient }).queryClient = client;
      }
    } catch {
      // Ignore in non-Vite environments
    }
  }
}
