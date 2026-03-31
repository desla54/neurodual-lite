import type { PlatformInfo } from '../db/platform-detector';
import { isCapacitorNative } from '../db/platform-detector';
import type { WebPowerSyncVfs } from './types';

export const POWERSYNC_VFS_PREF_KEY = 'neurodual_powersync_vfs_pref_v1';
const POWERSYNC_VFS_PREF_TTL_MS = 24 * 60 * 60 * 1000;
const IDB_PREFERENCE_COOLDOWN_MS = 10 * 60 * 1000;

const MOBILE_BROWSER_UA_RE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

export type PowerSyncStorageErrorKind = 'permission' | 'quota' | 'lock' | 'opfs-io' | 'unknown';

export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other';

export interface PowerSyncBrowserContext {
  browser: BrowserFamily;
  isMobileBrowser: boolean;
  hasSharedWorker: boolean;
}

function uniq(values: WebPowerSyncVfs[]): WebPowerSyncVfs[] {
  return [...new Set(values)];
}

export interface PowerSyncVfsPreferenceEntry {
  vfs: WebPowerSyncVfs;
  at: number;
  /**
   * Optional debugging fields (best-effort).
   * Not relied upon for control flow.
   */
  reason?: string;
  errorKind?: PowerSyncStorageErrorKind;
}

export function getPowerSyncErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function classifyPowerSyncStorageError(error: unknown): PowerSyncStorageErrorKind {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name === 'notallowederror' || name === 'securityerror') return 'permission';
    if (name === 'quotaexceedederror') return 'quota';
    if (name === 'invalidstateerror' || name === 'aborterror') return 'lock';
    // WebKit OPFS can raise TypeMismatchError when a file handle is opened against
    // a path that previously became a directory (or vice versa).
    if (name === 'typemismatcherror') return 'opfs-io';
    if (name === 'nomodificationallowederror' || name === 'notreadableerror') return 'opfs-io';
    if (name === 'unknownerror') {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('syncaccesshandle') ||
        msg.includes('filesystemaccesshandle') ||
        msg.includes('unable to open database file') ||
        msg.includes('incompatible with handle type') ||
        msg.includes('opfs')
      ) {
        return 'opfs-io';
      }
    }
  }

  const msg = getPowerSyncErrorMessage(error).toLowerCase();
  if (
    msg.includes('notallowederror') ||
    msg.includes('securityerror') ||
    msg.includes('permission denied')
  ) {
    return 'permission';
  }
  if (msg.includes('quota') || msg.includes('storage full')) return 'quota';
  if (
    msg.includes('lock timeout') ||
    msg.includes('timed out') ||
    msg.includes('database is locked')
  ) {
    return 'lock';
  }
  if (
    msg.includes('disk i/o error') ||
    msg.includes('nomodificationallowederror') ||
    msg.includes('notreadableerror') ||
    msg.includes('filesystemsyncaccesshandle') ||
    msg.includes('filesystemaccesshandle') ||
    msg.includes('createsyncaccesshandle') ||
    msg.includes('syncaccesshandle is closed') ||
    msg.includes('incompatible with handle type') ||
    msg.includes('unable to open opfs database file') ||
    msg.includes('unable to open database file') ||
    msg.includes('opfs')
  ) {
    return 'opfs-io';
  }
  return 'unknown';
}

export function isLikelyOpfsIoError(error: unknown): boolean {
  const kind = classifyPowerSyncStorageError(error);
  return kind === 'opfs-io';
}

export function isLikelyClosedPowerSyncError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'InvalidStateError') {
    return true;
  }

  const msg = getPowerSyncErrorMessage(error).toLowerCase();
  return (
    msg === 'closed' ||
    msg.includes('closed') ||
    msg.includes('invalid state') ||
    msg.includes('syncaccesshandle is closed') ||
    msg.includes('database is closing') ||
    msg.includes('cannot acquire lock')
  );
}

export function isLikelyFatalPowerSyncStorageError(error: unknown): boolean {
  const kind = classifyPowerSyncStorageError(error);
  if (kind === 'permission' || kind === 'quota' || kind === 'opfs-io') return true;

  const msg = getPowerSyncErrorMessage(error).toLowerCase();
  return msg.includes('database disk image is malformed');
}

export function shouldTryFallbackVfs(
  webVfs: WebPowerSyncVfs,
  error: unknown,
  browserContext?: PowerSyncBrowserContext,
): boolean {
  if (webVfs === 'idb') return false;
  const kind = classifyPowerSyncStorageError(error);
  if (kind === 'permission' || kind === 'quota' || kind === 'opfs-io') return true;
  if (kind !== 'lock') return false;

  // Safari iOS can leave transient OPFS/Web Locks contention after suspend/resume.
  // On mobile Safari multi-tab sync is disabled by policy, so falling back to IDB is safer than hard fail.
  return browserContext?.browser === 'safari' && browserContext.isMobileBrowser;
}

export function readPowerSyncVfsPreference(now = Date.now()): WebPowerSyncVfs | null {
  return readPowerSyncVfsPreferenceEntry(now)?.vfs ?? null;
}

