/**
 * Persistence Setup
 *
 * Initialise et expose UNE SEULE DB locale via PowerSync (SQLite).
 * Les sessions sont persistées directement via SessionWriter/DirectCommandBus.
 */

import type { PersistencePort } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { persistenceLog } from '../logger';
import { setSystemEventWriterPersistence } from '../events/system-event-writer';
import { createPowerSyncPersistenceAdapter } from '../powersync/powersync-persistence-adapter';
import {
  getSqlInstrumentationMode,
  instrumentPersistencePort,
  shouldInstrumentSql,
} from './instrumented-persistence';
import { runLocalDbMigrations } from './local-db-migrations';
import { wipeLocalDeviceData } from '../lifecycle/local-data-wipe';

const IS_DEV =
  typeof import.meta !== 'undefined' &&
  // @ts-expect-error - Vite specific
  import.meta.env?.DEV === true;

function isLocalhostRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

const DEBUG_FAIL_MIGRATION_KEY = 'neurodual:debug:failLocalDbMigration';
const DEBUG_RESET_PERSISTENCE_ON_HMR_KEY = 'neurodual:debug:resetPersistenceOnHmr';

function isDebugFailMigrationEnabled(): boolean {
  if (!IS_DEV) return false;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DEBUG_FAIL_MIGRATION_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function isDebugResetPersistenceOnHmrEnabled(): boolean {
  if (!IS_DEV) return false;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DEBUG_RESET_PERSISTENCE_ON_HMR_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

// =============================================================================
// Setup (HMR-resistant via globalThis)
// =============================================================================

// Extended port type with PowerSync-specific access
export type PowerSyncPersistencePort = PersistencePort & {
  getPowerSyncDb(): Promise<AbstractPowerSyncDatabase>;
};

// Type-safe accessor for globalThis extensions
interface PersistenceGlobal {
  __NEURODUAL_PERSISTENCE_INITIALIZED__?: boolean;
  __NEURODUAL_PERSISTENCE_PROMISE__?: Promise<void> | null;
  __NEURODUAL_PERSISTENCE_PORT__?: PowerSyncPersistencePort | null;
  __NEURODUAL_PERSISTENCE_STAGE__?: string | null;
  __NEURODUAL_PROJECTION_MAINTENANCE_SCHEDULED__?: boolean;
}
const getGlobal = () => globalThis as typeof globalThis & PersistenceGlobal;

const MIGRATION_AUTO_WIPE_KEY = 'neurodual:localDbMigration:autoWipeAttempted';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

function isFirefoxUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /Firefox\//i.test(ua);
}

function isIOSWebUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const classicIOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadDesktopUa = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  return classicIOS || iPadDesktopUa;
}

function getLocalDbInitTimeoutMs(): number {
  // 30s is occasionally not enough on low-end mobile devices (cold cache, storage warmup).
  // Keep a bound to still detect true hangs.
  if (isIOSWebUserAgent()) return 90_000;
  if (isFirefoxUserAgent() && isMobileUserAgent()) return 120_000;
  if (isFirefoxUserAgent()) return 60_000;
  if (isMobileUserAgent()) return 60_000;
  return 30_000;
}

function readAutoWipeMarker(): { at: number } | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(MIGRATION_AUTO_WIPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const at = (parsed as { at?: unknown } | null)?.at;
    return typeof at === 'number' && Number.isFinite(at) ? { at } : null;
  } catch {
    return null;
  }
}

function writeAutoWipeMarker(): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(MIGRATION_AUTO_WIPE_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // ignore
  }
}

async function hasAnyLocalOnlyData(_db: AbstractPowerSyncDatabase): Promise<boolean> {
  // Local-only mode: always assume data exists to be safe
  return true;
}

