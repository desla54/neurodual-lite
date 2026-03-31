import { useEffectEvent, useLayoutEffect } from 'react';

interface UseSessionRelaunchOnFlagOptions {
  readonly shouldRelaunch: boolean;
  readonly relaunchSession: () => void;
  readonly queueStart: () => void;
}

export function useSessionRelaunchOnFlag({
  shouldRelaunch,
  relaunchSession,
  queueStart,
}: UseSessionRelaunchOnFlagOptions): void {
  const runRelaunch = useEffectEvent(() => {
    relaunchSession();
    queueStart();
  });

  useLayoutEffect(() => {
    if (!shouldRelaunch) return;
    runRelaunch();
  }, [shouldRelaunch, runRelaunch]);
}
