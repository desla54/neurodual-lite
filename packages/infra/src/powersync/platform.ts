/**
 * PowerSync Platform Abstraction
 *
 * Provides platform-aware PowerSync database creation.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  CONFIGURATION VALIDÉE - NE PAS MODIFIER SANS RAISON MAJEURE            │
 * │                                                                             │
 * │ Cette configuration a été testée et validée sur toutes les plateformes.    │
 * │ Chaque paramètre est critique pour la stabilité et la performance.         │
 * │ Voir le tableau ci-dessous avant tout changement.                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * | Platform          | Package              | VFS   | WebWorker | Multi-tabs |
 * |-------------------|----------------------|-------|-----------|------------|
 * | iOS/Android natif | @powersync/capacitor | Native| N/A       | N/A        |
 * | Desktop Chrome    | @powersync/web       | OPFS  | ✅ true   | ✅ true    |
 * | Desktop Safari    | @powersync/web       | OPFS  | ✅ true   | ✅ true    |
 * | Mobile Safari/Chrome | @powersync/web    | OPFS* | ✅ true   | ❌ false   |
 * | Tauri Linux       | @powersync/web       | IDB   | ✅ true   | ❌ false   |
 * | Web sans COI      | @powersync/web       | IDB   | ✅ true   | Variable   |
 *
 * COI = Cross-Origin Isolated (COOP/COEP headers) — required for SharedArrayBuffer / WASM threads.
 * OPFS = Origin Private File System (fast; does not inherently require COI).
 * IDB = IndexedDB (fallback when OPFS unavailable).
 *
 * RÈGLES CRITIQUES:
 * - useWebWorker = true TOUJOURS (requis par OPFS, bénéfique pour IDB)
 * - enableMultiTabs = false sur mobile (SharedWorker non disponible)
 * - OPFS est utilise sur mobile ET desktop quand disponible (iOS WebKit inclus)
 * - En cas de probleme OPFS (probe/IO/lock), fallback automatique vers IDB
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

import {
  isCapacitorNative,
  getPlatformInfo,
  requestPersistentStorage,
} from '../db/platform-detector';
import { powerSyncLog } from '../logger';
import {
  defaultWebVfsFromStorage,
  getPowerSyncBrowserContext,
  resolvePowerSyncFlags,
} from './runtime-policy';
import type { PowerSyncPlatform, WebPowerSyncVfs } from './types';
export type { PowerSyncPlatform, WebPowerSyncVfs } from './types';

function isIOSWebUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const classicIOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadDesktopUa = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  return classicIOS || iPadDesktopUa;
}

function isDevBuild(): boolean {
  try {
    // Avoid coupling infra types to any specific bundler typing.
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Database filename
 */
const DB_FILENAME = 'neurodual-powersync.db';

/**
 * Detect which PowerSync platform to use
 */
export function detectPowerSyncPlatform(): PowerSyncPlatform {
  if (isCapacitorNative()) {
    return 'capacitor-native';
  }
  return 'web';
}

/**
 * Create a PowerSync database instance for the current platform.
 *
 * Uses @powersync/capacitor on native iOS/Android (native SQLite),
 * and @powersync/web on web platforms (wa-sqlite WASM).
 *
 * @returns A platform-appropriate PowerSync database instance
 */
