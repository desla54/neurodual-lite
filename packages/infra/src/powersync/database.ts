/**
 * PowerSync Database Singleton
 *
 * Creates and manages the PowerSync database instance.
 * Platform-aware initialization:
 * - Native iOS/Android: @powersync/capacitor with native SQLite
 * - Web Desktop: wa-sqlite with OPFS
 * - Web Mobile: wa-sqlite with IndexedDB fallback
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

import { createPowerSyncDatabase, getPowerSyncPlatformInfo } from './platform';
import {
  buildWebVfsCandidateOrder,
  classifyPowerSyncStorageError,
  clearPowerSyncVfsPreference,
  defaultWebVfsFromStorage,
  getPowerSyncBrowserContext,
  getPowerSyncErrorMessage,
  probeOpfsAccess,
  readPowerSyncVfsPreferenceEntry,
  shouldTryFallbackVfs,
  shouldPreferIdbFirstForCooldown,
  writePowerSyncVfsPreference,
} from './runtime-policy';
import type { WebPowerSyncVfs } from './types';
import {
  getOpfsSupportDiagnostics,
  getPlatformInfo,
  type OpfsSupportDiagnostics,
} from '../db/platform-detector';
import { powerSyncLog } from '../logger';

/**
 * HMR-safe singleton stored on globalThis.
 * Module-level singletons get reset during hot reload; storing on globalThis prevents re-opening
 * the DB (which can be expensive and can cause schema races in dev).
 */
interface PowerSyncGlobal {
  __NEURODUAL_POWERSYNC_DB__?: AbstractPowerSyncDatabase | null;
  __NEURODUAL_POWERSYNC_INIT_PROMISE__?: Promise<AbstractPowerSyncDatabase> | null;
  __NEURODUAL_POWERSYNC_RUNTIME__?: PowerSyncRuntimeState;
}
const getGlobal = () => globalThis as typeof globalThis & PowerSyncGlobal;
const POWERSYNC_RUNTIME_KEY = 'neurodual_powersync_runtime_v1';

interface PowerSyncRuntimeEntry {
  at: string;
  phase: string;
  detail: string;
}

interface PowerSyncRuntimeMemoryStats {
  sampledAt: string;
  reason: string;
  jsHeapUsedMb: number | null;
  jsHeapLimitMb: number | null;
  storageUsageMb: number | null;
  storageQuotaMb: number | null;
  deviceMemoryGb: number | null;
}

interface PowerSyncRuntimeLifecycleStats {
  hiddenCount: number;
  visibleCount: number;
  pagehideCount: number;
  pageshowCount: number;
  onlineCount: number;
  lastHiddenAt: string | null;
  lastVisibleAt: string | null;
  lastPageHideAt: string | null;
  lastPageShowAt: string | null;
  lastOnlineAt: string | null;
  lastBackgroundDurationMs: number | null;
  maxBackgroundDurationMs: number | null;
}

interface PowerSyncRuntimeReconnectStats {
  attempts: number;
  successes: number;
  failures: number;
  lastReason: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

interface PowerSyncRuntimeSyncGate {
  desiredEnabled: boolean;
  supabaseConfigured: boolean;
  isAuthed: boolean;
  hasCloudSync: boolean;
  forceEnable: boolean;
  instanceGuardEnabled: boolean;
  instanceAllowsSync: boolean;
  instanceRole: 'leader' | 'follower' | 'acquiring' | 'disabled';
  userPresent: boolean;
  blockedReason:
    | 'supabase-not-configured'
    | 'not-authenticated'
    | 'no-cloud-sync'
    | 'secondary-tab'
    | 'instance-guard-blocked'
    | null;
}

interface PowerSyncRuntimeState {
  updatedAt: string;
  selectedVfs: WebPowerSyncVfs | 'native' | null;
  platform: string;
  browser: string | null;
  iosWeb: boolean;
  preferredVfs: WebPowerSyncVfs | null;
  candidates: WebPowerSyncVfs[];
  events: PowerSyncRuntimeEntry[];
  lifecycle: PowerSyncRuntimeLifecycleStats;
  reconnect: PowerSyncRuntimeReconnectStats;
  syncGate: PowerSyncRuntimeSyncGate | null;
  memory: PowerSyncRuntimeMemoryStats | null;
  opfsDiagnostics: OpfsSupportDiagnostics | null;
}

export type { PowerSyncRuntimeState };

export function getPowerSyncRuntimeState(): PowerSyncRuntimeState | null {
  const g = getGlobal();
  if (g.__NEURODUAL_POWERSYNC_RUNTIME__) return g.__NEURODUAL_POWERSYNC_RUNTIME__;

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(POWERSYNC_RUNTIME_KEY);
      if (!raw) return null;
      return withRuntimeDefaults(JSON.parse(raw) as Partial<PowerSyncRuntimeState>);
    } catch {
      return null;
    }
  }

  return null;
}

function toRuntimeDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createDefaultLifecycleStats(): PowerSyncRuntimeLifecycleStats {
  return {
    hiddenCount: 0,
    visibleCount: 0,
    pagehideCount: 0,
    pageshowCount: 0,
    onlineCount: 0,
    lastHiddenAt: null,
    lastVisibleAt: null,
    lastPageHideAt: null,
    lastPageShowAt: null,
    lastOnlineAt: null,
    lastBackgroundDurationMs: null,
    maxBackgroundDurationMs: null,
  };
}

function createDefaultReconnectStats(): PowerSyncRuntimeReconnectStats {
  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    lastReason: null,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastDurationMs: null,
    lastError: null,
  };
}

function withRuntimeDefaults(
  previous?: Partial<PowerSyncRuntimeState> | undefined,
): PowerSyncRuntimeState {
  return {
    updatedAt: previous?.updatedAt ?? new Date().toISOString(),
    selectedVfs: previous?.selectedVfs ?? null,
    platform: previous?.platform ?? 'unknown',
    browser: previous?.browser ?? null,
    iosWeb: previous?.iosWeb ?? false,
    preferredVfs: previous?.preferredVfs ?? null,
    candidates: previous?.candidates ?? [],
    events: previous?.events ?? [],
    lifecycle: {
      ...createDefaultLifecycleStats(),
      ...(previous?.lifecycle ?? {}),
    },
    reconnect: {
      ...createDefaultReconnectStats(),
      ...(previous?.reconnect ?? {}),
    },
    syncGate: previous?.syncGate ?? null,
    memory: previous?.memory ?? null,
    opfsDiagnostics: previous?.opfsDiagnostics ?? null,
  };
}

function updatePowerSyncRuntime(
  updater: (previous: PowerSyncRuntimeState | undefined) => PowerSyncRuntimeState,
): void {
  const g = getGlobal();
  const previous = g.__NEURODUAL_POWERSYNC_RUNTIME__ ?? getPowerSyncRuntimeState() ?? undefined;
  const next = withRuntimeDefaults(updater(previous));
  g.__NEURODUAL_POWERSYNC_RUNTIME__ = next;
  if (typeof window !== 'undefined') {
    (
      window as Window & {
        __NEURODUAL_POWERSYNC_RUNTIME__?: PowerSyncRuntimeState;
      }
    ).__NEURODUAL_POWERSYNC_RUNTIME__ = next;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(POWERSYNC_RUNTIME_KEY, JSON.stringify(next));
    } catch {
      // Ignore private mode / quota failures.
    }
  }
}

function appendPowerSyncRuntimeEvent(
  phase: string,
  detail: unknown,
  patch?: Partial<Omit<PowerSyncRuntimeState, 'events' | 'updatedAt'>>,
): void {
  updatePowerSyncRuntime((previous) => {
    const base = withRuntimeDefaults(previous);
    const events = [...base.events];
    events.push({
      at: new Date().toISOString(),
      phase,
      detail: toRuntimeDetail(detail),
    });
    if (events.length > 120) {
      events.splice(0, events.length - 120);
    }
    return {
      updatedAt: new Date().toISOString(),
      selectedVfs: patch?.selectedVfs ?? base.selectedVfs,
      platform: patch?.platform ?? base.platform,
      browser: patch?.browser ?? base.browser,
      iosWeb: patch?.iosWeb ?? base.iosWeb,
      preferredVfs: patch?.preferredVfs ?? base.preferredVfs,
      candidates: patch?.candidates ?? base.candidates,
      events,
      lifecycle: patch?.lifecycle ?? base.lifecycle,
      reconnect: patch?.reconnect ?? base.reconnect,
      syncGate: patch?.syncGate ?? base.syncGate,
      memory: patch?.memory ?? base.memory,
      opfsDiagnostics: patch?.opfsDiagnostics ?? base.opfsDiagnostics,
    };
  });
}

