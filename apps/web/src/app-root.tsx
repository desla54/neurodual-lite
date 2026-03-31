import { featureFlags } from './config/feature-flags';
import { startLagSampler, type JourneyConfig } from '@neurodual/logic';
import {
  AudioProvider,
  AudioResumeHandler,
  defaultUITranslations,
  getDevEffectProfilerSnapshot,
  NeurodualQueryProvider,
  ReplayInteractifProvider,
  StatsProvider,
  Toaster,
  UIProvider,
  useMountEffect,
} from '@neurodual/ui';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router';
import { AudioConfigSync } from './components/audio-config-sync';
import { CloudSyncProvider } from './components/cloud-sync-provider';
import { DevRenderProfiler, getDevRenderProfilerSnapshot } from './components/dev-render-profiler';
import { DeepLinkProvider } from './components/deep-link-provider';
import { ErrorBoundary } from './components/error-boundary';
import { JourneyExpansionHandler } from './components/journey-expansion-handler';
import { LanguageSync } from './components/language-sync';
import { ReducedMotionSync } from './components/reduced-motion-sync';
import { SynergyLoopSync } from './components/synergy/synergy-loop-sync';
import { SentryContextSync } from './components/sentry-context-sync';
import { PostHogContextSync } from './components/posthog-context-sync';
import { PostHogRouterSync } from './components/posthog-router-sync';
import { ChallengeDayValidationObserver } from './components/challenge-day-validation-observer';
import { TrainingRemindersSync } from './components/training-reminders-sync';
import { PWAPrompts } from '@pwa-prompts';
import { initStaleAssetsDetector } from './services/stale-assets-detector';
import { clearCachesAndUnregisterSW, clearReloadGuardOnSuccess } from './services/reload-recovery';
import { createLocalStoragePipelineRecoveryStorage } from './services/session-pipeline';
import { buildJourneyConfigSnapshot } from './lib/journey-config';
import {
  lazyAudioLifecycleMachine,
  preloadLazyAudioLifecycleMachine,
} from './services/lazy-audio-lifecycle';
import { router } from './router';
import { useSettingsStore } from './stores/settings-store';
import { useShallow } from 'zustand/react/shallow';
import {
  PowerSyncProvider,
  AppPortsProvider,
  DevDebugServices,
  WebDigitRecognizerProvider,
  WebHandwritingRecognizerProvider,
  SystemProvider,
  useAppPorts,
  useOptionalAppState,
  useIsOnline,
} from './providers';

import './i18n';

import { initAppBootstrap } from './providers/app-bootstrap';

// =============================================================================
// Adapters Setup (sync, no await needed)
// =============================================================================

initAppBootstrap();

startLagSampler();

