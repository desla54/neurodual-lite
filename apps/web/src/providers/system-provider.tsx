/**
 * SystemProvider
 *
 * Root provider that orchestrates all lifecycle machines.
 * Creates and wires together:
 * - AppLifecycleMachine (app state)
 * - PlatformLifecycleSource (background/foreground detection)
 * - NetworkLifecycleMachine (online/offline)
 * - GameSessionManager (session coordination)
 */

import {
  AppLifecycleAdapter,
  clearAuthTransitionMigrationMeta,
  configureLemonSqueezy,
  createAdaptersAsync,
  createNoopInfraAdapters,
  createPlatformLifecycleSource,
  getNetworkAdapter,
  getSessionManager,
  initNativeSocialLogin,
  isLikelyFatalPowerSyncStorageError,
  markPowerSyncFallbackToIdb,
  requestPersistentStorage,
  resetNetworkAdapter,
  resetSessionManager,
  setAuthSignOutCallback,
  setupPersistence,
  wipeLocalDeviceData,
  powerSyncSyncAdapter,
  resetPowerSyncSyncAdapter,
  cleanupOrphanedRuns,
  supabaseAuthAdapter,
  withWatchdogContext,
  withWatchdogContextAsync,
  type AppLifecycleInput,
  type InfraAdapters,
  type PowerSyncPersistencePort,
} from '@neurodual/infra';
import type {
  AppLifecyclePort,
  AppLifecycleState,
  CommandBusPort,
  GameSessionManagerPort,
  NetworkInfo,
  NetworkLifecyclePort,
  PersistencePort,
  PlatformLifecycleSource,
} from '@neurodual/logic';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Logo, setReducedMotionOverride, useMountEffect } from '@neurodual/ui';
import { initSettingsStore, useSettingsStore } from '../stores/settings-store';
import { changeLanguage } from '../i18n';
import { logger } from '../lib';
import { attemptAutoReload, clearReloadGuardOnSuccess } from '../services/reload-recovery';

// =============================================================================
// Context Types
// =============================================================================

interface SystemContextValue {
  /** App lifecycle state */
  appState: AppLifecycleState;

  /** Is app ready for user interaction? */
  isReady: boolean;

  /** Network connectivity info */
  network: NetworkInfo;

  /** Is online? */
  isOnline: boolean;

  /** Session manager for coordinating game sessions */
  sessionManager: GameSessionManagerPort;

  /** App lifecycle adapter (for advanced use) */
  appLifecycle: AppLifecyclePort;

  /** Platform lifecycle source (background/foreground) */
  platformLifecycle: PlatformLifecycleSource | null;

  /** Network adapter (for advanced use) */
  networkLifecycle: NetworkLifecyclePort;

  /** Injected adapters (history, profile, stats, settings, algorithmState) */
  adapters: InfraAdapters;

  /** Persistence port (for direct DB access - session recovery, etc.) */
  persistence: PersistencePort | null;

  /** Strict command bus for ES writes (may be null before persistence init). */
  commandBus: CommandBusPort | null;
}

function isNoopCommandBus(bus: CommandBusPort | null | undefined): boolean {
  if (!bus) return true;
  try {
    const src = Function.prototype.toString.call((bus as CommandBusPort).handle);
    return src.includes('[Adapters] Command bus not available before persistence init');
  } catch {
    return false;
  }
}

export const SystemContext = createContext<SystemContextValue | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