function pushPowerSyncRuntimeEvent(
  base: PowerSyncRuntimeState,
  phase: string,
  detail: unknown,
): PowerSyncRuntimeEntry[] {
  const events = [...base.events];
  events.push({
    at: new Date().toISOString(),
    phase,
    detail: toRuntimeDetail(detail),
  });
  if (events.length > 120) {
    events.splice(0, events.length - 120);
  }
  return events;
}

function roundMegabytes(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round((value / (1024 * 1024)) * 10) / 10;
}

function getNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

let memorySampleInFlight: Promise<void> | null = null;
let lastMemorySampleAtMs = 0;

export function recordPowerSyncLifecycleSignal(
  signal: 'hidden' | 'visible' | 'pagehide' | 'pageshow' | 'online',
): void {
  const nowIso = new Date().toISOString();
  updatePowerSyncRuntime((previous) => {
    const base = withRuntimeDefaults(previous);
    const lifecycle = { ...base.lifecycle };
    let detail: string = signal;

    if (signal === 'hidden') {
      lifecycle.hiddenCount += 1;
      lifecycle.lastHiddenAt = nowIso;
    } else if (signal === 'visible') {
      lifecycle.visibleCount += 1;
      lifecycle.lastVisibleAt = nowIso;
      if (lifecycle.lastHiddenAt) {
        const durationMs = Date.parse(nowIso) - Date.parse(lifecycle.lastHiddenAt);
        if (Number.isFinite(durationMs) && durationMs >= 0) {
          lifecycle.lastBackgroundDurationMs = durationMs;
          lifecycle.maxBackgroundDurationMs =
            lifecycle.maxBackgroundDurationMs == null
              ? durationMs
              : Math.max(lifecycle.maxBackgroundDurationMs, durationMs);
          detail = `${signal} backgroundMs=${durationMs}`;
        }
      }
    } else if (signal === 'pagehide') {
      lifecycle.pagehideCount += 1;
      lifecycle.lastPageHideAt = nowIso;
    } else if (signal === 'pageshow') {
      lifecycle.pageshowCount += 1;
      lifecycle.lastPageShowAt = nowIso;
    } else if (signal === 'online') {
      lifecycle.onlineCount += 1;
      lifecycle.lastOnlineAt = nowIso;
    }

    return {
      ...base,
      updatedAt: nowIso,
      lifecycle,
      events: pushPowerSyncRuntimeEvent(base, `lifecycle:${signal}`, detail),
    };
  });
}

export function recordPowerSyncReconnectStart(reason: string): void {
  const nowIso = new Date().toISOString();
  updatePowerSyncRuntime((previous) => {
    const base = withRuntimeDefaults(previous);
    const reconnect = {
      ...base.reconnect,
      attempts: base.reconnect.attempts + 1,
      lastReason: reason,
      lastStartedAt: nowIso,
      lastCompletedAt: null,
      lastDurationMs: null,
      lastError: null,
    };
    return {
      ...base,
      updatedAt: nowIso,
      reconnect,
      events: pushPowerSyncRuntimeEvent(base, 'reconnect:start', reason),
    };
  });
}

export function recordPowerSyncReconnectResult(
  reason: string,
  result: { ok: true } | { ok: false; error: unknown },
): void {
  const nowIso = new Date().toISOString();
  updatePowerSyncRuntime((previous) => {
    const base = withRuntimeDefaults(previous);
    const reconnect = { ...base.reconnect };
    const startedAt = reconnect.lastStartedAt ? Date.parse(reconnect.lastStartedAt) : null;
    const completedAt = Date.parse(nowIso);
    const durationMs =
      startedAt != null && Number.isFinite(startedAt) ? Math.max(0, completedAt - startedAt) : null;
    reconnect.lastReason = reason;
    reconnect.lastCompletedAt = nowIso;
    reconnect.lastDurationMs = durationMs;
    if (result.ok) {
      reconnect.successes += 1;
      reconnect.lastError = null;
    } else {
      reconnect.failures += 1;
      reconnect.lastError = toRuntimeDetail(result.error);
    }
    return {
      ...base,
      updatedAt: nowIso,
      reconnect,
      events: pushPowerSyncRuntimeEvent(
        base,
        result.ok ? 'reconnect:success' : 'reconnect:failure',
        result.ok
          ? `${reason}${durationMs !== null ? ` durationMs=${durationMs}` : ''}`
          : `${reason}: ${toRuntimeDetail(result.error)}`,
      ),
    };
  });
}