type AutoFreezeSnapshot = {
  readonly collectedAt: string;
  readonly pendingCrudCount: number | null;
  readonly pendingCrudByTable: readonly {
    readonly tableName: string;
    readonly count: number;
  }[];
  readonly persistenceHealth: {
    readonly persistenceStage: string | null;
    readonly sync: {
      readonly status: string;
      readonly pendingCount: number;
      readonly isAvailable: boolean;
      readonly lastSyncAt: number | null;
      readonly errorMessage: string | null;
    };
    readonly activeWatchSubscriptions: number;
    readonly powerSync: {
      readonly selectedVfs: string | null;
      readonly updatedAt: string;
      readonly reconnect: {
        readonly attempts: number;
        readonly successes: number;
        readonly failures: number;
        readonly lastReason: string | null;
        readonly lastDurationMs: number | null;
        readonly lastError: string | null;
      };
      readonly memory: {
        readonly reason: string;
        readonly jsHeapUsedMb: number | null;
        readonly storageUsageMb: number | null;
      } | null;
    } | null;
    readonly projections: {
      readonly status: 'unavailable' | 'ok' | 'degraded' | 'error';
      readonly source: 'strict-cross-check' | 'unavailable';
      readonly endedSessions: number | null;
      readonly sessionSummaries: number | null;
      readonly missingSummaries: number | null;
      readonly orphanSummaries: number | null;
      readonly lastCheckedAt: string | null;
      readonly errorMessage: string | null;
    };
  };
  readonly readModelWatches: {
    readonly activeStores: number;
    readonly activeListeners: number;
    readonly queuedEmitCount: number;
    readonly lastSlowOperation: {
      readonly label: string;
      readonly durationMs: number;
      readonly at: string;
    } | null;
    readonly stores: readonly {
      readonly name: string;
      readonly started: boolean;
      readonly listenerCount: number;
      readonly emitScheduled: boolean;
      readonly onDataCount: number;
      readonly onErrorCount: number;
      readonly stateChangeCount: number;
      readonly lastRowCount: number;
      readonly lastOnDataAt: string | null;
      readonly lastMapDurationMs: number | null;
      readonly lastEmitDurationMs: number | null;
      readonly lastEmitAt: string | null;
      readonly lastError: string | null;
    }[];
  };
  readonly renderProfiler: {
    readonly lastSlowCommit: {
      readonly id: string;
      readonly route: string;
      readonly phase: 'mount' | 'update' | 'nested-update';
      readonly actualDurationMs: number;
      readonly baseDurationMs: number;
      readonly at: string;
    } | null;
    readonly recentCommits: readonly {
      readonly id: string;
      readonly route: string;
      readonly phase: 'mount' | 'update' | 'nested-update';
      readonly actualDurationMs: number;
      readonly baseDurationMs: number;
      readonly at: string;
    }[];
  };
  readonly effectProfiler: {
    readonly lastSlowEffect: {
      readonly label: string;
      readonly kind: 'sync' | 'async';
      readonly durationMs: number;
      readonly route: string;
      readonly at: string;
    } | null;
    readonly recentEffects: readonly {
      readonly label: string;
      readonly kind: 'sync' | 'async';
      readonly durationMs: number;
      readonly route: string;
      readonly at: string;
    }[];
  };
  readonly authDebug: {
    readonly hasSupabase: boolean;
    readonly authStatus: string;
    readonly userId: string | null;
    readonly hasCloudSync: boolean;
    readonly hasPremiumAccess: boolean;
  };
};

