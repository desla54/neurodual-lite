'use client';

/**
 * Reward Context (Lite - Noop)
 *
 * Simplified reward context. No XP-based premium rewards - all features are free.
 */

import type {
  GrantedReward,
  PendingReward,
  PremiumRewardType,
  RewardGrantResult,
  RewardPort,
  RewardState,
} from '@neurodual/logic';
import {
  getRewardAdapter,
  useGrantedRewards as useGrantedRewardsQuery,
  usePendingRewards as usePendingRewardsQuery,
  useHasReward as useHasRewardQuery,
  useGrantReward as useGrantRewardMutation,
  useQueueReward as useQueueRewardMutation,
  useProcessPendingRewards as useProcessPendingRewardsMutation,
  useRefreshRewards as useRefreshRewardsMutation,
} from '../queries';

/**
 * Hook to get the reward adapter.
 */
export function useRewardAdapter(): RewardPort {
  return getRewardAdapter();
}

/**
 * Hook to get granted rewards.
 * Always empty in Lite mode.
 */
export function useGrantedRewards(): GrantedReward[] {
  return useGrantedRewardsQuery();
}

/**
 * Hook to get pending rewards.
 * Always empty in Lite mode.
 */
export function usePendingRewards(): PendingReward[] {
  return usePendingRewardsQuery();
}

/**
 * Hook to check if a specific reward has been granted.
 * Always false in Lite mode.
 */
export function useHasReward(rewardId: PremiumRewardType): boolean {
  return useHasRewardQuery(rewardId);
}

/**
 * Hook to get the full reward state.
 */
export function useRewardState(): RewardState {
  return {
    grantedRewards: [],
    pendingRewards: [],
    isProcessing: false,
  };
}

/**
 * Hook to grant a reward.
 * Noop in Lite mode.
 */
export function useGrantReward(): {
  grant: (rewardId: PremiumRewardType) => Promise<RewardGrantResult>;
  isPending: boolean;
  isSuccess: boolean;
  lastResult?: RewardGrantResult;
} {
  const mutation = useGrantRewardMutation();
  return {
    grant: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    lastResult: mutation.data,
  };
}

/**
 * Hook to queue a reward.
 * Noop in Lite mode.
 */
export function useQueueReward(): {
  queue: (rewardId: PremiumRewardType) => void;
} {
  return useQueueRewardMutation();
}

/**
 * Hook to process pending rewards.
 * Noop in Lite mode.
 */
export function useProcessPendingRewards(): {
  process: () => Promise<void>;
  isPending: boolean;
} {
  return useProcessPendingRewardsMutation();
}

/**
 * Hook to refresh rewards.
 * Noop in Lite mode.
 */
export function useRefreshRewards(): {
  refresh: () => Promise<void>;
  isPending: boolean;
} {
  return useRefreshRewardsMutation();
}

/**
 * Hook to check if processing rewards.
 * Always false in Lite mode.
 */
export function useIsProcessingRewards(): boolean {
  return false;
}

/**
 * Hook to get pending rewards count.
 * Always 0 in Lite mode.
 */
export function usePendingRewardsCount(): number {
  return 0;
}