export function readPowerSyncVfsPreferenceEntry(
  now = Date.now(),
): PowerSyncVfsPreferenceEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POWERSYNC_VFS_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      vfs?: WebPowerSyncVfs;
      at?: number;
      reason?: unknown;
      errorKind?: unknown;
    };
    if (!parsed || (parsed.vfs !== 'opfs' && parsed.vfs !== 'opfs-pool' && parsed.vfs !== 'idb'))
      return null;
    if (typeof parsed.at !== 'number') return null;
    if (now - parsed.at > POWERSYNC_VFS_PREF_TTL_MS) return null;
    return {
      vfs: parsed.vfs,
      at: parsed.at,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      errorKind:
        parsed.errorKind === 'permission' ||
        parsed.errorKind === 'quota' ||
        parsed.errorKind === 'lock' ||
        parsed.errorKind === 'opfs-io' ||
        parsed.errorKind === 'unknown'
          ? parsed.errorKind
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writePowerSyncVfsPreference(entry: PowerSyncVfsPreferenceEntry): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      POWERSYNC_VFS_PREF_KEY,
      JSON.stringify({
        vfs: entry.vfs,
        at: entry.at,
        reason: entry.reason,
        errorKind: entry.errorKind,
      }),
    );
  } catch {
    // ignore storage errors
  }
}

export function clearPowerSyncVfsPreference(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(POWERSYNC_VFS_PREF_KEY);
  } catch {
    // ignore storage errors
  }
}

function detectBrowserFamily(userAgent: string): BrowserFamily {
  if (/Firefox\//i.test(userAgent)) return 'firefox';
  if (/Chrome\//i.test(userAgent) || /Edg\//i.test(userAgent)) return 'chromium';
  if (/Safari\//i.test(userAgent)) return 'safari';
  return 'other';
}

export function getPowerSyncBrowserContext(): PowerSyncBrowserContext {
  const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '';
  return {
    browser: detectBrowserFamily(userAgent),
    isMobileBrowser: !isCapacitorNative() && MOBILE_BROWSER_UA_RE.test(userAgent),
    hasSharedWorker:
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as unknown as { SharedWorker?: unknown }).SharedWorker !== 'undefined',
  };
}

export function defaultWebVfsFromStorage(
  storageType: PlatformInfo['storageType'],
): WebPowerSyncVfs {
  if (storageType === 'opfs') return 'opfs';
  if (storageType === 'opfs-pool') return 'opfs-pool';
  return 'idb';
}

export function buildWebVfsCandidateOrder(args: {
  preferredVfs: WebPowerSyncVfs | null;
  detectedDefaultVfs: WebPowerSyncVfs;
  allowOpfsPoolFallback: boolean;
}): WebPowerSyncVfs[] {
  const base: WebPowerSyncVfs[] = [];
  if (args.preferredVfs) {
    base.push(args.preferredVfs);
  }
  base.push(args.detectedDefaultVfs);

  if (args.allowOpfsPoolFallback) {
    if (args.detectedDefaultVfs === 'opfs') {
      base.push('opfs-pool');
    }
  }

  base.push('idb');
  return uniq(base);
}

export function shouldPreferIdbFirstForCooldown(
  entry: PowerSyncVfsPreferenceEntry | null,
  now = Date.now(),
): boolean {
  if (!entry) return false;
  if (entry.vfs !== 'idb') return false;
  return now - entry.at < IDB_PREFERENCE_COOLDOWN_MS;
}

export function resolvePowerSyncFlags(
  webVfs: WebPowerSyncVfs,
  browserContext = getPowerSyncBrowserContext(),
): { enableMultiTabs: boolean; useWebWorker: true } {
  const canUseMultiTabs =
    browserContext.hasSharedWorker &&
    !browserContext.isMobileBrowser &&
    browserContext.browser !== 'firefox' &&
    webVfs === 'opfs';
  return {
    enableMultiTabs: canUseMultiTabs,
    useWebWorker: true,
  };
}

export async function probeOpfsAccess(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof navigator === 'undefined') {
    return { ok: false, reason: 'navigator unavailable' };
  }
  const getDirectory = navigator.storage?.getDirectory;
  if (typeof getDirectory !== 'function') {
    return { ok: false, reason: 'navigator.storage.getDirectory unavailable' };
  }

  try {
    const root = await getDirectory.call(navigator.storage);
    const probeName = `.neurodual-opfs-probe-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    const handle = await root.getFileHandle(probeName, { create: true });
    const writable = await handle.createWritable();
    await writable.write('ok');
    await writable.close();
    try {
      await root.removeEntry(probeName);
    } catch {
      // Best effort cleanup only.
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: getPowerSyncErrorMessage(error) };
  }
}

export function markPowerSyncFallbackToIdb(error?: unknown): void {
  writePowerSyncVfsPreference({
    vfs: 'idb',
    at: Date.now(),
    reason: 'fatal-storage-error',
    errorKind: classifyPowerSyncStorageError(error),
  });
}