export function recordPowerSyncSyncGate(syncGate: PowerSyncRuntimeSyncGate): void {
  updatePowerSyncRuntime((previous) => {
    const base = withRuntimeDefaults(previous);
    return {
      ...base,
      updatedAt: new Date().toISOString(),
      syncGate,
    };
  });
}

export function samplePowerSyncRuntimeMemory(
  reason: string,
  options?: { force?: boolean },
): Promise<void> {
  const nowMs = getNowMs();
  if (!options?.force && memorySampleInFlight) {
    return memorySampleInFlight;
  }
  if (!options?.force && nowMs - lastMemorySampleAtMs < 3000) {
    return Promise.resolve();
  }
  lastMemorySampleAtMs = nowMs;
  memorySampleInFlight = (async () => {
    type PerformanceWithMemory = Performance & {
      memory?: {
        usedJSHeapSize?: number;
        jsHeapSizeLimit?: number;
      };
    };

    const perf = typeof performance !== 'undefined' ? (performance as PerformanceWithMemory) : null;
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number })
        : null;

    let storageUsageMb: number | null = null;
    let storageQuotaMb: number | null = null;
    try {
      const estimate = await nav?.storage?.estimate?.();
      storageUsageMb = roundMegabytes(estimate?.usage ?? null);
      storageQuotaMb = roundMegabytes(estimate?.quota ?? null);
    } catch {
      // ignore
    }

    const memory: PowerSyncRuntimeMemoryStats = {
      sampledAt: new Date().toISOString(),
      reason,
      jsHeapUsedMb: roundMegabytes(perf?.memory?.usedJSHeapSize ?? null),
      jsHeapLimitMb: roundMegabytes(perf?.memory?.jsHeapSizeLimit ?? null),
      storageUsageMb,
      storageQuotaMb,
      deviceMemoryGb: nav?.deviceMemory ?? null,
    };

    updatePowerSyncRuntime((previous) => ({
      ...withRuntimeDefaults(previous),
      updatedAt: memory.sampledAt,
      memory,
    }));
  })().finally(() => {
    memorySampleInFlight = null;
  });
  return memorySampleInFlight;
}

function isIOSWebUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const classicIOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadDesktopUa = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  return classicIOS || iPadDesktopUa;
}

function isIosForceIndexedDbEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('ios_idb') === '1';
  } catch {
    return false;
  }
}

/**
 * Initialize the PowerSync database.
 *
 * `PowerSyncDatabase` can be used offline/local-only without connecting to a backend.
 * Use `connectPowerSyncDatabase()` (or `initPowerSyncDatabase()` for compatibility)
 * when auth + entitlement allow cloud sync.
 *
 * @returns The PowerSync database instance
 */
