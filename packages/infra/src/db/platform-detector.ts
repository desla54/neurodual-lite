/**
 * Platform Detector for SQLite Driver Selection
 *
 * Detects the appropriate SQLite driver based on the runtime environment:
 *
 * | Platform          | Driver                        | Storage           |
 * |-------------------|-------------------------------|-------------------|
 * | Capacitor Native  | @capacitor-community/sqlite   | Library/ (exempt) |
 * | Web (OPFS ok)     | wa-sqlite + OPFS              | OPFS (fast)       |
 * | Web (OPFS blocked)| wa-sqlite + IDBBatchAtomicVFS | IndexedDB         |
 *
 * Note: Cross-origin isolation (COOP/COEP) is required for SharedArrayBuffer / WASM threads,
 * but OPFS VFS selection does not depend on COI.
 * Priority: Native > OPFS > IDB
 */

/**
 * SQLite platform types
 *
 * - capacitor-native: Native SQLite via Capacitor (iOS/Android apps)
 * - wa-sqlite-opfs: OPFS (OPFSCoopSyncVFS) - fast, multi-connection friendly
 * - wa-sqlite-opfs-pool: OPFS (AccessHandlePoolVFS) - simpler OPFS fallback
 * - wa-sqlite-idb: IndexedDB fallback (IDBBatchAtomicVFS)
 */
export type SQLitePlatform =
  | 'capacitor-native'
  | 'wa-sqlite-opfs'
  | 'wa-sqlite-opfs-pool'
  | 'wa-sqlite-idb';

/**
 * Platform detection result with metadata
 */
export interface PlatformInfo {
  platform: SQLitePlatform;
  isNative: boolean;
  storageType: 'native' | 'opfs' | 'opfs-pool' | 'indexeddb';
  description: string;
}

export interface OpfsSupportDiagnostics {
  hasOPFS: boolean;
  hasWebLocks: boolean;
  hasBroadcastChannel: boolean;
  hasSyncAccessHandle: boolean;
  isWindow: boolean;
  isChromium: boolean;
  isFirefox: boolean;
  isTauriDesktop: boolean;
  isIOSWeb: boolean;
  iosOpfsAllowed: boolean;
  iosForceIdb: boolean;
  supported: boolean;
}

/**
 * Detect the best SQLite platform for the current environment
 *
 * Priority order:
 * 1. Capacitor native (iOS/Android apps)
 * 2. OPFS coop (OPFSCoopSyncVFS) - best default when available
 * 3. OPFS pool (AccessHandlePoolVFS) - fallback when coop requirements aren't met
 * 4. IndexedDB (IDBBatchAtomicVFS) - universal fallback
 *
 * @returns The platform identifier for driver selection
 */
export function detectSQLitePlatform(): SQLitePlatform {
  // 1. Check for Capacitor native platform first
  if (isCapacitorNative()) {
    return 'capacitor-native';
  }

  // 2. Prefer OPFSCoopSyncVFS when available
  if (isOPFSSupported()) {
    return 'wa-sqlite-opfs';
  }

  // 3. Fall back to AccessHandlePoolVFS when coop requirements aren't met
  if (isOPFSPoolSupported()) {
    return 'wa-sqlite-opfs-pool';
  }

  // 4. Fallback to IDB (older browsers, incognito mode)
  return 'wa-sqlite-idb';
}

/**
 * Get detailed platform information
 *
 * @returns Platform info with metadata
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = detectSQLitePlatform();

  switch (platform) {
    case 'capacitor-native':
      return {
        platform,
        isNative: true,
        storageType: 'native',
        description: 'Native SQLite via Capacitor plugin (Library/ storage, ITP exempt)',
      };
    case 'wa-sqlite-opfs':
      return {
        platform,
        isNative: false,
        storageType: 'opfs',
        description: 'wa-sqlite with OPFSCoopSyncVFS (OPFS + SyncAccessHandle)',
      };
    case 'wa-sqlite-opfs-pool':
      return {
        platform,
        isNative: false,
        storageType: 'opfs-pool',
        description: 'wa-sqlite with AccessHandlePoolVFS (OPFS pooled SyncAccessHandles)',
      };
    case 'wa-sqlite-idb':
      return {
        platform,
        isNative: false,
        storageType: 'indexeddb',
        description: 'wa-sqlite with IDBBatchAtomicVFS (IndexedDB fallback)',
      };
  }
}

/**
 * Check if running on Capacitor native platform (iOS/Android app)
 */
