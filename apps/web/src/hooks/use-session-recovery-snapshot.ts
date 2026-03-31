import type { CreateRecoverySnapshotParams, SessionRecoveryPort } from '@neurodual/logic';
import { useLayoutEffect } from 'react';

interface UseSessionRecoverySnapshotOptions {
  readonly enabled: boolean;
  readonly phase: string | null | undefined;
  readonly activePhases: readonly string[];
  readonly sessionRecovery: SessionRecoveryPort;
  readonly params: CreateRecoverySnapshotParams;
}

export function useSessionRecoverySnapshot({
  enabled,
  phase,
  activePhases,
  sessionRecovery,
  params,
}: UseSessionRecoverySnapshotOptions): void {
  const activePhasesKey = activePhases.join('\u0000');

  useLayoutEffect(() => {
    if (!enabled) return;
    if (!phase || !activePhasesKey.split('\u0000').includes(phase)) return;

    const snapshot = sessionRecovery.createRecoverySnapshot(params);
    sessionRecovery.saveRecoverySnapshot(snapshot);
  }, [enabled, phase, activePhasesKey, sessionRecovery, params]);
}
