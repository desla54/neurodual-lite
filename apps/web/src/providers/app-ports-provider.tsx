import {
  audioAdapter,
  createPlatformInfoPort,
  createNoopInfraAdapters,
  devLoggerAdapter,
  diagnosticsAdapter,
  deepLinkAdapter,
  hapticAdapter,
  infraProbeAdapter,
  oauthCallbackAdapter,
  eventReaderFactoryAdapter,
  adminHistoryMaintenanceAdapter,
  sessionPipelineFactoryAdapter,
  persistenceHealthAdapter,
  freeSubscriptionAdapter,
  lemonSqueezyAdapter,
  createReplayInteractifAdapter,
  noopAuthAdapter,
  noopRewardAdapter,
  noopSubscriptionAdapter,
  noopSyncAdapter,
  powerSyncSyncAdapter,
  revenueCatAdapter,
  rewardAdapter,
  setupPersistence,
  supabaseAuthAdapter,
  supabaseSubscriptionAdapter,
  replayRecoveryAdapter,
  sessionRecoveryAdapter,
  settingsSyncAdapter,
  tutorialRecoveryAdapter,
  wakeLockAdapter,
  createXPContextAdapter,
  createReplayAdapterFromCommandBus,
  createInteractiveReplayAdapter,
  audioService,
} from '@neurodual/infra';
import type { InfraAdapters } from '@neurodual/infra';
import { featureFlags } from '../config/feature-flags';
import type {
  AudioPort,
  AdminHistoryMaintenancePort,
  AuthPort,
  ReplayPort,
  DeepLinkPort,
  DevLoggerPort,
  DiagnosticsPort,
  EventReaderFactoryPort,
  HapticPort,
  InfraProbePort,
  LicensePort,
  OAuthCallbackPort,
  PaymentPort,
  PersistencePort,
  PersistenceHealthPort,
  PlatformInfoPort,
  RewardPort,
  ReplayInteractifPort,
  SessionPipelineFactoryPort,
  InteractiveReplayLifecyclePort,
  ReplayRecoveryPort,
  SessionRecoveryPort,
  SettingsSyncPort,
  SubscriptionPort,
  TutorialRecoveryPort,
  SyncPort,
  WakeLockPort,
  XPContextPort,
} from '@neurodual/logic';
import { nullXPContextPort } from '@neurodual/logic';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SystemContext } from './system-provider';

export interface AudioDebugPort {
  init: () => Promise<void>;
  resume: () => Promise<boolean>;
  stopAll: () => void;
  schedule: (...args: unknown[]) => unknown;
  getConfig: () => unknown;
  setConfig: (config: Record<string, unknown>) => void;
  isReady: () => boolean;
  isAudioContextRunning: () => boolean;
  getAudioContextTimeSeconds: () => number | null;
  getTimingDiagnostics: () => unknown;
  isAutoVisualCalibrationEnabled: () => boolean;
  setAutoVisualCalibrationEnabled: (enabled: boolean) => void;
  resetAutoVisualCalibration: () => void;
}

export interface AppPorts {
  // System
  adapters: InfraAdapters;
  persistence: PersistencePort | null;
  hasSupabase: boolean;

  // TanStack Query adapters (ui)
  auth: AuthPort;
  subscription: SubscriptionPort;
  sync: SyncPort;
  reward: RewardPort;
  payment: PaymentPort;
  license?: LicensePort;

  // Common ports
  audio: AudioPort;
  wakeLock: WakeLockPort;
  haptic: HapticPort;
  platformInfo: PlatformInfoPort;
  devLogger: DevLoggerPort;
  xpContext: XPContextPort;

  replay: ReplayPort | null;
  createInteractiveReplayLifecycleAdapter: () => InteractiveReplayLifecyclePort;

  // Missing ports added by refactor
  sessionRecovery: SessionRecoveryPort;
  replayRecovery: ReplayRecoveryPort;
  tutorialRecovery: TutorialRecoveryPort;
  diagnostics: DiagnosticsPort;
  settingsSync: SettingsSyncPort;
  deepLink: DeepLinkPort;
  infraProbe: InfraProbePort;

