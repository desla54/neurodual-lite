import type { GameSessionXState } from '@neurodual/logic';
import { useMountEffect } from '@neurodual/ui';

export function useSessionStopOnUnmount(session: GameSessionXState): void {
  useMountEffect(() => {
    return () => {
      session.stop();
    };
  });
}
