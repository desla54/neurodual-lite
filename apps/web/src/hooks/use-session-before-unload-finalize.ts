import type { GameIntention, GameSessionXState } from '@neurodual/logic';
import { useLayoutEffect } from 'react';

interface UseSessionBeforeUnloadFinalizeOptions {
  readonly phase: string;
  readonly dispatch: (event: GameIntention) => void;
  readonly session: GameSessionXState;
}

export function useSessionBeforeUnloadFinalize({
  phase,
  dispatch,
  session,
}: UseSessionBeforeUnloadFinalizeOptions): void {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const isActive = phase !== 'idle' && phase !== 'finished';
    if (!isActive) return;

    let didFinalize = false;
    const finalize = () => {
      if (didFinalize) return;
      didFinalize = true;
      dispatch({ type: 'STOP' });
      void session.ensureEventsPersisted().catch(() => {});
    };

    window.addEventListener('beforeunload', finalize);
    return () => {
      window.removeEventListener('beforeunload', finalize);
    };
  }, [phase, dispatch, session]);
}