  // Auth callback (PKCE code exchange)
  oauthCallback: OAuthCallbackPort;

  // Events
  eventReaderFactory: EventReaderFactoryPort;

  // Admin maintenance
  adminHistoryMaintenance: AdminHistoryMaintenancePort;

  // Session completion pipeline
  sessionPipelineFactory: SessionPipelineFactoryPort;

  // Health/diagnostics
  persistenceHealth: PersistenceHealthPort;

  // Replay (interactive)
  replayInteractif: ReplayInteractifPort;

  // Dev-only (avoid importing infra in leaf components)
  audioDebug: AudioDebugPort;
}

const AppPortsContext = createContext<AppPorts | null>(null);

export function AppPortsProvider({ children }: { children: ReactNode }): ReactNode {
  // During HMR/error recovery, Firefox can briefly remount this provider before SystemContext
  // is visible again. Keep AppPorts stable and wait for the next render instead of crashing.
  const systemCtx = useContext(SystemContext);
  const fallbackAdapters = useMemo(() => createNoopInfraAdapters(), []);
  const adapters = systemCtx?.adapters ?? fallbackAdapters;
  const persistence = systemCtx?.persistence ?? null;

  const hasSupabase = useMemo(() => infraProbeAdapter.isSupabaseConfigured(), []);

  const auth = useMemo<AuthPort>(
    () => (hasSupabase ? supabaseAuthAdapter : noopAuthAdapter),
    [hasSupabase],
  );

  const subscription = useMemo<SubscriptionPort>(() => {
    if (!featureFlags.premiumEnabled) return freeSubscriptionAdapter;
    return hasSupabase ? supabaseSubscriptionAdapter : noopSubscriptionAdapter;
  }, [hasSupabase]);

  const sync = useMemo<SyncPort>(
    () => (hasSupabase ? powerSyncSyncAdapter : noopSyncAdapter),
    [hasSupabase],
  );

  const reward = useMemo<RewardPort>(() => {
    if (!featureFlags.xpRewardsEnabled) return noopRewardAdapter;
    return hasSupabase ? rewardAdapter : noopRewardAdapter;
  }, [hasSupabase]);

  const payment = useMemo<PaymentPort>(() => revenueCatAdapter, []);
  const license = useMemo<LicensePort | undefined>(() => {
    return featureFlags.premiumEnabled && !featureFlags.nativeModeEnabled
      ? lemonSqueezyAdapter
      : undefined;
  }, []);

  const platformInfo = useMemo(() => createPlatformInfoPort(), []);

  const xpContext = useMemo<XPContextPort>(() => {
    // StatsHelpersPort is a sub-port exposed by PersistencePort.
    // When persistence isn't ready yet, fall back to the null implementation.
    if (!persistence) return nullXPContextPort;
    return createXPContextAdapter(persistence);
  }, [persistence]);

  const replay = useMemo<ReplayPort | null>(() => {
    // Use CommandBus for reading events from Emmett (faster, indexed)
    // Falls back to persistence for sessions not yet migrated
    return createReplayAdapterFromCommandBus(adapters.commandBus, persistence ?? undefined);
  }, [adapters.commandBus, persistence]);

  const replayInteractif = useMemo<ReplayInteractifPort>(() => {
    let inner: ReturnType<typeof createReplayInteractifAdapter> | null = null;
    const getInner = async () => {
      if (inner) return inner;
      const port = await setupPersistence();
      inner = createReplayInteractifAdapter(port);
      return inner;
    };

    const adapter: ReplayInteractifPort = {
      createRun: async (sessionId, parentRunId) =>
        (await getInner()).createRun(sessionId, parentRunId),
      getRun: async (runId) => (await getInner()).getRun(runId),
      getRunsForSession: async (sessionId) => (await getInner()).getRunsForSession(sessionId),
      completeRun: async (runId) => (await getInner()).completeRun(runId),
      deleteRun: async (runId) => (await getInner()).deleteRun(runId),
      canCreateRun: async (sessionId, parentRunId) =>
        (await getInner()).canCreateRun(sessionId, parentRunId),
      getNextDepth: async (sessionId, parentRunId) =>
        (await getInner()).getNextDepth(sessionId, parentRunId),
      getInProgressRun: async (sessionId) => (await getInner()).getInProgressRun(sessionId),
      appendEvent: async (event) => (await getInner()).appendEvent(event),
      appendEventsBatch: async (events) => (await getInner()).appendEventsBatch(events),
      getEventsForRun: async (runId) => (await getInner()).getEventsForRun(runId),
      getActiveEventsForRun: async (runId) => (await getInner()).getActiveEventsForRun(runId),
      getOrphanedRuns: async (olderThanMs) => (await getInner()).getOrphanedRuns(olderThanMs),
    };

    return adapter;
  }, []);

  const createInteractiveReplayLifecycleAdapter = useMemo(
    () => () => createInteractiveReplayAdapter(),
    [],
  );

  const audioDebug = useMemo<AudioDebugPort>(() => {
    return {
      init: () => audioService.init(),
      resume: () => audioService.resume(),
      stopAll: () => audioService.stopAll(),
      schedule: (...args) =>
        (audioService.schedule as unknown as (...a: unknown[]) => unknown)(...args),
      getConfig: () => audioService.getConfig(),
      setConfig: (config) => audioService.setConfig(config),
      isReady: () => audioService.isReady(),
      isAudioContextRunning: () => audioService.isAudioContextRunning(),
      getAudioContextTimeSeconds: () => audioService.getAudioContextTimeSeconds(),
      getTimingDiagnostics: () => audioService.getTimingDiagnostics(),
      isAutoVisualCalibrationEnabled: () => audioService.isAutoVisualCalibrationEnabled(),
      setAutoVisualCalibrationEnabled: (enabled) =>
        audioService.setAutoVisualCalibrationEnabled(enabled),
      resetAutoVisualCalibration: () => audioService.resetAutoVisualCalibration(),
    };
  }, []);

  const value = useMemo<AppPorts>(
    () => ({
      adapters,
      persistence,
      hasSupabase,
      auth,
      subscription,
      sync,
      reward,
      payment,
      license,
      audio: audioAdapter,
      wakeLock: wakeLockAdapter,
      haptic: hapticAdapter,
      platformInfo,
      devLogger: devLoggerAdapter,
      xpContext,
      replay,
      replayInteractif,
      createInteractiveReplayLifecycleAdapter,
      sessionRecovery: sessionRecoveryAdapter,
      replayRecovery: replayRecoveryAdapter,
      tutorialRecovery: tutorialRecoveryAdapter,
      diagnostics: diagnosticsAdapter,
      settingsSync: settingsSyncAdapter,
      deepLink: deepLinkAdapter,
      infraProbe: infraProbeAdapter,
      oauthCallback: oauthCallbackAdapter,
      eventReaderFactory: eventReaderFactoryAdapter,
      adminHistoryMaintenance: adminHistoryMaintenanceAdapter,
      sessionPipelineFactory: sessionPipelineFactoryAdapter,
      persistenceHealth: persistenceHealthAdapter,
      audioDebug,
    }),
    [
      adapters,
      persistence,
      hasSupabase,
      auth,
      subscription,
      sync,
      reward,
      payment,
      license,
      platformInfo,
      xpContext,
      replay,
      replayInteractif,
      createInteractiveReplayLifecycleAdapter,
      audioDebug,
    ],
  );

  return (
    <AppPortsContext.Provider value={value}>{systemCtx ? children : null}</AppPortsContext.Provider>
  );
}

export function useAppPorts(): AppPorts {
  const ctx = useContext(AppPortsContext);
  if (!ctx) {
    throw new Error('useAppPorts must be used within AppPortsProvider');
  }
  return ctx;
}