function formatAutoFreezeSnapshot(snapshot: AutoFreezeSnapshot): string {
  const lines = [
    `[FreezeDiagnostics] Auto PowerSync snapshot @ ${snapshot.collectedAt}`,
    `persistenceStage=${snapshot.persistenceHealth.persistenceStage ?? 'unknown'} syncStatus=${snapshot.persistenceHealth.sync.status} syncPending=${snapshot.persistenceHealth.sync.pendingCount} syncAvailable=${snapshot.persistenceHealth.sync.isAvailable} pendingCrud=${snapshot.pendingCrudCount ?? 'n/a'}`,
    `auth hasSupabase=${snapshot.authDebug.hasSupabase} authStatus=${snapshot.authDebug.authStatus} userId=${snapshot.authDebug.userId ?? 'null'} hasCloudSync=${snapshot.authDebug.hasCloudSync} hasPremium=${snapshot.authDebug.hasPremiumAccess}`,
    `watchSubs=${snapshot.persistenceHealth.activeWatchSubscriptions} readModelStores=${snapshot.readModelWatches.activeStores} readModelListeners=${snapshot.readModelWatches.activeListeners} queuedEmit=${snapshot.readModelWatches.queuedEmitCount}`,
    `projections status=${snapshot.persistenceHealth.projections.status} source=${snapshot.persistenceHealth.projections.source} ended=${snapshot.persistenceHealth.projections.endedSessions ?? 'n/a'} summaries=${snapshot.persistenceHealth.projections.sessionSummaries ?? 'n/a'} missing=${snapshot.persistenceHealth.projections.missingSummaries ?? 'n/a'} orphan=${snapshot.persistenceHealth.projections.orphanSummaries ?? 'n/a'}`,
  ];

  if (snapshot.pendingCrudByTable.length > 0) {
    lines.push(
      `pendingCrudByTable ${snapshot.pendingCrudByTable
        .slice(0, 6)
        .map((row) => `${row.tableName}=${row.count}`)
        .join(' ')}`,
    );
  }

  const runtime = snapshot.persistenceHealth.powerSync;
  if (runtime) {
    lines.push(
      `runtime vfs=${runtime.selectedVfs ?? 'n/a'} reconnect attempts=${runtime.reconnect.attempts} ok=${runtime.reconnect.successes} fail=${runtime.reconnect.failures} lastReason=${runtime.reconnect.lastReason ?? 'n/a'} lastDurationMs=${runtime.reconnect.lastDurationMs ?? 'n/a'}`,
    );
    if (runtime.memory) {
      lines.push(
        `memory heapMb=${runtime.memory.jsHeapUsedMb ?? 'n/a'} storageMb=${runtime.memory.storageUsageMb ?? 'n/a'} sampleReason=${runtime.memory.reason}`,
      );
    }
  }

  if (snapshot.readModelWatches.lastSlowOperation) {
    lines.push(
      `lastSlowReadModel label=${snapshot.readModelWatches.lastSlowOperation.label} durationMs=${Math.round(snapshot.readModelWatches.lastSlowOperation.durationMs)}`,
    );
  }

  if (snapshot.renderProfiler.lastSlowCommit) {
    lines.push(
      `lastSlowRender id=${snapshot.renderProfiler.lastSlowCommit.id} route=${snapshot.renderProfiler.lastSlowCommit.route} phase=${snapshot.renderProfiler.lastSlowCommit.phase} actualMs=${Math.round(snapshot.renderProfiler.lastSlowCommit.actualDurationMs)} baseMs=${Math.round(snapshot.renderProfiler.lastSlowCommit.baseDurationMs)}`,
    );
  }

  if (snapshot.effectProfiler.lastSlowEffect) {
    lines.push(
      `lastSlowEffect label=${snapshot.effectProfiler.lastSlowEffect.label} kind=${snapshot.effectProfiler.lastSlowEffect.kind} route=${snapshot.effectProfiler.lastSlowEffect.route} durationMs=${Math.round(snapshot.effectProfiler.lastSlowEffect.durationMs)}`,
    );
  }

  if (snapshot.persistenceHealth.projections.errorMessage) {
    lines.push(`projectionError ${snapshot.persistenceHealth.projections.errorMessage}`);
  }

  const topStores = snapshot.readModelWatches.stores.slice(0, 8);
  if (topStores.length > 0) {
    lines.push('topReadModelStores:');
    for (const store of topStores) {
      lines.push(
        `  - ${store.name} listeners=${store.listenerCount} rows=${store.lastRowCount} onData=${store.onDataCount} mapMs=${store.lastMapDurationMs ?? 'n/a'} emitMs=${store.lastEmitDurationMs ?? 'n/a'} scheduled=${store.emitScheduled} error=${store.lastError ?? 'none'}`,
      );
    }
  }

  const recentCommits = snapshot.renderProfiler.recentCommits.slice(-6);
  if (recentCommits.length > 0) {
    lines.push('recentRenderCommits:');
    for (const commit of recentCommits) {
      lines.push(
        `  - ${commit.id} route=${commit.route} phase=${commit.phase} actualMs=${Math.round(commit.actualDurationMs)} baseMs=${Math.round(commit.baseDurationMs)}`,
      );
    }
  }

  const recentEffects = snapshot.effectProfiler.recentEffects.slice(-6);
  if (recentEffects.length > 0) {
    lines.push('recentEffects:');
    for (const effect of recentEffects) {
      lines.push(
        `  - ${effect.label} kind=${effect.kind} route=${effect.route} durationMs=${Math.round(effect.durationMs)}`,
      );
    }
  }

  return lines.join('\n');
}

