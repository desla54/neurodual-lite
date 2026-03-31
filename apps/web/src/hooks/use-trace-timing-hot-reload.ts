import type { TimingSource, TraceSessionTimings } from '@neurodual/logic';
import { useLayoutEffect, useRef, useEffectEvent } from 'react';

interface UseTraceTimingHotReloadOptions {
  readonly currentSessionTimings: TraceSessionTimings;
  readonly soundEnabled: boolean;
  readonly createTimingSource: (
    sessionTimings: TraceSessionTimings,
    soundEnabled: boolean,
  ) => TimingSource;
  readonly timingSourceRef: React.MutableRefObject<TimingSource>;
  readonly sendUpdate: (timings: TimingSource) => void;
}

export function useTraceTimingHotReload({
  currentSessionTimings,
  soundEnabled,
  createTimingSource,
  timingSourceRef,
  sendUpdate,
}: UseTraceTimingHotReloadOptions): void {
  const isFirstRender = useRef(true);
  const runSendUpdate = useEffectEvent(sendUpdate);

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const newTimingSource = createTimingSource(currentSessionTimings, soundEnabled);
    Object.assign(timingSourceRef.current, newTimingSource);
    runSendUpdate(newTimingSource);
  }, [currentSessionTimings, soundEnabled, createTimingSource, timingSourceRef, runSendUpdate]);
}