export function isCapacitorNative(): boolean {
  // Check for Capacitor global
  if (typeof window === 'undefined') return false;

  // Modern Capacitor API
  const capacitor = (window as CapacitorWindow).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    return true;
  }

  // Fallback: check platform
  const platform = capacitor?.getPlatform?.();
  return platform === 'ios' || platform === 'android';
}

/**
 * Check if running in Tauri desktop environment
 * Tauri uses WebKitGTK on Linux which has incomplete OPFS support
 */
function isTauriDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  // Tauri injects __TAURI__ or __TAURI_INTERNALS__ global
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
}

/**
 * Check if running on Firefox
 * Firefox has OPFS support but exposes createSyncAccessHandle only in Workers
 */
function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Firefox/i.test(navigator.userAgent ?? '');
}

function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /Chrome|Chromium|Edg\//i.test(ua) && !/Firefox/i.test(ua);
}

/**
 * Check if running in an iOS/iPadOS browser (non-native web runtime).
 *
 * Why this exists:
 * - Even when OPFS-related APIs are present, iOS WebKit can still be unstable for
 *   long-lived OPFS + worker SQLite workloads.
 * - We prioritize reliability on iOS web by using IndexedDB directly.
 */
function isIOSWebBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const classicIOS = /iPhone|iPad|iPod/i.test(ua);
  // iPadOS desktop UA often reports as "Macintosh ... Mobile/...".
  const iPadDesktopUa = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  return classicIOS || iPadDesktopUa;
}

/**
 * Force IndexedDB on iOS (debug / escape hatch).
 * Enable by adding `?ios_idb=1` to the URL.
 */
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
 * Escape hatch: allow OPFS on iOS web.
 * Enable by adding `?ios_opfs=1` to the URL.
 */
function isIosAllowOpfsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('ios_opfs') === '1';
  } catch {
    return false;
  }
}

/**
 * Check if OPFS (Origin Private File System) is supported
 *
 * OPFS requires:
 * 1. navigator.storage.getDirectory() API
 * 2. FileSystemSyncAccessHandle support (createSyncAccessHandle)
 * 3. A window context (selection happens in the main thread; PowerSync runs the VFS in a worker)
 *
 * Desktop Chrome/Edge/Firefox support OPFS well.
 * iOS WebKit is intentionally forced to IndexedDB for stability.
 * Tauri/WebKitGTK on Linux does NOT support OPFS reliably.
 *
 * NOTE: Firefox only exposes createSyncAccessHandle in Web Workers, not the main thread.
 * Since PowerSync runs the VFS in a Worker, we trust OPFS is available on Firefox
 * if the basic OPFS API (getDirectory) is present.
 */
function isOPFSSupported(): boolean {
  return getOpfsSupportDiagnostics().supported;
}

export function getOpfsSupportDiagnostics(): OpfsSupportDiagnostics {
  if (typeof navigator === 'undefined') {
    return {
      hasOPFS: false,
      hasWebLocks: false,
      hasBroadcastChannel: false,
      hasSyncAccessHandle: false,
      isWindow: false,
      isChromium: false,
      isFirefox: false,
      isTauriDesktop: false,
      isIOSWeb: false,
      iosOpfsAllowed: false,
      iosForceIdb: false,
      supported: false,
    };
  }

  const tauriDesktop = isTauriDesktop();
  const isIosWeb = isIOSWebBrowser();
  const iosOpfsAllowed = isIosAllowOpfsEnabled();
  const iosForceIdb = isIosForceIndexedDbEnabled();
  const hasOPFS = typeof navigator.storage?.getDirectory === 'function';
  const hasWebLocks = typeof navigator.locks?.request === 'function';
  const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';
  const isWindow = typeof window !== 'undefined' && window === self;
  const isChromium = isChromiumBrowser();
  const isFirefoxBrowser = isFirefox();
  const hasSyncAccessHandle =
    isChromium ||
    isFirefoxBrowser ||
    (typeof FileSystemFileHandle !== 'undefined' &&
      typeof (FileSystemFileHandle.prototype as unknown as { createSyncAccessHandle?: unknown })
        .createSyncAccessHandle === 'function');

  const supported =
    !tauriDesktop &&
    !(isIosWeb && !iosOpfsAllowed) &&
    !(isIosWeb && iosForceIdb) &&
    hasOPFS &&
    hasWebLocks &&
    hasBroadcastChannel &&
    hasSyncAccessHandle &&
    isWindow;

  if (typeof console !== 'undefined' && !supported) {
    console.info('[Platform] OPFS check:', {
      hasOPFS,
      hasWebLocks,
      hasBroadcastChannel,
      hasSyncAccessHandle,
      isChromium,
      isFirefox: isFirefoxBrowser,
      isWindow,
      userAgent: navigator.userAgent?.substring(0, 50),
    });
  }

  return {
    hasOPFS,
    hasWebLocks,
    hasBroadcastChannel,
    hasSyncAccessHandle,
    isWindow,
    isChromium,
    isFirefox: isFirefoxBrowser,
    isTauriDesktop: tauriDesktop,
    isIOSWeb: isIosWeb,
    iosOpfsAllowed,
    iosForceIdb,
    supported,
  };
}

