import type { GameSessionXState, RecoveredSessionState } from '@neurodual/logic';
import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

interface UseRecoveredSessionResetOptions {
  readonly recoveredState: RecoveredSessionState | null;
  readonly sessionRef: MutableRefObject<GameSessionXState | null>;
  readonly sessionConfigSignatureRef: MutableRefObject<string | null>;
  readonly forceUpdate: Dispatch<SetStateAction<number>>;
}

export function useRecoveredSessionReset({
  recoveredState,
  sessionRef,
  sessionConfigSignatureRef,
  forceUpdate,
}: UseRecoveredSessionResetOptions): void {
  useLayoutEffect(() => {
    if (!recoveredState || !sessionRef.current) return;

    sessionRef.current.stop();
    sessionRef.current = null;
    sessionConfigSignatureRef.current = null;
    forceUpdate((value) => value + 1);
  }, [recoveredState, sessionRef, sessionConfigSignatureRef, forceUpdate]);
}
