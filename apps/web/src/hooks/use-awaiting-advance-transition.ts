import { useLayoutEffect } from 'react';

interface UseAwaitingAdvanceTransitionOptions {
  readonly phase: string | null | undefined;
  readonly isAnimating: boolean;
  readonly hasPendingAnimations: () => boolean;
  readonly beginClearing: () => void;
  readonly resetForNewTrial: () => void;
  readonly advance: () => void;
  readonly finishClearing: () => void;
  readonly pollIntervalMs: number;
  readonly clearDelayMs: number;
  readonly initialDelayMs: number;
}

export function useAwaitingAdvanceTransition({
  phase,
  isAnimating,
  hasPendingAnimations,
  beginClearing,
  resetForNewTrial,
  advance,
  finishClearing,
  pollIntervalMs,
  clearDelayMs,
  initialDelayMs,
}: UseAwaitingAdvanceTransitionOptions): void {
  useLayoutEffect(() => {
    if (isAnimating) return;
    if (phase !== 'awaitingAdvance') return;

    let cancelled = false;
    let currentTimerId: number | null = null;

    const checkAndAdvance = () => {
      if (cancelled) return;
      if (hasPendingAnimations()) {
        currentTimerId = window.setTimeout(checkAndAdvance, pollIntervalMs);
        return;
      }

      beginClearing();
      currentTimerId = window.setTimeout(() => {
        if (cancelled) return;
        resetForNewTrial();
        advance();
        finishClearing();
      }, clearDelayMs);
    };

    currentTimerId = window.setTimeout(checkAndAdvance, initialDelayMs);
    return () => {
      cancelled = true;
      if (currentTimerId !== null) {
        window.clearTimeout(currentTimerId);
      }
    };
  }, [
    phase,
    isAnimating,
    hasPendingAnimations,
    beginClearing,
    resetForNewTrial,
    advance,
    finishClearing,
    pollIntervalMs,
    clearDelayMs,
    initialDelayMs,
  ]);
}
