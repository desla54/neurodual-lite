import type { GameSessionXState } from '@neurodual/logic';
import { useLayoutEffect } from 'react';

interface DiagnosticsPortLike {
  onFreeze: (callback: () => void) => () => void;
  onLongTask: (callback: () => void) => () => void;
}

interface UseSessionDiagnosticsHealthReportingOptions {
  readonly diagnostics: DiagnosticsPortLike;
  readonly session: GameSessionXState;
}

export function useSessionDiagnosticsHealthReporting({
  diagnostics,
  session,
}: UseSessionDiagnosticsHealthReportingOptions): void {
  useLayoutEffect(() => {
    const unsubFreeze = diagnostics.onFreeze(() => {
      session.reportHealthEvent('freeze');
    });
    const unsubLongTask = diagnostics.onLongTask(() => {
      session.reportHealthEvent('longTask');
    });

    return () => {
      unsubFreeze();
      unsubLongTask();
    };
  }, [diagnostics, session]);
}