function useJourneyConfig(): JourneyConfig {
  const snapshot = useSettingsStore(
    useShallow((s) => {
      const activeJourney = s.savedJourneys.find((j) => j.id === s.ui.activeJourneyId);
      return {
        activeJourneyId: s.ui.activeJourneyId,
        activeJourney,
        legacyJourneyModeSettings: s.ui.journeyModeSettingsByJourneyId[s.ui.activeJourneyId],
      };
    }),
  );

  return useMemo(
    () =>
      buildJourneyConfigSnapshot({
        journeyId: snapshot.activeJourneyId,
        savedJourney: snapshot.activeJourney,
        startLevel: snapshot.activeJourney?.startLevel ?? 1,
        targetLevel: snapshot.activeJourney?.targetLevel ?? 5,
        legacyJourneyModeSettings: snapshot.legacyJourneyModeSettings,
      }),
    [snapshot.activeJourney, snapshot.activeJourneyId, snapshot.legacyJourneyModeSettings],
  );
}

const AppContent = memo(function AppContent() {
  const { t } = useTranslation();
  const translations = useMemo(
    () => ({
      ...defaultUITranslations,
      grid: {
        ...defaultUITranslations.grid,
        wordLabels: t('wordLabels', { returnObjects: true }) as Record<string, string> | undefined,
      },
    }),
    [t],
  );

  return (
    <UIProvider translations={translations}>
      <CloudSyncProvider>
        <WebHandwritingRecognizerProvider>
          <WebDigitRecognizerProvider>
            <DeepLinkProvider>
              <DevRenderProfiler id="RouterProvider">
                <RouterProvider router={router} />
              </DevRenderProfiler>
            </DeepLinkProvider>
          </WebDigitRecognizerProvider>
        </WebHandwritingRecognizerProvider>
      </CloudSyncProvider>
    </UIProvider>
  );
});

function AppWithJourneyConfig() {
  const journeyConfig = useJourneyConfig();
  const {
    adapters: injectedAdapters,
    persistence,
    sessionPipelineFactory,
    replayInteractif,
    auth,
    subscription,
    sync,
    reward,
    payment,
    license,
    hasSupabase: hasSupabaseFromPorts,
  } = useAppPorts();
  const isOnline = useIsOnline();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const pipelineRecoveryStorage = useMemo(() => createLocalStoragePipelineRecoveryStorage(), []);

  const getActiveUserIdForPersistence = useMemo(() => {
    return () => {
      if (!hasSupabaseFromPorts) return 'local';
      const authState = auth.getState();
      return authState.status === 'authenticated' ? authState.session.user.id : 'local';
    };
  }, [auth, hasSupabaseFromPorts]);

  const pipeline = useMemo(() => {
    return sessionPipelineFactory.create({
      historyAdapter: injectedAdapters.history,
      progressionAdapter: injectedAdapters.progression,
      journeyAdapter: injectedAdapters.journey,
      persistence,
      getActiveUserIdForPersistence,
      recoveryStorage: pipelineRecoveryStorage,
      syncToCloud: hasSupabaseFromPorts
        ? async (_sessionId: string) => {
            if (!sync.getState().isAvailable || !isOnlineRef.current) {
              return;
            }
            await sync.sync();
          }
        : undefined,
    });
  }, [
    injectedAdapters.history,
    injectedAdapters.progression,
    injectedAdapters.journey,
    persistence,
    getActiveUserIdForPersistence,
    hasSupabaseFromPorts,
    pipelineRecoveryStorage,
    sessionPipelineFactory,
    sync,
  ]);

  useEffect(() => {
    return () => pipeline.dispose?.();
  }, [pipeline]);

  const adapters = useMemo(
    () => ({
      auth,
      license,
      payment,
      reward,
      subscription,
      sync,
      history: injectedAdapters.history,
      journey: injectedAdapters.journey,
      readModels: injectedAdapters.readModels,
      profile: injectedAdapters.profile,
      progression: injectedAdapters.progression,
      pipeline,
    }),
    [auth, injectedAdapters, license, payment, pipeline, reward, subscription, sync],
  );

  return (
    <DevRenderProfiler id="AppWithJourneyConfig">
      <NeurodualQueryProvider adapters={adapters} journeyConfig={journeyConfig}>
        <JourneyExpansionHandler />
        <SynergyLoopSync />
        <StatsProvider value={injectedAdapters.stats}>
          <ReplayInteractifProvider value={replayInteractif}>
            <AppContent />
            <ChallengeDayValidationObserver />
            <Toaster
              position="top-center"
              closeButton
              offset="max(32px, calc(var(--safe-top, 0px) + 8px))"
              mobileOffset="max(32px, calc(var(--safe-top, 0px) + 8px))"
              toastOptions={{
                className: 'bg-stone-900 text-white border-stone-800 shadow-lg',
                descriptionClassName: 'text-stone-300',
              }}
            />
            <PWAPrompts />
          </ReplayInteractifProvider>
        </StatsProvider>
      </NeurodualQueryProvider>
    </DevRenderProfiler>
  );
}