async function attemptMigrationAutoWipe(persistence: PowerSyncPersistencePort): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (readAutoWipeMarker()) return false;

  // Dev-only: when explicitly simulating a failure, never auto-wipe.
  if (isDebugFailMigrationEnabled()) return false;

  // Be conservative: never auto-wipe if we detect any local-only history.
  const db = await persistence.getPowerSyncDb();
  if (await hasAnyLocalOnlyData(db)) return false;

  // Cloud sync removed — no pending uploads to check.

  writeAutoWipeMarker();
  const wiped = await wipeLocalDeviceData();
  if (!wiped.success) return false;

  window.location.reload();
  return true;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let removeVisibilityListener: (() => void) | null = null;

  let rejectTimeout: (() => void) | null = null;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = () => reject(new Error(`${label} (timeout ${ms}ms)`));
  });

  // Firefox (and mobile browsers) can keep the JS context alive while freezing/suspending a tab.
  // If the DB init continues (or is paused) while the tab is hidden, we avoid timing out purely
  // due to background throttling by pausing the countdown until the tab is visible again.
  const doc = typeof document !== 'undefined' ? document : null;
  if (!rejectTimeout) {
    throw new Error('[Persistence] Timeout reject function not initialized');
  }

  if (!doc || typeof doc.addEventListener !== 'function') {
    timeoutId = setTimeout(rejectTimeout, ms);
  } else {
    let remainingMs = ms;
    let startedAt = Date.now();

    const startTimer = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (remainingMs <= 0) {
        rejectTimeout?.();
        return;
      }
      startedAt = Date.now();
      timeoutId = setTimeout(() => rejectTimeout?.(), remainingMs);
    };

    const pauseTimer = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = null;
      const elapsed = Date.now() - startedAt;
      remainingMs = Math.max(0, remainingMs - elapsed);
    };

    const onPause = () => {
      pauseTimer();
    };

    const onResume = () => {
      startTimer();
    };

    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') {
        onPause();
        return;
      }
      onResume();
    };

    doc.addEventListener('visibilitychange', onVisibility);
    // Page Lifecycle API (best-effort; not supported everywhere).
    // Helps when tabs are frozen/suspended without a timely visibilitychange.
    doc.addEventListener('freeze', onPause);
    doc.addEventListener('resume', onResume);
    window.addEventListener('pagehide', onPause);
    window.addEventListener('pageshow', onResume);
    removeVisibilityListener = () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('freeze', onPause);
      doc.removeEventListener('resume', onResume);
      window.removeEventListener('pagehide', onPause);
      window.removeEventListener('pageshow', onResume);
    };

    // Start immediately (even if hidden) so we have a baseline, then pause if needed.
    startTimer();
    if (doc.visibilityState === 'hidden') pauseTimer();
  }
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    removeVisibilityListener?.();
  }
}

/**
 * Get the PersistencePort.
 * Throws if called before setupPersistence() completes.
 */
export function getPersistencePort(): PersistencePort {
  const port = getGlobal().__NEURODUAL_PERSISTENCE_PORT__;
  if (!port) {
    throw new Error('PersistencePort not initialized. Call setupPersistence() first.');
  }
  return port;
}

/**
 * Initialise la DB locale (PowerSync SQLite) et expose le PersistencePort (Emmett only).
 * Doit être appelé au démarrage de l'app.
 *
 * Returns PersistencePort extended with PowerSync-specific access (getPowerSyncDb).
 */