interface SystemProviderProps {
  children: ReactNode;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * SystemProvider
 *
 * Orchestrates all lifecycle machines and provides unified access.
 * Handles initialization in the correct order:
 * 1. Create platform lifecycle source (immediate)
 * 2. Create app lifecycle machine (immediate)
 * 3. Initialize persistence (async, in machine)
 * 4. Load settings (async, in machine)
 * 5. Initialize i18n (async, in machine)
 */
export function SystemProvider({ children }: SystemProviderProps) {
  // Refs to hold singleton instances
  const platformSourceRef = useRef<PlatformLifecycleSource | null>(null);
  const appLifecycleRef = useRef<AppLifecycleAdapter | null>(null);
  const networkRef = useRef<NetworkLifecyclePort | null>(null);
  const sessionManagerRef = useRef<GameSessionManagerPort | null>(null);
  const disposedRef = useRef(false);
  // Initialize with noop adapters for immediate render (replaced when SQLite ready)
  const [adapters, setAdapters] = useState<InfraAdapters>(() => createNoopInfraAdapters());
  const adaptersRef = useRef<InfraAdapters>(adapters);
  const [persistence, setPersistence] = useState<PersistencePort | null>(null);
  const persistenceRef = useRef<PersistencePort | null>(persistence);
  const initializedRef = useRef(false);
  const persistenceErrorHandlerInstalledRef = useRef(false);
  const startupMaintenanceScheduledRef = useRef(false);
  const splashHiddenRef = useRef(false);

  function updateAdapters(next: InfraAdapters): void {
    adaptersRef.current = next;
    if (!disposedRef.current) setAdapters(next);
  }

  function updatePersistence(next: PersistencePort | null): void {
    persistenceRef.current = next;
    if (!disposedRef.current) setPersistence(next);
  }

  // State for React re-renders
  const [appState, setAppState] = useState<AppLifecycleState>('cold_start');
  const [network, setNetwork] = useState<NetworkInfo>({
    state: 'unknown',
    quality: 'unknown',
    lastUpdated: Date.now(),
  });

  // Initialize all machines on mount
  useMountEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    disposedRef.current = false;

    performance.mark('system-init-start');
    const runSyncInitStep = <T,>(step: string, fn: () => T): T =>
      withWatchdogContext(`SystemProvider.${step}`, fn);

    // Configure Lemon Squeezy for web payments (PWA)
    runSyncInitStep('configureLemonSqueezy', () => {
      configureLemonSqueezy({
        storeId: 'neurodual',
        variants: {
          annual: 'ebfd82d8-fb29-4ff6-bc16-f89643c6e99a',
          lifetime: '24eb6fb2-7b6e-48ac-88f3-f4a245cb2020',
        },
      });
    });

    // Initialize native social login for in-app Google/Apple sign-in on mobile
    runSyncInitStep('initNativeSocialLogin', () => {
      initNativeSocialLogin({
        googleWebClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
        appleClientId: import.meta.env.VITE_APPLE_CLIENT_ID,
      }).catch((err: unknown) => {
        logger.warn('[SystemProvider] Native social login init failed:', err);
      });
    });

    // IMPORTANT:
    // Do NOT kick off persistence eagerly here.
    // On web, opening the PowerSync/SQLite backend (WASM/OPFS) can block the main thread for seconds
    // on some devices (first run / cold cache / large local history). We let the AppLifecycle machine
    // orchestrate init and display an appropriate loading state instead of freezing right after mount.

    // Request persistent storage (best-effort, non-blocking)
    // This tells the browser to exempt our storage from eviction under pressure (ITP, quota)
    runSyncInitStep('requestPersistentStorage', () => {
      requestPersistentStorage()
        .then((isPersisted: boolean) => {
          logger.debug(
            `[SystemProvider] Persistent storage: ${isPersisted ? 'granted' : 'best-effort'}`,
          );
        })
        .catch(() => {
          // Non-fatal - just ignore in production
        });
    });

    // NOTE: Do not create PersistencePort or adapters here.
    // Let the AppLifecycle machine orchestrate SQLite init to avoid doing heavy work during React mount.

    // 1. Create platform lifecycle source
    platformSourceRef.current = runSyncInitStep('createPlatformLifecycleSource', () =>
      createPlatformLifecycleSource(),
    );

    // 2. Create app lifecycle machine with init functions
    const appLifecycleInput: AppLifecycleInput = {
      initPersistence: async () => {
        const persistence = await withWatchdogContextAsync('setupPersistence (lifecycle)', () =>
          setupPersistence(),
        );
        // Store persistence for direct access (session recovery, etc.)
        updatePersistence(persistence);
        if (!persistenceErrorHandlerInstalledRef.current) {
          persistenceErrorHandlerInstalledRef.current = true;
          persistence.onError((error) => {
            if (!isLikelyFatalPowerSyncStorageError(error)) return;
            markPowerSyncFallbackToIdb(error);
            attemptAutoReload('persistence-io', { cacheBust: false });
          });
        }
        // PowerSync handles sync automatically - wire auth signOut cleanup
        setAuthSignOutCallback(async () => {
          powerSyncSyncAdapter.setAutoSync(false);
          const authState = supabaseAuthAdapter.getState();
          if (authState.status === 'authenticated') {
            await clearAuthTransitionMigrationMeta(persistence, authState.session.user.id);
          }
        });
        // Create adapters with explicit injection (may already exist from eager bootstrap above)
        // Replace noop adapters with real ones now that persistence is ready
        const created = await withWatchdogContextAsync('createAdapters', async () => {
          return createAdaptersAsync(persistence as PowerSyncPersistencePort, {
            syncPort: powerSyncSyncAdapter,
          });
        });
        updateAdapters(created);

        // Inject strict command bus for infra writers (system events, etc.).
        const { setSystemEventWriterCommandBus } = await import('@neurodual/infra');
        setSystemEventWriterCommandBus(created.commandBus);

        // Inject session-end workflow runner for derived effects.
        const { SessionEndWorkflowRunner } = await import('@neurodual/infra');
        const sessionEndRunner = new SessionEndWorkflowRunner(
          persistence,
          created,
          created.commandBus,
        );
        // Explicit injection (avoid globalThis wiring; runner depends on bus so we use a setter).
        (
          created.commandBus as unknown as {
            setSessionEndWorkflowRunner: (runner: unknown) => void;
          }
        ).setSessionEndWorkflowRunner(sessionEndRunner);
      },
      initSettings: async () => {
        if (!adaptersRef.current) {
          throw new Error('Adapters not initialized before settings');
        }
        await withWatchdogContextAsync('initSettings', () =>
          initSettingsStore(adaptersRef.current.settings),
        );
      },
      initI18n: async () => {
        await withWatchdogContextAsync('initI18n', async () => {
          const storedLanguage = useSettingsStore.getState().ui.language;
          await changeLanguage(storedLanguage);
        });
      },
      checkDatabaseHealth: async () => {
        // Check if database is still accessible after returning from background
        // If site data was cleared, this will throw and trigger a page reload
        if (persistenceRef.current) {
          await persistenceRef.current.healthCheck();
        }
      },
      platformLifecycleSource: platformSourceRef.current ?? undefined,
    };

    performance.mark('app-lifecycle-adapter-start');
    appLifecycleRef.current = runSyncInitStep(
      'createAppLifecycleAdapter',
      () => new AppLifecycleAdapter(appLifecycleInput),
    );
    performance.mark('app-lifecycle-adapter-end');

    // 3. Create network lifecycle
    performance.mark('network-adapter-start');
    networkRef.current = runSyncInitStep('getNetworkAdapter', () => getNetworkAdapter());
    performance.mark('network-adapter-end');

    // 4. Create session manager with dependencies
    performance.mark('session-manager-start');
    const appLifecycle = appLifecycleRef.current;
    if (!appLifecycle) {
      throw new Error('AppLifecycleAdapter not initialized');
    }
    const platformLifecycle = platformSourceRef.current ?? undefined;
    sessionManagerRef.current = runSyncInitStep('getSessionManager', () =>
      getSessionManager({
        appLifecycle,
        platformLifecycle,
      }),
    );
    performance.mark('session-manager-end');

    performance.mark('system-init-end');
    // Log performance measures in dev mode
    if (import.meta.env.DEV) {
      // requestIdleCallback polyfill for WebKitGTK (Tauri on Linux)
      const scheduleIdle =
        typeof requestIdleCallback === 'function'
          ? requestIdleCallback
          : (cb: () => void) => setTimeout(cb, 1);
      scheduleIdle(() => {
        const measures: [string, string, string][] = [
          ['system-init', 'system-init-start', 'system-init-end'],
          ['get-persistence-port', 'get-persistence-port-start', 'get-persistence-port-end'],
          ['create-adapters', 'create-adapters-start', 'create-adapters-end'],
          ['app-lifecycle-adapter', 'app-lifecycle-adapter-start', 'app-lifecycle-adapter-end'],
          ['network-adapter', 'network-adapter-start', 'network-adapter-end'],
          ['session-manager', 'session-manager-start', 'session-manager-end'],
        ];
        console.group('[SystemProvider] Init Performance');
        for (const [name, start, end] of measures) {
          try {
            performance.measure(name, start, end);
            const measure = performance.getEntriesByName(name, 'measure')[0];
            if (measure && measure.duration > 5) {
              console.log(`${name}: ${measure.duration.toFixed(1)}ms`);
            }
          } catch {
            // Mark not found, skip
          }
        }
        console.groupEnd();
      });
    }

    // Subscribe to app lifecycle changes
    const unsubApp = appLifecycleRef.current.subscribe((state) => {
      setAppState(state);

      // Hide splash screens once the app is interactive.
      // Wait for React to actually PAINT the first stable frame (double-rAF)
      // before hiding the splash, otherwise the user sees half-built layout.
      if ((state === 'ready' || state === 'active') && !splashHiddenRef.current) {
        splashHiddenRef.current = true;

        // Double requestAnimationFrame: first rAF = "layout done", second rAF = "pixels painted"
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Native: dismiss the Capacitor splash screen overlay.
            import('@capacitor/splash-screen')
              .then(({ SplashScreen }) => SplashScreen.hide())
              .catch(() => {});

            // Web: fade out the HTML loading overlay.
            (window as Window & { __hideLoadingScreen?: () => void }).__hideLoadingScreen?.();
          });
        });
      }

      // When app becomes ready, run one-time deferred maintenance.
      if (state === 'ready' && persistenceRef.current) {
        if (startupMaintenanceScheduledRef.current) {
          return;
        }
        startupMaintenanceScheduledRef.current = true;

        // Track cold start time + DB diagnostics
        if (typeof performance !== 'undefined') {
          const coldStartMs = Math.round(performance.now());
          void (async () => {
            try {
              const [{ trackEvent }, { collectDbDiagnostics }] = await Promise.all([
                import('../services/analytics'),
                import('@neurodual/infra'),
              ]);
              const dbDiag = await collectDbDiagnostics();
              trackEvent('app_loaded', {
                cold_start_ms: coldStartMs,
                ...(dbDiag ?? {}),
              });
            } catch {
              // Analytics must never break the app
            }
          })();
        }

        const persistence = persistenceRef.current;

        // Clear reload guard now that app has successfully loaded
        // This resets error counters and signals module-error-handler to defer to us
        clearReloadGuardOnSuccess();

        const scheduleIdle =
          typeof requestIdleCallback === 'function'
            ? (cb: () => void, timeoutMs = 2000) =>
                requestIdleCallback(() => cb(), { timeout: timeoutMs })
            : (cb: () => void) => setTimeout(cb, 100);

        // Defer orphan cleanup to an idle slot to avoid blocking initial render.
        scheduleIdle(() => {
          withWatchdogContextAsync('cleanupOrphanedRuns', () => cleanupOrphanedRuns(persistence))
            .then(({ deletedCount }: { deletedCount: number }) => {
              if (deletedCount > 0) {
                logger.debug(`[SystemProvider] Cleaned up ${deletedCount} orphaned replay runs`);
              }
            })
            .catch((err: unknown) => {
              console.warn('[SystemProvider] Failed to cleanup orphaned replay runs:', err);
            });
        }, 12_000);
      }
    });

    // Subscribe to network changes
    const unsubNetwork = networkRef.current?.subscribe((info) => {
      setNetwork(info);
    });

    // Note: Session-awareness (enterSession/exitSession) is no longer needed.
    // PowerSync connector handles this by only uploading completed sessions
    // (those with SESSION_ENDED event) in uploadData().

    // Cleanup on unmount
    return () => {
      disposedRef.current = true;
      unsubApp();
      unsubNetwork?.();

      // Dispose in reverse order
      if (sessionManagerRef.current) {
        resetSessionManager();
        sessionManagerRef.current = null;
      }

      // Reset PowerSync sync adapter
      resetPowerSyncSyncAdapter();

      if (networkRef.current) {
        resetNetworkAdapter();
        networkRef.current = null;
      }

      if (appLifecycleRef.current) {
        appLifecycleRef.current.dispose();
        appLifecycleRef.current = null;
      }

      if (platformSourceRef.current) {
        platformSourceRef.current.dispose();
        platformSourceRef.current = null;
      }

      initializedRef.current = false;
    };
  });

  // Memoize context value
  // Note: adaptersRef always has noop adapters initially, so no null check needed
  const value = useMemo<SystemContextValue | null>(() => {
    if (!appLifecycleRef.current || !networkRef.current || !sessionManagerRef.current) {
      return null;
    }

    const resolvedCommandBus =
      adapters && !isNoopCommandBus((adapters as { commandBus?: CommandBusPort }).commandBus)
        ? ((adapters as { commandBus?: CommandBusPort }).commandBus ?? null)
        : null;

    return {
      appState,
      isReady: appState === 'ready' || appState === 'active',
      network,
      isOnline: network.state === 'online',
      sessionManager: sessionManagerRef.current,
      appLifecycle: appLifecycleRef.current,
      platformLifecycle: platformSourceRef.current,
      networkLifecycle: networkRef.current,
      adapters,
      persistence,
      commandBus: resolvedCommandBus,
    };
  }, [appState, network, adapters, persistence]);

  // Sync reduced motion setting with animation system
  const reducedMotion = useSettingsStore((s) => s.ui.reducedMotion);
  useEffect(() => {
    setReducedMotionOverride(reducedMotion);
  }, [reducedMotion]);

  // Show nothing while machines are being created
  if (!value) {
    return <SystemLoadingScreen appState={appState} />;
  }

  // Show error screen if init failed
  if (appState === 'error') {
    return (
      <SystemErrorScreen
        error={appLifecycleRef.current?.getError() ?? null}
        onRetry={() => appLifecycleRef.current?.retry()}
      />
    );
  }

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