export default function AppRoot() {
  const logBoot = (phase: string, detail: unknown, level = 'info') => {
    try {
      (
        window as Window & {
          __neurodualBootLog?: {
            add: (logLevel: string, logPhase: string, logDetail: unknown) => void;
          };
        }
      ).__neurodualBootLog?.add(level, phase, detail);
    } catch {
      // Ignore diagnostics failures.
    }
  };

  useMountEffect(() => {
    logBoot('app-root-mounted', 'AppRoot useEffect mounted');

    // Native-only: if the APK was updated while the app process is still alive (common during ADB
    // installs, and occasionally with Play updates), the WebView can keep showing the old JS until
    // the user force-closes the app. Detect version changes and trigger a clean reload automatically.
    //
    // This also helps recover from rare cases where an old PWA Service Worker is still controlling
    // the WebView and serving stale cached assets.
    let removeNativeListeners: (() => void) | null = null;
    if (featureFlags.nativeModeEnabled) {
      const VERSION_KEY = 'neurodual_native_app_version_v1';
      const RELOAD_GUARD_KEY = 'neurodual_native_update_reload_guard_v1';
      let resumeHandleP: Promise<{ remove: () => Promise<void> }> | null = null;
      let stateHandleP: Promise<{ remove: () => Promise<void> }> | null = null;

      const checkAndReloadIfUpdated = async (reason: string) => {
        try {
          const { App } = await import('@capacitor/app');
          const info = await App.getInfo();
          const versionId = `${info.version} (${info.build ?? '0'})`;
          const prev = localStorage.getItem(VERSION_KEY);

          if (prev && prev !== versionId) {
            if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return;
            sessionStorage.setItem(RELOAD_GUARD_KEY, '1');

            logBoot('native-update-detected', { prev, next: versionId, reason });

            await clearCachesAndUnregisterSW();
            localStorage.setItem(VERSION_KEY, versionId);

            const url = new URL(window.location.href);
            url.searchParams.set('_native_update', Date.now().toString());
            window.location.replace(url.toString());
            return;
          }

          localStorage.setItem(VERSION_KEY, versionId);
        } catch (error: unknown) {
          logBoot('native-update-check-failed', error, 'warn');
        }
      };

      void checkAndReloadIfUpdated('startup');

      import('@capacitor/app')
        .then(({ App }) => {
          resumeHandleP = App.addListener('resume', () => {
            void checkAndReloadIfUpdated('resume');
          });
          stateHandleP = App.addListener('appStateChange', (state) => {
            if (state.isActive) void checkAndReloadIfUpdated('appStateChange');
          });
        })
        .catch((error: unknown) => {
          logBoot('native-update-listeners-failed', error, 'warn');
        });

      // Ensure listeners are removed on unmount (handles are Promises in Capacitor).
      // We don't await here to keep teardown non-blocking.
      const removeListeners = () => {
        const safeRemove = (p: Promise<{ remove: () => Promise<void> }> | null) => {
          void p?.then((h) => h.remove()).catch(() => {});
        };
        safeRemove(resumeHandleP);
        safeRemove(stateHandleP);
      };

      removeNativeListeners = removeListeners;
    }

    // App loaded successfully - clear reload guard to reset error counter
    clearReloadGuardOnSuccess();
    logBoot('reload-guard', 'clearReloadGuardOnSuccess called');

    const staleDetectorTimer = setTimeout(() => {
      initStaleAssetsDetector();
    }, 1000);

    return () => {
      clearTimeout(staleDetectorTimer);
      try {
        removeNativeListeners?.();
      } catch {
        // ignore teardown errors
      }
    };
  });

  // Initialize AdMob (GDPR consent + first ad preload handled inside init). No-op on web/iOS.
  useMountEffect(() => {
    import('./services/admob').then((m) => m.adMobService.init());
  });

  // Initialize Sentry in production during idle time
  // Safari/iOS does not support requestIdleCallback, so we fallback to setTimeout
  // Without this check, the app crashes with "ReferenceError: Can't find variable: requestIdleCallback"
  useMountEffect(() => {
    if (!import.meta.env.PROD) return;
    const initSentry = () =>
      import('./services/sentry')
        .then((m) => m.initSentry())
        .catch((error: unknown) => {
          logBoot('sentry-init-failed', error, 'error');
          console.error('[AppRoot] Sentry init failed:', error);
        });
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(initSentry, { timeout: 3000 });
    } else {
      setTimeout(initSentry, 1000);
    }
  });

  // Load audio lifecycle adapter outside the critical startup path.
  useMountEffect(() => {
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const loadAudioLifecycle = () => {
      void preloadLazyAudioLifecycleMachine();
    };

    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(loadAudioLifecycle, { timeout: 4000 });
    } else {
      timeoutId = window.setTimeout(loadAudioLifecycle, 250);
    }

    return () => {
      if (idleId !== null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  });

  return (
    <ErrorBoundary>
      <SystemProvider>
        <AppPortsProvider>
          <SentryContextSync />
          <PostHogContextSync />
          <PostHogRouterSync />
          <DiagnosticsRuntimeEffects />
          <FreezeDiagnostics />
          <DevDebugServices />
          <PowerSyncProvider>
            <LanguageSync>
              <TrainingRemindersSync>
                <ReducedMotionSync>
                  <AudioProvider adapter={lazyAudioLifecycleMachine}>
                    <AudioConfigSync>
                      <AudioResumeHandler />
                      <AppWithJourneyConfig />
                    </AudioConfigSync>
                  </AudioProvider>
                </ReducedMotionSync>
              </TrainingRemindersSync>
            </LanguageSync>
          </PowerSyncProvider>
        </AppPortsProvider>
      </SystemProvider>
    </ErrorBoundary>
  );
}

