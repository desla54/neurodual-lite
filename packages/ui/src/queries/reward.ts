/**
 * Reward Queries (Lite - Noop)
 *
 * Simplified reward queries for local-only mode.
 * No XP-based premium rewards - all features are free.
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
// Module-level Adapter (noop - no rewards in Lite)
// =============================================================================

const noopRewardAdapter: RewardPort = {
  getState: () => ({ grantedRewards: [], pendingRewards: [], isProcessing: false }),
  subscribe: () => () => {},
  getGrantedRewards: async () => [],
  getPendingRewards: async () => [],
  grantReward: async () => ({ granted: false, reason: 'not-available' }) as RewardGrantResult,
  queueReward: () => {},
  processPendingRewards: async () => {},
  refresh: async () => {},
} as RewardPort;

let rewardAdapter: RewardPort = noopRewardAdapter;

export function setRewardAdapter(adapter: RewardPort): void {
  rewardAdapter = adapter;
}

export function getRewardAdapter(): RewardPort {
  return rewardAdapter;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook to get granted rewards.
 * Always empty in Lite mode.
 */
export function useGrantedRewards(): GrantedReward[] {
  const adapter = getRewardAdapter();
  const { data = [] } = useQuery({
    queryKey: queryKeys.reward.granted(),
    queryFn: () => adapter.getGrantedRewards(),
    staleTime: 60 * 1000,
  });
  return data;
}

/**
 * Hook to get pending rewards.
 * Always empty in Lite mode.
 */
export function usePendingRewards(): PendingReward[] {
  const adapter = getRewardAdapter();
  const { data = [] } = useQuery({
    queryKey: queryKeys.reward.pending(),
    queryFn: () => adapter.getPendingRewards(),
    staleTime: 0,
  });
  return data;
}

/**
 * Hook to check if a specific reward has been granted.
 * Always false in Lite mode.
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
    isProcessing: false,
  };
}

// =============================================================================
// Mutation Hooks (noop in Lite)
// =============================================================================

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
      queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
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

export function useQueueReward(): {
  queue: (rewardId: PremiumRewardType) => void;
} {
  const adapter = getRewardAdapter();
  const queryClient = useQueryClient();
  const queue = (rewardId: PremiumRewardType): void => {
    adapter.queueReward(rewardId);
    queryClient.invalidateQueries({ queryKey: queryKeys.reward.pending() });
  };
  return { queue };
}

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
    },
  });
  return {
    process: mutation.mutateAsync as () => Promise<void>,
    isPending: mutation.isPending,
  };
}

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
    refresh: mutation.mutateAsync as () => Promise<void>,
    isPending: mutation.isPending,
  };
}

// =============================================================================
// Invalidation Helpers
// =============================================================================

export function invalidateRewardQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
}
