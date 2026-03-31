import type { PersistencePort, RecoveredSessionState, SessionRecoveryPort } from '@neurodual/logic';
import { useLayoutEffect, useRef, useState } from 'react';
import type { SetURLSearchParams } from 'react-router';

interface UseSessionRecoveryLoaderOptions {
  readonly searchParams: URLSearchParams;
  readonly setSearchParams: SetURLSearchParams;
  readonly sessionRecovery: SessionRecoveryPort;
  readonly persistence: PersistencePort | null;
  readonly onRecovered?: (state: RecoveredSessionState) => void;
}

interface UseSessionRecoveryLoaderResult {
  readonly recoverSessionId: string | null;
  readonly recoveredState: RecoveredSessionState | null;
  readonly recoveryLoading: boolean;
  readonly clearRecoveredState: () => void;
}

export function useSessionRecoveryLoader({
  searchParams,
  setSearchParams,
  sessionRecovery,
  persistence,
  onRecovered,
}: UseSessionRecoveryLoaderOptions): UseSessionRecoveryLoaderResult {
  const recoverSessionId = searchParams.get('recover');
  const [recoveredState, setRecoveredState] = useState<RecoveredSessionState | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(Boolean(recoverSessionId));
  const attemptedSessionIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!recoverSessionId || !persistence) return;
    if (attemptedSessionIdRef.current === recoverSessionId) return;

    attemptedSessionIdRef.current = recoverSessionId;
    setRecoveryLoading(true);

    sessionRecovery
      .buildRecoveredState(persistence)
      .then((state) => {
        if (state && state.sessionId === recoverSessionId) {
          setRecoveredState(state);
          onRecovered?.(state);
          setSearchParams((prev) => {
            prev.delete('recover');
            return prev;
          });
          return;
        }

        console.warn('[GamePage] Recovery failed or session ID mismatch');
        sessionRecovery.clearRecoverySnapshot();
      })
      .catch((error: unknown) => {
        console.error('[GamePage] Session recovery error:', error);
        sessionRecovery.clearRecoverySnapshot();
      })
      .finally(() => {
        setRecoveryLoading(false);
      });
  }, [recoverSessionId, persistence, setSearchParams, sessionRecovery, onRecovered]);

  return {
    recoverSessionId,
    recoveredState,
    recoveryLoading,
    clearRecoveredState: () => {
      setRecoveredState(null);
    },
  };
}
