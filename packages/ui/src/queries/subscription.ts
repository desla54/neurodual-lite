/**
 * Subscription Queries (Lite - Always Free)
 *
 * Simplified subscription queries for local-only mode.
 * All features are unlocked - no premium restrictions.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { SubscriptionPort, SubscriptionState } from '@neurodual/logic';

// =============================================================================
// Adapter Reference (noop - no subscriptions in Lite)
// =============================================================================

/**
 * In Lite mode, everyone has full access.
 * hasPremiumAccess = true to unlock all features.
 */
const FREE_SUBSCRIPTION_STATE: SubscriptionState = {
  subscription: null,
  hasPremiumAccess: true,
  hasCloudSync: false,
  isTrialing: false,
  daysRemaining: null,
};

const noopSubscriptionAdapter: SubscriptionPort = {
  getState: () => FREE_SUBSCRIPTION_STATE,
  subscribe: () => () => {},
  refresh: async () => {},
  canAccessNLevel: () => true,
  canSyncToCloud: () => false,
};

let subscriptionAdapter: SubscriptionPort = noopSubscriptionAdapter;

export function setSubscriptionAdapter(adapter: SubscriptionPort): void {
  subscriptionAdapter = adapter;
}

export function getSubscriptionAdapter(): SubscriptionPort {
  return subscriptionAdapter;
}

// =============================================================================
// Query Keys
// =============================================================================

const subscriptionKeys = {
  all: ['subscription'] as const,
  state: () => [...subscriptionKeys.all, 'state'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get current subscription state.
 * In Lite mode, always returns full-access state.
 */
export function useSubscriptionQuery(): UseQueryResult<SubscriptionState> {
  return useQuery<SubscriptionState>({
    queryKey: subscriptionKeys.state(),
    queryFn: () => Promise.resolve(getSubscriptionAdapter().getState()),
    staleTime: 60 * 1000,
    placeholderData: FREE_SUBSCRIPTION_STATE,
  });
}

/**
 * Check if user has premium access.
 * Always true in Lite mode - all features unlocked.
 */
export function useHasPremiumAccess(): boolean {
  return true;
}

/**
 * Check if user has cloud sync.
 * Always false in Lite mode - local only.
 */
export function useHasCloudSync(): boolean {
  return false;
}

/**
 * Check if user is in trial.
 * Always false in Lite mode - no trials needed.
 */
export function useIsTrialing(): boolean {
  return false;
}

/**
 * Get days remaining in subscription/trial.
 * Always null in Lite mode.
 */
export function useDaysRemaining(): number | null {
  return null;
}

/**
 * Check if user can access a specific N-level.
 * Always true in Lite mode - all levels unlocked.
 */
export function useCanAccessNLevel(_nLevel: number): boolean {
  return true;
}

// =============================================================================
// Mutations (noop in Lite)
// =============================================================================

export function useRefreshSubscription(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      return getSubscriptionAdapter().refresh();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

// =============================================================================
// Cache Helpers
// =============================================================================

export function invalidateSubscriptionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
}
