/**
 * Subscription Queries
 *
 * TanStack Query hooks for subscription/premium status.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { SubscriptionPort, SubscriptionState } from '@neurodual/logic';
import { useIsPurchaseActive as useIsPurchaseActiveQuery } from './payment';
import { useHasValidLicense as useHasValidLicenseQuery } from './license';
import { queryKeys } from './keys';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let subscriptionAdapter: SubscriptionPort | null = null;

export function setSubscriptionAdapter(adapter: SubscriptionPort): void {
  subscriptionAdapter = adapter;
}

export function getSubscriptionAdapter(): SubscriptionPort {
  if (!subscriptionAdapter) {
    throw new Error('Subscription adapter not initialized. Call setSubscriptionAdapter first.');
  }
  return subscriptionAdapter;
}

// =============================================================================
// Query Keys (extend base keys)
// =============================================================================

const subscriptionKeys = {
  all: ['subscription'] as const,
  state: () => [...subscriptionKeys.all, 'state'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Default subscription state for loading/placeholder.
 * Free tier by default - enables basic UI while loading.
 */
const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  subscription: null,
  hasPremiumAccess: false,
  hasCloudSync: false,
  isTrialing: false,
  daysRemaining: null,
};

/**
 * Get current subscription state.
 *
 * Uses placeholderData to ensure UI renders immediately while loading.
 */
export function useSubscriptionQuery(): UseQueryResult<SubscriptionState> {
  return useQuery<SubscriptionState>({
    queryKey: subscriptionKeys.state(),
    queryFn: () => Promise.resolve(getSubscriptionAdapter().getState()),
    staleTime: 60 * 1000, // 1 minute
    // Provide default state while loading
    placeholderData: DEFAULT_SUBSCRIPTION_STATE,
  });
}

/**
 * Check if user has premium access.
 *
 * Fuses 3 sources for immediate UI updates:
 * 1. SubscriptionPort (Supabase DB via webhook) - delayed 1-30s
 * 2. PaymentPort (RevenueCat mobile IAP) - immediate
 * 3. LicensePort (Lemon Squeezy web license) - immediate
 *
 * Any source confirming premium → premium.
 * Both payment/license hooks are safe to call unconditionally:
 * - useIsPurchaseActive uses enabled:adapter.isAvailable() → false on web → placeholderData(false)
 * - useHasValidLicense handles missing adapter → returns empty state → false
 */
export function useHasPremiumAccess(): boolean {
  const { data } = useSubscriptionQuery();
  const subscriptionPremium = data?.hasPremiumAccess ?? false;

  // Immediate source: RevenueCat (mobile)
  const purchaseActive = useIsPurchaseActiveQuery();

  // Immediate source: Lemon Squeezy license key (web)
  const licenseValid = useHasValidLicenseQuery();

  return subscriptionPremium || purchaseActive || licenseValid;
}

/**
 * Check if user has cloud sync.
 */
export function useHasCloudSync(): boolean {
  const { data } = useSubscriptionQuery();
  return data?.hasCloudSync ?? false;
}

/**
 * Check if user is in trial.
 */
export function useIsTrialing(): boolean {
  const { data } = useSubscriptionQuery();
  return data?.isTrialing ?? false;
}

/**
 * Get days remaining in subscription/trial.
 */
export function useDaysRemaining(): number | null {
  const { data } = useSubscriptionQuery();
  return data?.daysRemaining ?? null;
}

/**
 * Check if user can access a specific N-level.
 * Uses the fused premium check (all 3 sources).
 */
export function useCanAccessNLevel(nLevel: number): boolean {
  // Free users can access N1-N5, premium can access all
  const hasPremium = useHasPremiumAccess();
  return hasPremium || nLevel <= 5;
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Refresh subscription from server.
 */
export function useRefreshSubscription(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      return getSubscriptionAdapter().refresh();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      // Also invalidate sync state since it depends on subscription
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
    },
  });
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Invalidate subscription queries.
 */
export function invalidateSubscriptionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
}
