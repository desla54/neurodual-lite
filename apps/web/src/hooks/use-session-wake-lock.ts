import { useLayoutEffect } from 'react';

interface WakeLockPortLike {
  keepAwake: () => Promise<void>;
  allowSleep: () => Promise<void>;
}

interface UseSessionWakeLockOptions {
  readonly phase: string | null | undefined;
  readonly wakeLock: WakeLockPortLike;
}

export function useSessionWakeLock({ phase, wakeLock }: UseSessionWakeLockOptions): void {
  useLayoutEffect(() => {
    const isActive = phase !== 'finished';
    if (isActive) {
      wakeLock.keepAwake().catch(() => {});
    } else {
      wakeLock.allowSleep().catch(() => {});
    }

    return () => {
      wakeLock.allowSleep().catch(() => {});
    };
  }, [phase, wakeLock]);
}