export async function createPowerSyncDatabase(options?: {
  /**
   * Force the web VFS implementation.
   * - `opfs`: OPFSCoopSyncVFS (recommended when available)
   * - `idb`: IDBBatchAtomicVFS (fallback)
   */
  webVfs?: WebPowerSyncVfs;
  /**
   * Override default multi-tab behavior.
   * When omitted, runtime policy chooses based on browser + selected VFS.
   */
  enableMultiTabs?: boolean;
  /**
   * Keep true unless debugging low-level worker issues.
   */
  useWebWorker?: boolean;
}): Promise<AbstractPowerSyncDatabase> {
  const platform = detectPowerSyncPlatform();
  const platformInfo = getPlatformInfo();
  const { PowerSyncAppSchema } = await import('./schema');

  powerSyncLog.info(`Creating database for platform: ${platform}`);
  powerSyncLog.info(`Storage: ${platformInfo.description}`);

  if (platform === 'capacitor-native') {
    const { PowerSyncDatabase: CapacitorPowerSyncDatabase } = await import('@powersync/capacitor');
    // Use Capacitor-native SQLite for iOS/Android
    return new CapacitorPowerSyncDatabase({
      schema: PowerSyncAppSchema,
      database: {
        dbFilename: DB_FILENAME,
      },
    });
  }

  const browserContext = getPowerSyncBrowserContext();
  const isMobile = browserContext.isMobileBrowser;
  const debugMode = isDevBuild();

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️  CONFIGURATION CRITIQUE - VALIDÉE ET TESTÉE
  // ═══════════════════════════════════════════════════════════════════════════

  // VFS selection: OPFS when available, IDB fallback.
  const {
    PowerSyncDatabase: WebPowerSyncDatabase,
    WASQLiteOpenFactory,
    WASQLiteVFS,
  } = await import('@powersync/web');

  const requestedVfs = options?.webVfs;
  const defaultVfs = defaultWebVfsFromStorage(platformInfo.storageType);
  const webVfs: WebPowerSyncVfs = requestedVfs ?? defaultVfs;
  const policyFlags = resolvePowerSyncFlags(webVfs, browserContext);
  const enableMultiTabs = options?.enableMultiTabs ?? policyFlags.enableMultiTabs;
  const useWebWorker = options?.useWebWorker ?? policyFlags.useWebWorker;

  // ═══════════════════════════════════════════════════════════════════════════

  const flags = {
    enableMultiTabs,
    useWebWorker,
    // Broadcast logs from shared workers back to this tab (defaults true in SDK, but explicit here).
    broadcastLogs: debugMode,
    // Avoid PowerSync registering a deprecated `unload` listener internally.
    // When true, the app must handle cleanup itself (we do this via `pagehide`).
    externallyUnload: true,
    // Ensure we never emit SSR-mode warnings in the browser bundle.
    ssrMode: false,
  };

  // Request persistent storage to reduce eviction risk on iOS Safari / WebKit (ITP).
  // This may legitimately return false in dev or before the origin gains enough "user engagement".
  // (fire-and-forget, don't block init)
  if (isMobile && (browserContext.browser === 'safari' || isIOSWebUserAgent())) {
    requestPersistentStorage().then((persisted) => {
      if (persisted) {
        powerSyncLog.info('Persistent storage granted');
        return;
      }

      if (debugMode) {
        powerSyncLog.info('Persistent storage not granted (dev) - data may be evicted on Safari');
        return;
      }

      powerSyncLog.warn('Persistent storage not granted - data may be evicted');
    });
  }

  powerSyncLog.info(
    `Web config: VFS=${webVfs}, multiTabs=${enableMultiTabs}, webWorker=${useWebWorker}, mobile=${isMobile}, browser=${browserContext.browser}`,
  );

  // Safari iOS + IDB: prefer a less aggressive VFS variant when available.
  // WebKit can show runaway JIT/CPU and occasional crashes with heavy IDB+WASM workloads.
  // If the SDK doesn't expose the minimal VFS, fall back to the default batch atomic one.
  const idbVfs = (() => {
    if (!(webVfs === 'idb')) return null;
    if (!(browserContext.browser === 'safari' && isMobile && isIOSWebUserAgent())) {
      return WASQLiteVFS.IDBBatchAtomicVFS;
    }

    const maybeMinimal = (WASQLiteVFS as unknown as Record<string, unknown>)[
      'IDBMinimalVFS'
    ] as unknown;
    if (maybeMinimal) {
      powerSyncLog.warn('Using IDBMinimalVFS on iOS Safari (WebKit stability workaround)');
      return maybeMinimal as (typeof WASQLiteVFS)[keyof typeof WASQLiteVFS];
    }

    return WASQLiteVFS.IDBBatchAtomicVFS;
  })();

  // Map VFS option to PowerSync VFS enum
  const vfsMapping: Record<WebPowerSyncVfs, (typeof WASQLiteVFS)[keyof typeof WASQLiteVFS]> = {
    opfs: WASQLiteVFS.OPFSCoopSyncVFS,
    'opfs-pool': WASQLiteVFS.AccessHandlePoolVFS,
    idb: (idbVfs ??
      WASQLiteVFS.IDBBatchAtomicVFS) as (typeof WASQLiteVFS)[keyof typeof WASQLiteVFS],
  };

  const cacheSizeKb =
    browserContext.browser === 'safari' && isMobile && isIOSWebUserAgent()
      ? 8_000
      : isMobile
        ? 20_000
        : 50_000;

  return new WebPowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: new WASQLiteOpenFactory({
      dbFilename: DB_FILENAME,
      vfs: vfsMapping[webVfs],
      // Enables SQL timings in Performance timeline: entries named `[SQL] ...`.
      // Dev-only; adds overhead and should remain disabled in production builds.
      debugMode,
      // Cache size: critical for IDB performance.
      // Desktop: 50MB (large queries, ample RAM)
      // Mobile browser: 20MB (reduced to ease memory pressure on low-end devices)
      // See: https://www.powersync.com/blog/sqlite-persistence-on-the-web
      cacheSizeKb,
      flags,
    }),
    flags,
  });
}

/**
 * Get detailed information about the current PowerSync platform setup
 */
export function getPowerSyncPlatformInfo(): {
  platform: PowerSyncPlatform;
  storage: string;
  description: string;
} {
  const platform = detectPowerSyncPlatform();
  const sqliteInfo = getPlatformInfo();

  if (platform === 'capacitor-native') {
    return {
      platform,
      storage: 'native-sqlite',
      description: 'Native SQLite via @capacitor-community/sqlite (Library/ storage)',
    };
  }

  return {
    platform,
    storage: sqliteInfo.storageType,
    description: `wa-sqlite WASM with ${sqliteInfo.storageType.toUpperCase()} VFS`,
  };
}