export async function openPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  const g = getGlobal();
  // Return existing instance if already initialized
  if (g.__NEURODUAL_POWERSYNC_DB__) {
    return g.__NEURODUAL_POWERSYNC_DB__;
  }

  // Prevent concurrent initializations
  if (g.__NEURODUAL_POWERSYNC_INIT_PROMISE__) {
    return g.__NEURODUAL_POWERSYNC_INIT_PROMISE__;
  }

  g.__NEURODUAL_POWERSYNC_INIT_PROMISE__ = (async () => {
    try {
      const startTime = performance.now();
      const platformInfo = getPowerSyncPlatformInfo();
      powerSyncLog.info(`Opening database (${platformInfo.platform})...`);
      powerSyncLog.info(`Storage: ${platformInfo.description}`);

      const preferredEntry = readPowerSyncVfsPreferenceEntry();
      const preferredVfs = preferredEntry?.vfs ?? null;
      const browserContext = getPowerSyncBrowserContext();
      appendPowerSyncRuntimeEvent(
        'open-start',
        `platform=${platformInfo.platform} preferred=${preferredVfs ?? 'none'}`,
        {
          platform: platformInfo.platform,
          browser: browserContext.browser,
          preferredVfs,
          selectedVfs: null,
          candidates: [],
        },
      );

      // Timeout for db.init() to detect hung OPFS locks (e.g., stale tab holding lock)
      // PowerSync has lockTimeout for transactions but NOT for init()
      const INIT_TIMEOUT_MS = 30_000;

      const createAndInit = async (webVfs?: WebPowerSyncVfs) => {
        const createStart = performance.now();
        const db = await createPowerSyncDatabase(webVfs ? { webVfs } : undefined);
        const createDuration = performance.now() - createStart;
        if (createDuration > 500) {
          console.warn(
            `[PowerSync] ⚠️ createPowerSyncDatabase(${webVfs ?? 'auto'}) took ${createDuration.toFixed(0)}ms`,
          );
        }

        const initStart = performance.now();

        // Race between init and timeout to avoid silent hangs
        const initPromise = db.init();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                'Database initialization timed out. Another browser tab may be holding a lock. ' +
                  'Please close other NeuroDual tabs and reload this page.',
              ),
            );
          }, INIT_TIMEOUT_MS);
        });

        await Promise.race([initPromise, timeoutPromise]);

        const initDuration = performance.now() - initStart;
        if (initDuration > 500) {
          console.warn(`[PowerSync] ⚠️ db.init() took ${initDuration.toFixed(0)}ms`);
        }
        return db;
      };

      let db: AbstractPowerSyncDatabase | null = null;
      if (platformInfo.platform === 'web') {
        const storageInfo = getPlatformInfo();
        const opfsDiagnostics = getOpfsSupportDiagnostics();
        const iosWeb = isIOSWebUserAgent();
        const forceIdbForIosWeb = iosWeb && isIosForceIndexedDbEnabled();

        const defaultVfs = forceIdbForIosWeb
          ? 'idb'
          : iosWeb && opfsDiagnostics.hasOPFS
            ? 'opfs'
            : defaultWebVfsFromStorage(storageInfo.storageType);

        const now = Date.now();
        const preferIdbFirstForCooldown =
          !forceIdbForIosWeb && !iosWeb && shouldPreferIdbFirstForCooldown(preferredEntry, now);

        // iOS web: avoid getting stuck on a persisted "idb" preference during tests.
        // Always try the detected default first, then fall back.
        const effectivePreferredVfs = forceIdbForIosWeb
          ? preferredVfs === 'idb'
            ? 'idb'
            : null
          : iosWeb
            ? null
            : preferredVfs === 'idb'
              ? preferIdbFirstForCooldown
                ? 'idb'
                : null
              : preferredVfs;

        if (iosWeb && !forceIdbForIosWeb && preferredVfs) {
          clearPowerSyncVfsPreference();
        }

        if (forceIdbForIosWeb && preferredVfs && preferredVfs !== 'idb') {
          clearPowerSyncVfsPreference();
          powerSyncLog.warn(
            `[PowerSync] iOS force-IDB enabled - ignoring VFS preference "${preferredVfs}"`,
          );
        }

        const candidates = buildWebVfsCandidateOrder({
          preferredVfs: effectivePreferredVfs,
          detectedDefaultVfs: defaultVfs,
          allowOpfsPoolFallback:
            !forceIdbForIosWeb &&
            opfsDiagnostics.hasSyncAccessHandle &&
            storageInfo.storageType !== 'indexeddb',
        });
        appendPowerSyncRuntimeEvent(
          'opfs-diagnostics',
          `supported=${opfsDiagnostics.supported} hasOPFS=${opfsDiagnostics.hasOPFS} hasWebLocks=${opfsDiagnostics.hasWebLocks} hasBroadcastChannel=${opfsDiagnostics.hasBroadcastChannel} hasSyncAccessHandle=${opfsDiagnostics.hasSyncAccessHandle} isWindow=${opfsDiagnostics.isWindow} iosWeb=${opfsDiagnostics.isIOSWeb}`,
          {
            opfsDiagnostics,
          },
        );
        appendPowerSyncRuntimeEvent(
          'candidate-order',
          `default=${defaultVfs} storedPreferred=${preferredVfs ?? 'none'} effectivePreferred=${effectivePreferredVfs ?? 'none'} candidates=${candidates.join(' -> ')}`,
          {
            iosWeb,
            candidates,
            preferredVfs,
            opfsDiagnostics,
          },
        );

        powerSyncLog.info(
          `[PowerSync] Browser=${browserContext.browser} mobile=${browserContext.isMobileBrowser} iosWeb=${iosWeb} forceIdb=${forceIdbForIosWeb} vfsCandidates=${candidates.join(' -> ')}`,
        );

        let openedVfs: WebPowerSyncVfs | null = null;
        let lastError: unknown = null;
        let didFallbackFromOpfs = false;
        let lastOpfsFailure: unknown = null;

        for (const candidate of candidates) {
          appendPowerSyncRuntimeEvent('candidate-start', candidate);
          if (candidate !== 'idb') {
            const probe = await probeOpfsAccess();
            if (!probe.ok) {
              lastError = new Error(probe.reason);
              didFallbackFromOpfs = true;
              lastOpfsFailure = lastError;
              powerSyncLog.warn(
                `[PowerSync] OPFS probe failed for ${candidate}, skipping to next candidate: ${probe.reason}`,
              );
              appendPowerSyncRuntimeEvent(
                'candidate-opfs-probe-failed',
                `${candidate}: ${probe.reason}`,
              );
              continue;
            }
          }

          try {
            db = await createAndInit(candidate);
            openedVfs = candidate;
            appendPowerSyncRuntimeEvent('candidate-opened', candidate, {
              selectedVfs: candidate,
            });
            break;
          } catch (error) {
            lastError = error;
            if (candidate !== 'idb') {
              didFallbackFromOpfs = true;
              lastOpfsFailure = error;
            }
            appendPowerSyncRuntimeEvent(
              'candidate-open-failed',
              `${candidate}: ${getPowerSyncErrorMessage(error)}`,
            );
            if (!shouldTryFallbackVfs(candidate, error, browserContext)) {
              throw error;
            }
            powerSyncLog.warn(
              `[PowerSync] VFS ${candidate} init failed, trying fallback: ${getPowerSyncErrorMessage(error)}`,
            );
          }
        }

        if (!openedVfs) {
          throw lastError instanceof Error
            ? lastError
            : new Error(lastError ? String(lastError) : 'No web storage backend available');
        }

        if (openedVfs === 'opfs') {
          clearPowerSyncVfsPreference();
        } else if (openedVfs === 'idb') {
          // Avoid refreshing an old "idb" preference on every successful IDB open.
          // Only persist an "idb" preference when we attempted OPFS and had to fall back.
          if (didFallbackFromOpfs) {
            writePowerSyncVfsPreference({
              vfs: 'idb',
              at: Date.now(),
              reason: 'opfs-fallback',
              errorKind: lastOpfsFailure
                ? classifyPowerSyncStorageError(lastOpfsFailure)
                : undefined,
            });
          }
        } else {
          writePowerSyncVfsPreference({ vfs: openedVfs, at: Date.now() });
        }
        appendPowerSyncRuntimeEvent('open-success', `selected=${openedVfs}`, {
          selectedVfs: openedVfs,
          iosWeb,
        });
      } else {
        db = await createAndInit(undefined);
        appendPowerSyncRuntimeEvent('open-success', 'selected=native', { selectedVfs: 'native' });
      }

      if (!db) {
        throw new Error('PowerSync database initialization did not return an instance');
      }

      const totalDuration = performance.now() - startTime;
      if (totalDuration > 1000) {
        console.warn(`[PowerSync] ⚠️ Total DB open time: ${totalDuration.toFixed(0)}ms`);
      }
      powerSyncLog.info(`Database opened successfully (${totalDuration.toFixed(0)}ms)`);
      g.__NEURODUAL_POWERSYNC_DB__ = db;
      // Expose for debugging in dev
      if (typeof window !== 'undefined') {
        (window as unknown as { __POWERSYNC_DB__: typeof db }).__POWERSYNC_DB__ = db;
        // SQL query logging: enable with `window.__ND_SQL_LOG__ = true` in DevTools
        installSqlQueryLogger(db);
      }
      return db;
    } catch (error) {
      console.error('[PowerSync] Failed to open database:', error);
      appendPowerSyncRuntimeEvent('open-failed', getPowerSyncErrorMessage(error));
      g.__NEURODUAL_POWERSYNC_INIT_PROMISE__ = null;
      throw error;
    }
  })();

  return g.__NEURODUAL_POWERSYNC_INIT_PROMISE__;
}