/**
 * Check if OPFS Pool VFS is supported (AccessHandlePoolVFS)
 *
 * This VFS uses OPFS with a pool of pre-opened SyncAccessHandles.
 * It can be a useful fallback when OPFSCoopSyncVFS requirements aren't met.
 *
 * Requirements:
 * - navigator.storage.getDirectory() API (OPFS)
 * - FileSystemSyncAccessHandle support (createSyncAccessHandle)
 * - Not running in incognito mode (OPFS disabled)
 * - Not Tauri (WebKitGTK has broken OPFS)
 *
 * Limitation: Designed around a fixed pool (capacity) and different trade-offs than OPFSCoopSyncVFS.
 */
function isOPFSPoolSupported(): boolean {
  if (typeof navigator === 'undefined') return false;

  // Tauri desktop (WebKitGTK) has broken OPFS
  if (isTauriDesktop()) {
    return false;
  }

  // Same policy as OPFSCoopSyncVFS: default to IndexedDB on iOS web unless opted-in.
  const isIosWeb = isIOSWebBrowser();
  if (isIosWeb && !isIosAllowOpfsEnabled()) return false;
  if (isIosWeb && isIosForceIndexedDbEnabled()) return false;

  // Check for OPFS API
  const hasOPFS = typeof navigator.storage?.getDirectory === 'function';
  const hasWebLocks = typeof navigator.locks?.request === 'function';

  // Check we're in a window context (not a worker)
  const isWindow = typeof window !== 'undefined' && window === self;

  // Check for FileSystemSyncAccessHandle support (needed by AccessHandlePoolVFS)
  // This is available in Safari iOS 16.4+ via the File System Access API
  const hasSyncAccessHandle =
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof (FileSystemFileHandle.prototype as unknown as { createSyncAccessHandle?: unknown })
      .createSyncAccessHandle === 'function';

  const supported = hasOPFS && hasWebLocks && isWindow && hasSyncAccessHandle;

  if (typeof console !== 'undefined' && !supported) {
    console.info('[Platform] OPFS Pool check:', {
      hasOPFS,
      hasWebLocks,
      isWindow,
      hasSyncAccessHandle,
      userAgent: navigator.userAgent?.substring(0, 50),
    });
  }

  return supported;
}

/**
 * Check if IndexedDB is available (should always be true in modern browsers)
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof indexedDB === 'undefined') return false;

  // Test if we can actually use IndexedDB
  try {
    const request = indexedDB.open('__test_idb__', 1);
    request.onerror = () => {
      /* ignore */
    };
    request.onsuccess = () => {
      request.result.close();
      indexedDB.deleteDatabase('__test_idb__');
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Type augmentation for Capacitor global
 */
interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    isPluginAvailable?: (name: string) => boolean;
  };
}

/**
 * Check if a specific Capacitor plugin is available
 */
export function isCapacitorPluginAvailable(pluginName: string): boolean {
  if (typeof window === 'undefined') return false;

  const capacitor = (window as CapacitorWindow).Capacitor;
  return capacitor?.isPluginAvailable?.(pluginName) ?? false;
}

/**
 * Get storage persistence status
 *
 * Requests persistent storage from the browser.
 * Native apps always have persistent storage.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  // Native apps always have persistent storage
  if (isCapacitorNative()) {
    return true;
  }

  // Some browsers support a separate "persisted" probe. Prefer it to avoid redundant requests.
  try {
    const isAlreadyPersisted = await navigator.storage?.persisted?.();
    if (isAlreadyPersisted === true) return true;
  } catch {
    // ignore
  }

  // Request persistent storage from browser
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Get storage quota information
 */
export async function getStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percent: number;
} | null> {
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 1;
      return {
        usage,
        quota,
        percent: (usage / quota) * 100,
      };
    } catch {
      return null;
    }
  }
  return null;
}
