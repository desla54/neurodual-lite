import type { Sound } from '@neurodual/logic';
import { useLayoutEffect } from 'react';
import { logger } from '../lib';

interface RecallPromptLike {
  readonly currentPicks: ReadonlyMap<number, { position?: number; audio?: Sound }>;
  readonly isComplete: boolean;
}

interface UseRecallLocalPicksSyncOptions {
  readonly recallPrompt: RecallPromptLike | null | undefined;
  readonly phase: string;
  readonly trialIndex: number;
  readonly nLevel: number;
  readonly activeModalities: readonly string[];
  readonly setLocalPicks: (picks: Record<number, { position?: number; audio?: Sound }>) => void;
}

export function useRecallLocalPicksSync({
  recallPrompt,
  phase,
  trialIndex,
  nLevel,
  activeModalities,
  setLocalPicks,
}: UseRecallLocalPicksSyncOptions): void {
  useLayoutEffect(() => {
    if (!recallPrompt) return;

    const picks: Record<number, { position?: number; audio?: Sound }> = {};
    recallPrompt.currentPicks.forEach((slotPicks, slotIndex) => {
      const dist = slotIndex - 1;
      picks[dist] = {
        position: slotPicks.position,
        audio: slotPicks.audio,
      };
    });

    logger.debug('[Recall] Sync from snapshot', {
      snapshotPicksSize: recallPrompt.currentPicks.size,
      snapshotPicksKeys: Array.from(recallPrompt.currentPicks.keys()),
      convertedPicksKeys: Object.keys(picks),
      isComplete: recallPrompt.isComplete,
      phase,
      trialIndex,
      nLevel,
      activeModalities,
    });

    setLocalPicks(picks);
  }, [recallPrompt, phase, trialIndex, nLevel, activeModalities, setLocalPicks]);
}
