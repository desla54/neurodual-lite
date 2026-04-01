/**
 * useRewardDetection Hook (Noop)
 *
 * XP-based rewards have been removed. This is a noop stub
 * to satisfy existing callers without breaking the build.
 */

import type { PremiumReward } from '@neurodual/logic';
import { useCallback, useState } from 'react';

export interface NewlyGrantedReward {
  reward: PremiumReward;
  result: { success: boolean };
}

export interface UseRewardDetectionReturn {
  checkAndGrantRewards: (level: number) => Promise<NewlyGrantedReward[]>;
  lastGrantedRewards: NewlyGrantedReward[];
  isGranting: boolean;
  clearLastGranted: () => void;
}

export function useRewardDetection(): UseRewardDetectionReturn {
  const [lastGrantedRewards] = useState<NewlyGrantedReward[]>([]);

  const checkAndGrantRewards = useCallback(
    async (_level: number): Promise<NewlyGrantedReward[]> => [],
    [],
  );

  const clearLastGranted = useCallback(() => {}, []);

  return {
    checkAndGrantRewards,
    lastGrantedRewards,
    isGranting: false,
    clearLastGranted,
  };
}

export function useNextReward(_currentLevel: number): PremiumReward | null {
  return null;
}