function DiagnosticsRuntimeEffects() {
  const { diagnostics, auth, subscription, hasSupabase } = useAppPorts();
  const freezeSnapshotInFlightRef = useRef(false);
  const lastFreezeSnapshotAtRef = useRef(0);

  useEffect(() => {
    return diagnostics.installEventStoreFlushOnPageHide(2000);
  }, [diagnostics]);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    return diagnostics.onFreeze((event) => {
      import('./services/sentry').then(({ captureMessage }) => {
        captureMessage(`Freeze detected: ${event.durationMs} ms`, {
          level: 'warning',
          extra: {
            durationMs: event.durationMs,
            lastContext: event.lastContext,
            stack: event.stack,
            timestamp: event.timestamp,
          },
        });
      });
    });
  }, [diagnostics]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    return diagnostics.onFreeze((event) => {
      const now = Date.now();
      if (freezeSnapshotInFlightRef.current) return;
      if (now - lastFreezeSnapshotAtRef.current < 5000) return;

      freezeSnapshotInFlightRef.current = true;
      lastFreezeSnapshotAtRef.current = now;

      void import('@neurodual/infra')
        .then(({ collectPowerSyncFreezeSnapshot }) => collectPowerSyncFreezeSnapshot())
        .then((snapshot) => {
          const authState = auth.getState();
          const subscriptionState = subscription.getState();
          const enrichedSnapshot = {
            ...(snapshot as Omit<AutoFreezeSnapshot, 'renderProfiler' | 'effectProfiler'>),
            renderProfiler: getDevRenderProfilerSnapshot(),
            effectProfiler: getDevEffectProfilerSnapshot(),
            authDebug: {
              hasSupabase,
              authStatus: authState.status,
              userId: authState.status === 'authenticated' ? authState.session.user.id : null,
              hasCloudSync: subscriptionState.hasCloudSync === true,
              hasPremiumAccess: subscriptionState.hasPremiumAccess === true,
            },
          } as AutoFreezeSnapshot;

          (
            window as Window & {
              __neurodualLastFreezeSnapshot?: AutoFreezeSnapshot;
            }
          ).__neurodualLastFreezeSnapshot = enrichedSnapshot;

          console.warn(formatAutoFreezeSnapshot(enrichedSnapshot));
          console.warn(
            '[FreezeDiagnostics] Auto PowerSync snapshot saved to window.__neurodualLastFreezeSnapshot',
            {
              durationMs: event.durationMs,
              lastContext: event.lastContext,
              contextSource: event.contextSource,
              pendingStepContext: event.pendingStepContext,
              pendingStepAgeMs: event.pendingStepAgeMs,
            },
          );
        })
        .catch((error: unknown) => {
          console.warn('[FreezeDiagnostics] Auto PowerSync snapshot failed', error);
        })
        .finally(() => {
          freezeSnapshotInFlightRef.current = false;
        });
    });
  }, [auth, diagnostics, hasSupabase, subscription]);

  return null;
}

