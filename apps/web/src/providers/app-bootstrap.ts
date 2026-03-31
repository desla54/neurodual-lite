import {
  buildStatsPayload,
  configureRevenueCat,
  deleteAllUserData,
  forceFullResync,
  isSupabaseConfigured,
  revenueCatAdapter,
  submitSessionStats,
} from '@neurodual/infra';
import { setDataManagementAdapter, setForceFullResyncFn, setStatsAdapter } from '@neurodual/ui';
import { featureFlags } from '../config/feature-flags';
import { configureLazyAudioLifecycleMachine } from '../services/lazy-audio-lifecycle';

export const hasSupabase = isSupabaseConfigured();

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

  if (!hasSupabase) {
    console.warn('[Supabase] Not configured (missing env vars), auth/sync features disabled');
  }

  if (featureFlags.nativeModeEnabled && featureFlags.premiumEnabled) {
    configureRevenueCat({
      androidApiKey: import.meta.env.VITE_REVENUECAT_ANDROID_KEY,
      iosApiKey: import.meta.env.VITE_REVENUECAT_IOS_KEY,
    });

    revenueCatAdapter.initialize().catch((err: unknown) => {
      console.warn('[RevenueCat] Failed to initialize:', err);
    });
  }

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
  setDataManagementAdapter({ deleteAllUserData });
  setForceFullResyncFn(forceFullResync);

  configureLazyAudioLifecycleMachine(async () => {
    const mod = await import('@neurodual/infra');
    return mod.audioLifecycleMachine;
  });
}