// =============================================================================
// Loading & Error Screens
// =============================================================================

/**
 * Loading screen shown while the lifecycle machines are being created.
 */
function SystemLoadingScreen({ appState: _appState }: { appState: AppLifecycleState }) {
  return null;
}

/**
 * Detect if error is specifically related to private browsing restrictions.
 * Be conservative - only match known private browsing error patterns.
 */
function isPrivateBrowsingError(error: Error | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();

  // Chrome/Firefox private browsing: "The operation is insecure"
  if (message.includes('operation is insecure')) return true;

  // SecurityError specifically on storage/getDirectory
  if (message.includes('securityerror') && message.includes('getdirectory')) return true;

  // Explicit storage access denied (not generic "access denied")
  if (message.includes('storage') && message.includes('access') && message.includes('denied'))
    return true;

  return false;
}

/**
 * Error screen shown if initialization fails.
 * Design matches ErrorBoundary (Woven Ink theme).
 */
function SystemErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useTranslation();
  const isPrivateMode = isPrivateBrowsingError(error);
  const isLocalDbUpgradeError =
    !isPrivateMode && Boolean(error?.message?.includes('Local database upgrade failed'));
  const [isResetting, setIsResetting] = useState(false);

  const title = isPrivateMode
    ? t('error.privateBrowsingTitle', 'Private browsing not supported')
    : t('error.loadingError', 'Loading error');

  const message = isPrivateMode
    ? t(
        'error.privateBrowsingMessage',
        "NeuroDual uses a local database to save your progress. This isn't available in private browsing.",
      )
    : error?.message || t('error.initializationFailed', 'Failed to initialize the app.');

  const hint = isPrivateMode
    ? t('error.privateBrowsingHint', 'Open this site in a regular window to continue.')
    : isLocalDbUpgradeError
      ? t(
          'error.localDbResetHint',
          "You can reset this browser's local database to unblock the app.",
        )
      : null;

  const handleResetLocalDb = async () => {
    if (isResetting) return;
    const confirmed = window.confirm(
      t(
        'error.localDbResetConfirm',
        'Reset the local database on this device?\n\nThis will delete unsynced history on this browser.',
      ),
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      // Clear dev-only + one-shot markers so a fresh init can proceed.
      try {
        localStorage.removeItem('neurodual:debug:failLocalDbMigration');
        localStorage.removeItem('neurodual:localDbMigration:autoWipeAttempted');
      } catch {
        // ignore
      }

      const result = await wipeLocalDeviceData();
      if (!result.success) {
        throw new Error(result.error ?? 'wipeLocalDeviceData failed');
      }
      window.location.reload();
    } catch (e) {
      setIsResetting(false);
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(
        t('error.localDbResetFailed', {
          defaultValue:
            "Reset failed. You can try clearing this site's data in your browser settings.\n\nDetails: {{details}}",
          details: msg,
        }),
      );
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center bg-background p-6"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fafaf9',
        padding: '1.5rem',
      }}
    >
      <div className="max-w-sm w-full" style={{ maxWidth: '24rem', width: '100%' }}>
        {/* Logo and decorative element */}
        <div
          className="flex flex-col items-center mb-8"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <div className="relative" style={{ position: 'relative' }}>
            <div
              className="absolute inset-0 -m-4 rounded-full bg-muted/30"
              style={{
                position: 'absolute',
                inset: 0,
                margin: '-1rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(231, 229, 228, 0.3)',
              }}
            />
            <Logo variant="icon" size={64} className="relative text-foreground/80" />
          </div>
        </div>

        {/* Error content */}
        <div
          className="text-center space-y-3 mb-8"
          style={{ textAlign: 'center', marginBottom: '2rem' }}
        >
          <h1
            className="text-xl font-semibold text-foreground tracking-tight"
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#1c1917',
              letterSpacing: '-0.025em',
              margin: 0,
            }}
          >
            {title}
          </h1>

          <p
            className="text-sm text-muted-foreground leading-relaxed"
            style={{
              fontSize: '0.875rem',
              color: '#78716c',
              lineHeight: 1.625,
              marginTop: '0.75rem',
            }}
          >
            {message}
          </p>

          {hint && (
            <p
              className="text-xs text-muted-foreground/70"
              style={{
                fontSize: '0.75rem',
                color: '#a8a29e',
                marginTop: '0.5rem',
              }}
            >
              {hint}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex flex-col gap-3"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <button
            type="button"
            onClick={isPrivateMode ? () => window.location.reload() : onRetry}
            disabled={isResetting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#1c1917',
              color: '#fafaf9',
              borderRadius: '0.75rem',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              opacity: isResetting ? 0.6 : 1,
            }}
          >
            {t('common.retry', 'Retry')}
          </button>

          {isLocalDbUpgradeError && (
            <button
              type="button"
              onClick={handleResetLocalDb}
              disabled={isResetting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border text-foreground rounded-xl font-medium hover:bg-muted/50 transition-colors"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#fafaf9',
                color: '#1c1917',
                borderRadius: '0.75rem',
                fontWeight: 500,
                border: '1px solid rgba(231, 229, 228, 1)',
                cursor: 'pointer',
                opacity: isResetting ? 0.6 : 1,
              }}
            >
              {isResetting
                ? t('error.localDbResetInProgress', 'Resetting...')
                : t('error.localDbReset', 'Reset local database')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the full system context.
 * Throws if used outside SystemProvider.
 */
export function useSystem(): SystemContextValue {
  const ctx = useContext(SystemContext);
  if (!ctx) {
    throw new Error('useSystem must be used within SystemProvider');
  }
  return ctx;
}

/**
 * Get the full system context if available.
 * Returns null when rendered outside SystemProvider (e.g. during HMR/error remounts).
 */
export function useOptionalSystem(): SystemContextValue | null {
  return useContext(SystemContext);
}

/**
 * Get current app lifecycle state.
 */
export function useAppState(): AppLifecycleState {
  return useSystem().appState;
}

/**
 * Get current app lifecycle state if SystemProvider is available.
 */
export function useOptionalAppState(): AppLifecycleState | null {
  return useOptionalSystem()?.appState ?? null;
}

/**
 * Check if app is ready for user interaction.
 */
export function useIsReady(): boolean {
  return useSystem().isReady;
}

/**
 * Get network connectivity info.
 */
export function useNetwork(): NetworkInfo {
  return useSystem().network;
}

/**
 * Check if currently online.
 */
export function useIsOnline(): boolean {
  return useSystem().isOnline;
}

/**
 * Get the session manager.
 */
export function useSessionManager(): GameSessionManagerPort {
  return useSystem().sessionManager;
}

/**
 * Get the injected adapters.
 * Returns adapters created via explicit PersistencePort injection.
 */
export function useAdapters(): InfraAdapters {
  return useSystem().adapters;
}

/**
 * Get the persistence port for direct DB access.
 * Use for session recovery and other low-level operations.
 * Returns null if persistence is not yet initialized.
 */
export function usePersistence(): PersistencePort | null {
  return useSystem().persistence;
}

export function useCommandBus(): import('@neurodual/logic').CommandBusPort | null {
  return useSystem().commandBus;
}