/**
 * Connect PowerSync to the backend (enables sync).
 * Requires a configured backend connector and an authenticated user.
 */
export async function connectPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  // Cloud sync removed in Lite — just open the local database
  const db = await openPowerSyncDatabase();
  return db;
  // Dead code below kept for reference
  const connector = null as any;
  const startedAt = getNowMs();
  appendPowerSyncRuntimeEvent('connect-start', 'connectPowerSyncDatabase');
  try {
    const { SyncClientImplementation } = await import('@powersync/web');
    const { isCapacitorNative } = await import('../db/platform-detector');

    // Use sequential fetch strategy on mobile/Capacitor to prevent WebSocket keepalive
    // failures on low-end devices. Buffered mode (default) can accumulate sync messages
    // faster than the device can process them, causing keepalive timeouts.
    const isMobile =
      isCapacitorNative() ||
      (typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? ''));

    // Use Rust sync client for significantly faster sync performance
    await db.connect(connector, {
      clientImplementation: SyncClientImplementation.RUST,
      // FetchStrategy enum is not re-exported from @powersync/web; runtime value "sequential" matches.
      // biome-ignore lint/suspicious/noExplicitAny: FetchStrategy enum not exported from @powersync/web
      ...(isMobile ? { fetchStrategy: 'sequential' as any } : {}),
    });
    appendPowerSyncRuntimeEvent(
      'connect-success',
      `durationMs=${Math.round(getNowMs() - startedAt)} mobile=${String(isMobile)}`,
    );
    void samplePowerSyncRuntimeMemory('connect-success');
    powerSyncLog.info(
      `Connected to sync service (Rust client${isMobile ? ', sequential fetch' : ''})`,
    );
  } catch (error) {
    console.error('[PowerSync] Failed to connect to sync service:', error);
    appendPowerSyncRuntimeEvent('connect-failed', getPowerSyncErrorMessage(error));
    void samplePowerSyncRuntimeMemory('connect-failed', { force: true });
    throw error;
  }
  return db;
}