export async function setupPersistence(): Promise<PowerSyncPersistencePort> {
  const g = getGlobal();

  // Already initialized - return existing port
  if (g.__NEURODUAL_PERSISTENCE_INITIALIZED__ && g.__NEURODUAL_PERSISTENCE_PORT__) {
    return g.__NEURODUAL_PERSISTENCE_PORT__;
  }

  // Wait for in-progress initialization
  if (g.__NEURODUAL_PERSISTENCE_PROMISE__) {
    await g.__NEURODUAL_PERSISTENCE_PROMISE__;
    if (!g.__NEURODUAL_PERSISTENCE_PORT__) {
      throw new Error('[Persistence] Port not initialized after promise resolved');
    }
    return g.__NEURODUAL_PERSISTENCE_PORT__;
  }

  g.__NEURODUAL_PERSISTENCE_PROMISE__ = (async () => {
    const totalStart = performance.now();
    const perf = {
      createPortMs: 0,
      initPortMs: 0,
      migrateDbMs: 0,
    };
    const initTimeoutMs = getLocalDbInitTimeoutMs();

    try {
      // 1. Create the PersistencePort (PowerSync-backed, single DB)
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'createPort';
      const createStart = performance.now();
      const rawPort = createPowerSyncPersistenceAdapter();
      const enableSqlInstrumentation = shouldInstrumentSql() && (IS_DEV || isLocalhostRuntime());
      const sqlInstrumentationMode = getSqlInstrumentationMode() ?? 'slow';
      const persistencePort = enableSqlInstrumentation
        ? instrumentPersistencePort(rawPort, {
            mode: sqlInstrumentationMode,
            label: 'SQL:port',
          })
        : rawPort;
      const createDuration = performance.now() - createStart;
      perf.createPortMs = createDuration;
      if (createDuration > 100) {
        console.warn(
          `[Persistence] ⚠️ createPowerSyncPersistenceAdapter took ${createDuration.toFixed(0)}ms`,
        );
      }
      g.__NEURODUAL_PERSISTENCE_PORT__ = persistencePort as PowerSyncPersistencePort;
      // Back-compat global slot used by older code paths.
      // NOTE: removed during Emmett strict migration.

      // 2. Initialize the port
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'initPort';
      persistenceLog.info('[Persistence] Initializing local database...');
      const initStart = performance.now();
      await withTimeout(
        persistencePort.init(),
        initTimeoutMs,
        '[Persistence] Local database init did not complete (stage=initPort)',
      );
      const initDuration = performance.now() - initStart;
      perf.initPortMs = initDuration;
      if (initDuration > 500) {
        console.warn(`[Persistence] ⚠️ persistencePort.init() took ${initDuration.toFixed(0)}ms`);
      }

      // 3. Run sequential local DB migrations before any adapters start reading.
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'migrateLocalDb';
      const migrateStart = performance.now();
      try {
        await withTimeout(
          runLocalDbMigrations(persistencePort),
          initTimeoutMs,
          '[Persistence] Local DB migration did not complete (stage=migrateLocalDb)',
        );

        // Dev-only: force an init error to validate recovery UI.
        if (isDebugFailMigrationEnabled()) {
          throw new Error('[Persistence] Debug: forced local DB migration failure');
        }
      } catch (error) {
        persistenceLog.error('[Persistence] Local DB migration failed', error);

        // Last-resort recovery: one-shot auto-wipe ONLY when we detect no local-only data.
        // If local-only history exists, callers should surface an explicit UI action instead.
        const didReload = await attemptMigrationAutoWipe(
          persistencePort as PowerSyncPersistencePort,
        );
        if (didReload) {
          // window.location.reload() is already in flight.
          throw new Error('[Persistence] Auto-wipe triggered after migration failure');
        }

        throw new Error(
          '[Persistence] Local database upgrade failed. ' +
            "If this persists, clear this site's storage (or use the in-app reset) and reload.",
        );
      } finally {
        perf.migrateDbMs = performance.now() - migrateStart;
      }

      // 4. Inject persistence for system event writer (removes global persistence dependency).
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'configurePorts';
      setSystemEventWriterPersistence(persistencePort);

      // Note: Projection maintenance (ProcessorEngine.ensureUpToDate) has been removed.
      // The DirectCommandBus now writes all read-model tables atomically at session end.

      g.__NEURODUAL_PERSISTENCE_INITIALIZED__ = true;
      // Avoid expensive full-table COUNT() at startup.
      // On large histories (and some WASM/OPFS backends), COUNT() can block the main thread for seconds.
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'ready';

      const totalDuration = performance.now() - totalStart;
      persistenceLog.debug('[Persistence][Perf] setup summary', {
        ...perf,
        totalMs: totalDuration,
      });
      if (totalDuration > 1000) {
        console.warn(`[Persistence] ⚠️ Total setup time: ${totalDuration.toFixed(0)}ms`);
      }
      persistenceLog.info(`Persistence ready (PowerSync SQLite) in ${totalDuration.toFixed(0)}ms`);
    } catch (error) {
      // Important for AppLifecycle "Retry": allow a fresh attempt after failures/timeouts.
      persistenceLog.error('[Persistence] setupPersistence failed', error);

      g.__NEURODUAL_PERSISTENCE_INITIALIZED__ = false;
      g.__NEURODUAL_PERSISTENCE_STAGE__ = 'failed';
      g.__NEURODUAL_PERSISTENCE_PROMISE__ = null;

      const port = g.__NEURODUAL_PERSISTENCE_PORT__ ?? null;
      g.__NEURODUAL_PERSISTENCE_PORT__ = null;
      try {
        await port?.close();
      } catch {
        // best-effort
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  })();

  await g.__NEURODUAL_PERSISTENCE_PROMISE__;
  if (!g.__NEURODUAL_PERSISTENCE_PORT__) {
    throw new Error('[Persistence] Port not initialized after promise resolved');
  }
  return g.__NEURODUAL_PERSISTENCE_PORT__;
}

// =============================================================================
// Helper pour supprimer une session
// =============================================================================

/**
 * Supprime tous les events d'une session.
 * Retourne le nombre d'events supprimés.
 */
export async function deleteSessionEvents(sessionId: string): Promise<number> {
  const port = getPersistencePort();
  return port.deleteSession(sessionId);
}

/**
 * Supprime tous les events de plusieurs sessions en une seule opération.
 * Retourne le nombre d'events supprimés.
 */
export async function deleteSessionEventsBatch(sessionIds: readonly string[]): Promise<number> {
  const port = getPersistencePort();
  return port.deleteSessions(sessionIds);
}

// =============================================================================
// Dev: HMR teardown
// =============================================================================

// Persistence singletons are cached on globalThis to survive HMR. In day-to-day dev this avoids
// re-opening OPFS/SQLite on every file save, which is otherwise very expensive and can look like
// random freezes unrelated to the code being edited.
//
// Escape hatch: set localStorage['neurodual:debug:resetPersistenceOnHmr']='1' when you explicitly
// want the old behavior and need to re-run full persistence init after each hot reload.
const hot = (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose(() => {
    if (!isDebugResetPersistenceOnHmrEnabled()) {
      return;
    }
    const g = getGlobal();
    const port = g.__NEURODUAL_PERSISTENCE_PORT__ ?? null;
    g.__NEURODUAL_PERSISTENCE_INITIALIZED__ = false;
    g.__NEURODUAL_PERSISTENCE_PROMISE__ = null;
    g.__NEURODUAL_PERSISTENCE_PORT__ = null;
    g.__NEURODUAL_PERSISTENCE_STAGE__ = 'hmr-disposed';
    void port?.close().catch(() => {
      // best-effort in dev
    });
  });
}
