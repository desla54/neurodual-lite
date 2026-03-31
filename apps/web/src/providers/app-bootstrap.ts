import { buildStatsPayload, submitSessionStats } from '@neurodual/infra';
import { setDataManagementAdapter, setForceFullResyncFn, setStatsAdapter } from '@neurodual/ui';
import { configureLazyAudioLifecycleMachine } from '../services/lazy-audio-lifecycle';

const APP_BOOTSTRAP_MARKER = '__ND_APP_BOOTSTRAP_DONE__';

function isBootstrapped(): boolean {
  return (
    (globalThis as typeof globalThis & { __ND_APP_BOOTSTRAP_DONE__?: boolean })[
      APP_BOOTSTRAP_MARKER
    ] === true
  );
}

function markBootstrapped(): void {
  (
    globalThis as typeof globalThis & {
      __ND_APP_BOOTSTRAP_DONE__?: boolean;
    }
  )[APP_BOOTSTRAP_MARKER] = true;
}

export function initAppBootstrap(): void {
  if (isBootstrapped()) return;
  markBootstrapped();

  setStatsAdapter({
    submitStats: async (playerId, report) => {
      const payload = buildStatsPayload(playerId, {
        sessionId: report.sessionId,
        gameMode: report.gameMode,
        nLevel: report.nLevel,
        unifiedAccuracy: report.unifiedAccuracy,
        totals: report.totals,
        durationMs: report.durationMs,
        reason: report.reason,
        createdAt: report.createdAt,
      });
      return submitSessionStats(payload);
    },
  });
  setDataManagementAdapter({
    deleteAllUserData: async () => {
      // No cloud data to delete in Lite mode
    },
  });
  setForceFullResyncFn(async () => {
    // No cloud sync to resync in Lite mode
  });

  configureLazyAudioLifecycleMachine(async () => {
    const mod = await import('@neurodual/infra');
    return mod.audioLifecycleMachine;
  });
}