/**
 * Backwards-compatible name: initializes (opens) + connects.
 */
export async function initPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  return connectPowerSyncDatabase();
}

/**
 * Get the PowerSync database instance.
 *
 * @throws Error if database is not initialized
 * @returns The PowerSync database instance
 */
export function getPowerSyncDatabase(): AbstractPowerSyncDatabase {
  const db = getGlobal().__NEURODUAL_POWERSYNC_DB__ ?? null;
  if (!db) {
    throw new Error('PowerSync database not initialized. Call openPowerSyncDatabase() first.');
  }
  return db;
}

/**
 * Check if PowerSync database is initialized
 */
export function isPowerSyncInitialized(): boolean {
  return (getGlobal().__NEURODUAL_POWERSYNC_DB__ ?? null) !== null;
}

/**
 * Close the PowerSync database.
 * Call this on logout or when the user session ends.
 */
export async function closePowerSyncDatabase(): Promise<void> {
  const g = getGlobal();
  const db = g.__NEURODUAL_POWERSYNC_DB__ ?? null;
  if (db) {
    appendPowerSyncRuntimeEvent('close-start', 'closePowerSyncDatabase');
    try {
      powerSyncLog.info('Closing database...');
      await db.disconnect();
      await db.close();
      g.__NEURODUAL_POWERSYNC_DB__ = null;
      g.__NEURODUAL_POWERSYNC_INIT_PROMISE__ = null;
      // supabase-connector removed in Lite
      appendPowerSyncRuntimeEvent('close-success', 'closePowerSyncDatabase');
      void samplePowerSyncRuntimeMemory('close-success', { force: true });
      powerSyncLog.info('Database closed');
    } catch (error) {
      appendPowerSyncRuntimeEvent('close-failed', getPowerSyncErrorMessage(error));
      void samplePowerSyncRuntimeMemory('close-failed', { force: true });
      throw error;
    }
  }
}

/**
 * Disconnect PowerSync but keep the database open.
 * Useful for temporary offline mode or auth token refresh.
 */
