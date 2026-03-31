import { useLayoutEffect } from 'react';

interface UseTraceSwipeFeedbackResetOptions {
  readonly phase: string;
  readonly resetSwipeFeedback: () => void;
}

export function useTraceSwipeFeedbackReset({
  phase,
  resetSwipeFeedback,
}: UseTraceSwipeFeedbackResetOptions): void {
  useLayoutEffect(() => {
    if (phase === 'positionFeedback') return;
    resetSwipeFeedback();
  }, [phase, resetSwipeFeedback]);
}
