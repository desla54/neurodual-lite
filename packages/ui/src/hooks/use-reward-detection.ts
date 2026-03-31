/**
 * useRewardDetection Hook
 *
 * Detects and grants XP-based Premium rewards when user levels up.
 * Should be called after progression update to check for newly unlocked rewards.
 */

import { getUnlockedRewards, type PremiumReward, type RewardGrantResult } from '@neurodual/logic';
import { useCallback, useRef, useState } from 'react';
import { useGrantedRewards, useGrantReward, useQueueReward } from '../context/RewardContext';

export interface NewlyGrantedReward {
  reward: PremiumReward;
  result: RewardGrantResult;
}

export interface UseRewardDetectionReturn {
  /**
   * Check and grant any newly unlocked rewards for the given level.
   * Returns the list of rewards that were newly granted.
   */
  checkAndGrantRewards: (level: number) => Promise<NewlyGrantedReward[]>;

  /**
   * Last granted rewards (for celebration display).
   */
  lastGrantedRewards: NewlyGrantedReward[];

  /**
   * Whether reward granting is in progress.
   */
  isGranting: boolean;

  /**
   * Clear the last granted rewards (after celebration is shown).
   */
  clearLastGranted: () => void;
}

/**
 * Hook to detect and grant XP-based Premium rewards.
 *
 * Usage:
 * ```tsx
 * const { checkAndGrantRewards, lastGrantedRewards } = useRewardDetection();
 *
 * // After progression update
 * useEffect(() => {
 *   if (progressionResult?.leveledUp) {
 *     checkAndGrantRewards(progressionResult.newLevel);
 *   }
 * }, [progressionResult]);
 * ```
 */
export function useRewardDetection(): UseRewardDetectionReturn {
  const grantedRewards = useGrantedRewards();
  const grantedRewardsRef = useRef(grantedRewards);
  grantedRewardsRef.current = grantedRewards;

  const { grant } = useGrantReward();
  const grantRef = useRef(grant);
  grantRef.current = grant;

  const { queue } = useQueueReward();
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const [lastGrantedRewards, setLastGrantedRewards] = useState<NewlyGrantedReward[]>([]);
  const [isGranting, setIsGranting] = useState(false);

  const checkAndGrantRewards = useCallback(async (level: number): Promise<NewlyGrantedReward[]> => {
    // Get all rewards unlocked at this level
    const unlockedRewards = getUnlockedRewards(level);

    // Filter out already granted rewards
    const grantedIds = new Set(
      grantedRewardsRef.current.map((r: { rewardId: string }) => r.rewardId),
    );
    const newRewards = unlockedRewards.filter((r) => !grantedIds.has(r.id));

    if (newRewards.length === 0) {
      return [];
    }

    setIsGranting(true);
    const results: NewlyGrantedReward[] = [];

    try {
      for (const reward of newRewards) {
        try {
          const result = await grantRef.current(reward.id);
          results.push({ reward, result });

          // If network error, queue for later
          if (!result.success && result.error === 'network_error') {
            queueRef.current(reward.id);
          }
        } catch (error) {
          // Network error - queue for later processing
          console.warn(`[RewardDetection] Failed to grant ${reward.id}, queuing for later:`, error);
          queueRef.current(reward.id);
          results.push({
            reward,
            result: { success: false, error: 'network_error' },
          });
        }
      }

      setLastGrantedRewards(results.filter((r) => r.result.success));
      return results;
    } finally {
      setIsGranting(false);
    }
  }, []);

  const clearLastGranted = useCallback(() => {
    setLastGrantedRewards([]);
  }, []);

  return {
    checkAndGrantRewards,
    lastGrantedRewards,
    isGranting,
    clearLastGranted,
  };
}

/**
 * Utility to get the next reward the user is working towards.
 */
export function useNextReward(currentLevel: number): PremiumReward | null {
  const grantedRewards = useGrantedRewards();
  const grantedIds = new Set(grantedRewards.map((r) => r.rewardId));

  // Find the next reward that hasn't been granted yet
  const allRewards = getUnlockedRewards(30); // Get all possible rewards
  const nextReward = allRewards.find(
    (r) => r.requiredLevel > currentLevel && !grantedIds.has(r.id),
  );

  return nextReward ?? null;
}
