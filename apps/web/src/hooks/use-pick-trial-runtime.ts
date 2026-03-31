import { useLayoutEffect } from 'react';

interface UsePickTrialRuntimeOptions {
  readonly phase: string | null | undefined;
  readonly trialIndex: number | null | undefined;
  readonly resetForNewTrial: () => void;
}

export function usePickTrialRuntime({
  phase,
  trialIndex,
  resetForNewTrial,
}: UsePickTrialRuntimeOptions): void {
  useLayoutEffect(() => {
    if (phase !== 'stimulus') return;
    resetForNewTrial();
  }, [phase, trialIndex, resetForNewTrial]);
}