export async function disconnectPowerSync(): Promise<void> {
  const db = getGlobal().__NEURODUAL_POWERSYNC_DB__ ?? null;
  if (!db) return;

  // Avoid calling into SDK disconnect path when already offline.
  // On some runtimes this can still trigger costly internal work.
  const status = db as unknown as { connected?: unknown; connecting?: unknown };
  const isConnected = status.connected === true || status.connecting === true;
  if (!isConnected) {
    powerSyncLog.debug('disconnectPowerSync skipped: already disconnected');
    appendPowerSyncRuntimeEvent('disconnect-skipped', 'already disconnected');
    return;
  }

  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  appendPowerSyncRuntimeEvent('disconnect-start', 'disconnectPowerSync');
  try {
    await db.disconnect();
    const durationMs =
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) - startedAt;
    if (durationMs > 500) {
      powerSyncLog.warn(`[PowerSync] disconnect() took ${Math.round(durationMs)}ms`);
    }
    appendPowerSyncRuntimeEvent('disconnect-success', `durationMs=${Math.round(durationMs)}`);
    void samplePowerSyncRuntimeMemory('disconnect-success');
    powerSyncLog.info('Disconnected from sync service');
  } catch (error) {
    appendPowerSyncRuntimeEvent('disconnect-failed', getPowerSyncErrorMessage(error));
    void samplePowerSyncRuntimeMemory('disconnect-failed', { force: true });
    throw error;
  }
}

/**
 * Reconnect PowerSync after disconnect.
 * Useful after auth token refresh or coming back online.
 */
export async function reconnectPowerSync(): Promise<void> {
  // Cloud sync removed in Lite — reconnect is a no-op
}

// =============================================================================
// Dev: SQL query logging
// =============================================================================

declare global {
  interface Window {
    __ND_SQL_LOG__?: boolean;
  }
}

/**
 * Monkey-patches db.execute and db.getAll to log SQL queries when
 * `window.__ND_SQL_LOG__ = true` is set in DevTools.
 * Logs: duration, SQL (truncated), param count, and row count.
 */
function installSqlQueryLogger(db: AbstractPowerSyncDatabase): void {
  const origExecute = db.execute.bind(db);
  const origGetAll = db.getAll.bind(db);

  // biome-ignore lint/suspicious/noExplicitAny: wrapping generic PowerSync API
  (db as any).execute = async (sql: string, params?: unknown[]) => {
    if (!window.__ND_SQL_LOG__) return origExecute(sql, params);
    const t0 = performance.now();
    const result = await origExecute(sql, params);
    const ms = performance.now() - t0;
    const rows = (result as { rows?: { length?: number } })?.rows?.length ?? '?';
    console.log(
      `%c[SQL] %c${ms.toFixed(1)}ms%c ${sql.slice(0, 120)}${sql.length > 120 ? '…' : ''} %c(params=${params?.length ?? 0} rows=${rows})`,
      'color:#8b5cf6;font-weight:bold',
      ms > 50 ? 'color:red;font-weight:bold' : 'color:#10b981',
      'color:inherit',
      'color:#6b7280',
    );
    return result;
  };

  // biome-ignore lint/suspicious/noExplicitAny: wrapping generic PowerSync API
  (db as any).getAll = async (sql: string, params?: unknown[]) => {
    if (!window.__ND_SQL_LOG__) return origGetAll(sql, params);
    const t0 = performance.now();
    const result = await origGetAll(sql, params);
    const ms = performance.now() - t0;
    const rows = Array.isArray(result) ? result.length : '?';
    console.log(
      `%c[SQL] %c${ms.toFixed(1)}ms%c ${sql.slice(0, 120)}${sql.length > 120 ? '…' : ''} %c(params=${params?.length ?? 0} rows=${rows})`,
      'color:#8b5cf6;font-weight:bold',
      ms > 50 ? 'color:red;font-weight:bold' : 'color:#10b981',
      'color:inherit',
      'color:#6b7280',
    );
    return result;
  };

  console.info('[SQL Logger] Installed — enable with: window.__ND_SQL_LOG__ = true');
}

// =============================================================================
// Dev: HMR safety
// =============================================================================

// PowerSync/wa-sqlite init is expensive and OPFS allows only one write-lock at a time.
// The globalThis singleton pattern above already ensures the new module reuses the
// existing DB instance after HMR. Do NOT close/reopen the DB on hot reload — the async
// close races with the sync open check, leaving the new module waiting for the OPFS lock
// the old instance hasn't released yet (~4s freeze from Atomics.wait retries).
