'use client';

/**
 * Reward Context
 *
 * Provides reward adapter access via module-level injection.
 * Uses TanStack Query for state caching.
 */

import type {
  GrantedReward,
  PendingReward,
  PremiumRewardType,
  RewardGrantResult,
  RewardPort,
  RewardState,
} from '@neurodual/logic';
import { useCallback, useSyncExternalStore } from 'react';
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
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useRewardAdapter(): RewardPort {
  return getRewardAdapter();
}

/**
 * Hook to get granted rewards with automatic updates.
 */
export function useGrantedRewards(): GrantedReward[] {
  return useGrantedRewardsQuery();
}

/**
 * Hook to get pending rewards (offline queue).
 */
export function usePendingRewards(): PendingReward[] {
  return usePendingRewardsQuery();
}

/**
 * Hook to check if a specific reward has been granted.
 */
export function useHasReward(rewardId: PremiumRewardType): boolean {
  return useHasRewardQuery(rewardId);
}

/**
 * Hook to get the full reward state with live updates.
 */
export function useRewardState(): RewardState {
  const adapter = useRewardAdapter();

  // Subscribe to adapter for immediate updates
  return useSyncExternalStore(
    useCallback((cb) => adapter.subscribe(() => cb()), [adapter]),
    () => adapter.getState(),
  );
}

/**
 * Hook to grant a reward.
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
 * Hook to queue a reward for offline processing.
 */
export function useQueueReward(): {
  queue: (rewardId: PremiumRewardType) => void;
} {
  return useQueueRewardMutation();
}

/**
 * Hook to process pending rewards.
 */
export function useProcessPendingRewards(): {
  process: () => Promise<void>;
  isPending: boolean;
} {
  return useProcessPendingRewardsMutation();
}

/**
 * Hook to refresh rewards from server.
 */
export function useRefreshRewards(): {
  refresh: () => Promise<void>;
  isPending: boolean;
} {
  return useRefreshRewardsMutation();
}

/**
 * Hook to check if user is currently processing rewards.
 */
export function useIsProcessingRewards(): boolean {
  const state = useRewardState();
  return state.isProcessing;
}

/**
 * Hook to get the count of pending rewards.
 */
export function usePendingRewardsCount(): number {
  const pending = usePendingRewards();
  return pending.length;
}
