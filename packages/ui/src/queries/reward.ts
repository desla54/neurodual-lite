/**
 * Reward Queries
 *
 * TanStack Query hooks for XP-based Premium rewards.
 * Uses module-level adapter injection pattern.
 */

import type {
  GrantedReward,
  PendingReward,
  PremiumRewardType,
  RewardGrantResult,
  RewardPort,
  RewardState,
} from '@neurodual/logic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

// =============================================================================
// Module-level Adapter
// =============================================================================

let rewardAdapter: RewardPort | null = null;

/**
 * Set the reward adapter (called by NeurodualQueryProvider).
 */
export function setRewardAdapter(adapter: RewardPort): void {
  rewardAdapter = adapter;
}

/**
 * Get the reward adapter.
 * Throws if not initialized.
 */
export function getRewardAdapter(): RewardPort {
  if (!rewardAdapter) {
    throw new Error('RewardAdapter not initialized. Wrap app with NeurodualQueryProvider.');
  }
  return rewardAdapter;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook to get granted rewards.
 */
export function useGrantedRewards(): GrantedReward[] {
  const adapter = getRewardAdapter();

  const { data = [] } = useQuery({
    queryKey: queryKeys.reward.granted(),
    queryFn: () => adapter.getGrantedRewards(),
    staleTime: 60 * 1000, // 1 minute
  });

  return data;
}

/**
 * Hook to get pending rewards (offline queue).
 */
export function usePendingRewards(): PendingReward[] {
  const adapter = getRewardAdapter();

  const { data = [] } = useQuery({
    queryKey: queryKeys.reward.pending(),
    queryFn: () => adapter.getPendingRewards(),
    staleTime: 0, // Always fresh
  });

  return data;
}

/**
 * Hook to check if a specific reward has been granted.
 */
export function useHasReward(rewardId: PremiumRewardType): boolean {
  const grantedRewards = useGrantedRewards();
  return grantedRewards.some((r) => r.rewardId === rewardId);
}

/**
 * Hook to get the full reward state.
 */
export function useRewardState(): RewardState {
  const grantedRewards = useGrantedRewards();
  const pendingRewards = usePendingRewards();

  return {
    grantedRewards,
    pendingRewards,
    isProcessing: false, // Updated via subscription in context
  };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook to grant a reward.
 */
export function useGrantReward(): {
  mutate: (rewardId: PremiumRewardType) => void;
  mutateAsync: (rewardId: PremiumRewardType) => Promise<RewardGrantResult>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data?: RewardGrantResult;
} {
  const adapter = getRewardAdapter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (rewardId: PremiumRewardType) => adapter.grantReward(rewardId),
    onSuccess: () => {
      // Invalidate reward queries to refresh state
      queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
      // Also invalidate subscription as it may have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    data: mutation.data,
  };
}

/**
 * Hook to queue a reward (for offline mode).
 */
export function useQueueReward(): {
  queue: (rewardId: PremiumRewardType) => void;
} {
  const adapter = getRewardAdapter();
  const queryClient = useQueryClient();

  const queue = (rewardId: PremiumRewardType): void => {
    adapter.queueReward(rewardId);
    // Invalidate pending rewards to reflect change
    queryClient.invalidateQueries({ queryKey: queryKeys.reward.pending() });
  };

  return { queue };
}

/**
 * Hook to process pending rewards.
 */
export function useProcessPendingRewards(): {
  process: () => Promise<void>;
  isPending: boolean;
} {
  const adapter = getRewardAdapter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adapter.processPendingRewards(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });

  return {
    process: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

/**
 * Hook to refresh rewards from server.
 */
export function useRefreshRewards(): {
  refresh: () => Promise<void>;
  isPending: boolean;
} {
  const adapter = getRewardAdapter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => adapter.refresh(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
    },
  });

  return {
    refresh: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

// =============================================================================
// Invalidation Helpers
// =============================================================================

/**
 * Invalidate all reward queries.
 */
export function invalidateRewardQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
}
