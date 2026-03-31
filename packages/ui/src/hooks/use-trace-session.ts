/**
 * useTraceSession
 *
 * React hook for using TraceSessionXState wrapper class.
 * Provides a stable session reference with reactive snapshot updates.
 *
 * This hook follows the same pattern as useGameSession for consistency.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type {
  TraceSessionXState,
  TraceWrapperSnapshot,
  TraceSessionMachineEvent,
} from '@neurodual/logic';

export interface UseTraceSessionResult {
  /** Current session state snapshot (reactive) */
  snapshot: TraceWrapperSnapshot;
  /** Dispatch an event to the session */
  send: (event: TraceSessionMachineEvent) => void;
  /** Convenience methods */
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Hook for subscribing to a TraceSessionXState instance.
 *
 * @param session - The TraceSessionXState instance (should be stable via useRef)
 * @returns Object with snapshot and dispatch methods
 *
 * @example
 * ```tsx
 * const sessionRef = useRef<TraceSessionXState | null>(null);
 * if (!sessionRef.current) {
 *   sessionRef.current = new TraceSessionXState(input, deps);
 * }
 * const { snapshot, send, start, stop } = useTraceSession(sessionRef.current);
 * ```
 */
export function useTraceSession(session: TraceSessionXState): UseTraceSessionResult {
  const subscribe = useCallback(
    (onStoreChange: () => void) => session.subscribe(onStoreChange),
    [session],
  );
  const snapshot = useSyncExternalStore<TraceWrapperSnapshot>(
    subscribe,
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );

  // Memoized dispatch
  const send = useCallback((event: TraceSessionMachineEvent) => session.send(event), [session]);

  // Convenience methods
  const start = useCallback(() => session.start(), [session]);
  const stop = useCallback(() => session.stop(), [session]);
  const pause = useCallback(() => session.pause(), [session]);
  const resume = useCallback(() => session.resume(), [session]);

  return {
    snapshot,
    send,
    start,
    stop,
    pause,
    resume,
  };
}
