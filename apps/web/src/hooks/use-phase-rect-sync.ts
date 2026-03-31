import { useEffectEvent, useLayoutEffect } from 'react';

interface UsePhaseRectSyncOptions {
  readonly phase: string | null | undefined;
  readonly activePhases?: readonly string[];
  readonly updateRects: () => void;
  readonly delayMs: number;
  readonly immediate?: boolean;
  readonly includeResizeListener?: boolean;
  readonly onDelayedSync?: () => void;
}

export function usePhaseRectSync({
  phase,
  activePhases,
  updateRects,
  delayMs,
  immediate = true,
  includeResizeListener = false,
  onDelayedSync,
}: UsePhaseRectSyncOptions): void {
  const runUpdateRects = useEffectEvent(updateRects);
  const runDelayedSync = useEffectEvent(() => {
    onDelayedSync?.();
  });
  const activePhasesKey = activePhases?.join('\u0000') ?? null;

  useLayoutEffect(() => {
    if (activePhases && (!phase || !activePhases.includes(phase))) {
      return;
    }

    if (immediate) {
      runUpdateRects();
    }

    const timer = window.setTimeout(() => {
      runUpdateRects();
      runDelayedSync();
    }, delayMs);

    if (includeResizeListener) {
      window.addEventListener('resize', runUpdateRects);
    }

    return () => {
      clearTimeout(timer);
      if (includeResizeListener) {
        window.removeEventListener('resize', runUpdateRects);
      }
    };
  }, [
    phase,
    activePhasesKey,
    delayMs,
    immediate,
    includeResizeListener,
    runUpdateRects,
    runDelayedSync,
  ]);
}
