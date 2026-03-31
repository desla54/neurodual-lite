import { useMountEffect } from '@neurodual/ui';
import { useCallback, useRef } from 'react';

type TimeoutId = ReturnType<typeof setTimeout>;

export interface ManagedTimeouts {
  readonly clearAllTimeouts: () => void;
  readonly clearManagedTimeout: (timeoutId: TimeoutId | null) => void;
  readonly scheduleManagedTimeout: (callback: () => void, delayMs: number) => TimeoutId;
}

export function useManagedTimeouts(): ManagedTimeouts {
  const timeoutIdsRef = useRef(new Set<TimeoutId>());

  const clearManagedTimeout = useCallback((timeoutId: TimeoutId | null) => {
    if (timeoutId === null) {
      return;
    }
    clearTimeout(timeoutId);
    timeoutIdsRef.current.delete(timeoutId);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    for (const timeoutId of timeoutIdsRef.current) {
      clearTimeout(timeoutId);
    }
    timeoutIdsRef.current.clear();
  }, []);

  const scheduleManagedTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);
    timeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  useMountEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  });

  return {
    clearAllTimeouts,
    clearManagedTimeout,
    scheduleManagedTimeout,
  };
}