function FreezeDiagnostics() {
  const appState = useOptionalAppState();
  const { diagnostics } = useAppPorts();

  useEffect(() => {
    // Only start diagnostics once the app is interactive.
    // Startup can legitimately block the main thread (WASM/OPFS init).
    if (appState !== 'ready' && appState !== 'active') {
      return () => {
        diagnostics.disableLongTaskObserver();
        diagnostics.stopFreezeWatchdog();
      };
    }

    // Start diagnostics after the current mount/effect flush settles.
    // In dev (HMR/React Strict effects), starting immediately from this effect
    // can attribute mount-time passive effect work as a "freeze".
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    let raf1Id: number | null = null;
    let raf2Id: number | null = null;
    let unsubscribeFreezeAnalytics: (() => void) | null = null;

    const clearSchedules = () => {
      if (typeof window !== 'undefined') {
        if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idleId);
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (raf1Id !== null) {
          cancelAnimationFrame(raf1Id);
        }
        if (raf2Id !== null) {
          cancelAnimationFrame(raf2Id);
        }
      }
      idleId = null;
      timeoutId = null;
      raf1Id = null;
      raf2Id = null;
    };

    const startDiagnostics = () => {
      if (cancelled) return;
      diagnostics.startFreezeWatchdog();
      diagnostics.enableLongTaskObserver();

      // Forward freeze events to PostHog
      unsubscribeFreezeAnalytics = diagnostics.onFreeze((event) => {
        void import('./services/analytics')
          .then(({ trackEvent }) => {
            trackEvent('freeze_detected', {
              duration_ms: Math.round(event.durationMs),
              context: event.lastContext ?? 'unknown',
            });
          })
          .catch(() => {});
      });
    };

    const scheduleAfterPaint = () => {
      if (typeof window === 'undefined') {
        startDiagnostics();
        return;
      }
      raf1Id = window.requestAnimationFrame(() => {
        raf2Id = window.requestAnimationFrame(() => {
          startDiagnostics();
        });
      });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          scheduleAfterPaint();
        },
        { timeout: 1500 },
      );
    } else if (typeof window !== 'undefined') {
      timeoutId = window.setTimeout(() => {
        scheduleAfterPaint();
      }, 250);
    } else {
      startDiagnostics();
    }

    return () => {
      cancelled = true;
      clearSchedules();
      unsubscribeFreezeAnalytics?.();
      unsubscribeFreezeAnalytics = null;
      diagnostics.disableLongTaskObserver();
      diagnostics.stopFreezeWatchdog();
    };
  }, [appState, diagnostics]);

  return null;
}
