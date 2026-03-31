/**
 * Realtime Integration
 *
 * Auth-related cache invalidation helpers for TanStack Query.
 * Auth/subscription use TanStack Query - history/profile/progression/journey use PowerSync watched queries.
 *
 * For session completion: PowerSync watched queries auto-update
 * For sync updates: handled automatically by PowerSync + NeurodualQueryProvider
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

/**
 * Invalidate auth queries after login.
 * Auth still uses TanStack Query.
 */
export function invalidateAfterLogin(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
  queryClient.invalidateQueries({ queryKey: ['subscription'] });
}

/**
 * Invalidate auth queries after logout.
 * Auth still uses TanStack Query.
 */
export function invalidateAfterLogout(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
  queryClient.invalidateQueries({ queryKey: ['subscription'] });
}
