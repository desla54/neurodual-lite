import { featureFlags } from './config/feature-flags';
import { startLagSampler, type JourneyConfig } from '@neurodual/logic';
import {
  AudioProvider,
  AudioResumeHandler,
  defaultUITranslations,
  NeurodualQueryProvider,
  ReplayInteractifProvider,
  StatsProvider,
  Toaster,
  UIProvider,
  useMountEffect,
} from '@neurodual/ui';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router';
import { AudioConfigSync } from './components/audio-config-sync';
import { DevRenderProfiler } from './components/dev-render-profiler';
import { ErrorBoundary } from './components/error-boundary';
import { JourneyExpansionHandler } from './components/journey-expansion-handler';
import { LanguageSync } from './components/language-sync';
import { ReducedMotionSync } from './components/reduced-motion-sync';

import { ChallengeDayValidationObserver } from './components/challenge-day-validation-observer';
import { JourneyProgressionObserver } from './components/journey-progression-observer';
import { TrainingRemindersSync } from './components/training-reminders-sync';
import { PWAPrompts } from '@pwa-prompts';
import { initStaleAssetsDetector } from './services/stale-assets-detector';
import { clearReloadGuardOnSuccess } from './services/reload-recovery';
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
  AppPortsProvider,
  DevDebugServices,
  WebDigitRecognizerProvider,
  WebHandwritingRecognizerProvider,
  SystemProvider,
  useAppPorts,
  useOptionalAppState,
} from './providers';

import './i18n';

import { initAppBootstrap } from './providers/app-bootstrap';

// =============================================================================
// Adapters Setup (sync, no await needed)
// =============================================================================

initAppBootstrap();

startLagSampler();

function useJourneyConfig(): JourneyConfig {
  const snapshot = useSettingsStore(
    useShallow((s) => {
      const activeJourney = s.savedJourneys.find((j) => j.id === s.journeyUi.selectedJourneyId);
      return {
        activeJourneyId: s.journeyUi.selectedJourneyId,
        activeJourney,
        legacyJourneyModeSettings:
          s.ui.journeyModeSettingsByJourneyId[s.journeyUi.selectedJourneyId],
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
      <WebHandwritingRecognizerProvider>
        <WebDigitRecognizerProvider>
          <DevRenderProfiler id="RouterProvider">
            <RouterProvider router={router} />
          </DevRenderProfiler>
        </WebDigitRecognizerProvider>
      </WebHandwritingRecognizerProvider>
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
    premium,
    subscription,
    sync,
  } = useAppPorts();

  const pipelineRecoveryStorage = useMemo(() => createLocalStoragePipelineRecoveryStorage(), []);

  const getActiveUserIdForPersistence = useMemo(() => {
    return () => 'local';
  }, []);

  const pipeline = useMemo(() => {
    return sessionPipelineFactory.create({
      historyAdapter: injectedAdapters.history,
      progressionAdapter: injectedAdapters.progression,
      persistence,
      getActiveUserIdForPersistence,
      recoveryStorage: pipelineRecoveryStorage,
    });
  }, [
    injectedAdapters.history,
    injectedAdapters.progression,
    persistence,
    getActiveUserIdForPersistence,
    pipelineRecoveryStorage,
    sessionPipelineFactory,
  ]);

  useEffect(() => {
    return () => pipeline.dispose?.();
  }, [pipeline]);

  const adapters = useMemo(
    () => ({
      auth,
      premium,
      subscription,
      sync,
      history: injectedAdapters.history,
      readModels: injectedAdapters.readModels,
      profile: injectedAdapters.profile,
      progression: injectedAdapters.progression,
      pipeline,
    }),
    [auth, injectedAdapters, pipeline, premium, subscription, sync],
  );

  return (
    <DevRenderProfiler id="AppWithJourneyConfig">
      <NeurodualQueryProvider adapters={adapters} journeyConfig={journeyConfig}>
        <JourneyExpansionHandler />

        <StatsProvider value={injectedAdapters.stats}>
          <ReplayInteractifProvider value={replayInteractif}>
            <AppContent />
            <ChallengeDayValidationObserver />
            <JourneyProgressionObserver />
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

            const { clearCachesAndUnregisterSW } = await import('./services/reload-recovery');
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
          <FreezeDiagnostics />
          <DevDebugServices />
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
        </AppPortsProvider>
      </SystemProvider>
    </ErrorBoundary>
  );
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

      // Forward freeze events to analytics
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
