import { useLayoutEffect } from 'react';

interface UseStableReportResetOptions {
  readonly phase: string | null | undefined;
  readonly finishedPhase?: string;
  readonly onReset: () => void;
}

export function useStableReportReset({
  phase,
  finishedPhase = 'finished',
  onReset,
}: UseStableReportResetOptions): void {
  useLayoutEffect(() => {
    if (phase === finishedPhase) return;
    onReset();
  }, [phase, finishedPhase, onReset]);
}
