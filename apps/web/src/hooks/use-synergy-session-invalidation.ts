import type { GameSessionXState } from '@neurodual/logic';
import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

interface UseSynergySessionInvalidationOptions {
  readonly playMode: string;
  readonly nextSignature: string | null;
  readonly sessionRef: MutableRefObject<GameSessionXState | null>;
  readonly sessionConfigSignatureRef: MutableRefObject<string | null>;
  readonly forceUpdate: Dispatch<SetStateAction<number>>;
}

export function useSynergySessionInvalidation({
  playMode,
  nextSignature,
  sessionRef,
  sessionConfigSignatureRef,
  forceUpdate,
}: UseSynergySessionInvalidationOptions): void {
  useLayoutEffect(() => {
    if (playMode !== 'synergy') return;
    if (!sessionRef.current || !nextSignature) return;
    if (sessionConfigSignatureRef.current === nextSignature) return;

    const snapshot = sessionRef.current.getSnapshot();
    if (snapshot.phase !== 'idle') return;

    sessionRef.current.stop();
    sessionRef.current = null;
    sessionConfigSignatureRef.current = null;
    forceUpdate((value) => value + 1);
  }, [playMode, nextSignature, sessionRef, sessionConfigSignatureRef, forceUpdate]);
}
