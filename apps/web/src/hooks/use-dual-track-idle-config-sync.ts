import type { Dispatch, SetStateAction } from 'react';
import { useLayoutEffect } from 'react';

interface UseDualTrackIdleConfigSyncOptions {
  readonly phase: string;
  readonly targetCount: number;
  readonly totalObjects: number;
  readonly setCurrentRoundTargetCount: Dispatch<SetStateAction<number>>;
  readonly setCurrentRoundTotalObjects: Dispatch<SetStateAction<number>>;
}

export function useDualTrackIdleConfigSync({
  phase,
  targetCount,
  totalObjects,
  setCurrentRoundTargetCount,
  setCurrentRoundTotalObjects,
}: UseDualTrackIdleConfigSyncOptions): void {
  useLayoutEffect(() => {
    if (phase !== 'idle') return;
    setCurrentRoundTargetCount(targetCount);
    setCurrentRoundTotalObjects(totalObjects);
  }, [phase, targetCount, totalObjects, setCurrentRoundTargetCount, setCurrentRoundTotalObjects]);
}
