/**
 * PowerSync database stubs (NeuroDual Lite - cloud sync removed)
 *
 * The local SQLite database is managed via setup-persistence.ts.
 * These functions provide access to the singleton PowerSync DB instance.
 * In Lite mode, there is no cloud sync — only local SQLite.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

// ─── Singleton state ──────────────────────────────────────────────────────────

let _db: AbstractPowerSyncDatabase | null = null;

export function setPowerSyncDatabase(db: AbstractPowerSyncDatabase): void {
  _db = db;
}

export function getPowerSyncDatabase(): AbstractPowerSyncDatabase {
  if (!_db) throw new Error('[PowerSync] Database not initialized');
  return _db;
}

export function isPowerSyncInitialized(): boolean {
  return _db !== null;
}

/**
 * Opens (returns) the PowerSync database singleton.
 * In Lite mode this simply returns the previously-set database.
 */
export async function openPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  return getPowerSyncDatabase();
}

export async function closePowerSyncDatabase(): Promise<void> {
  if (_db) {
    try {
      await _db.close();
    } catch {
      // best-effort
    }
    _db = null;
  }
}

// ─── Runtime state ────────────────────────────────────────────────────────────

export interface PowerSyncRuntimeEvent {
  at: string;
  phase: string;
  detail: string;
}

export interface OpfsDiagnostics {
  readonly hasOPFS: boolean;
  readonly hasWebLocks: boolean;
  readonly hasBroadcastChannel: boolean;
  readonly hasSyncAccessHandle: boolean;
  readonly isWindow: boolean;
  readonly isChromium: boolean;
  [key: string]: unknown;
  readonly supported: boolean;
}

export interface LifecycleDiagnostics {
  readonly hiddenCount: number;
  readonly visibleCount: number;
  readonly pagehideCount: number;
  readonly pageshowCount: number;
  readonly onlineCount: number;
  readonly lastHiddenAt: string | null;
  readonly lastVisibleAt: string | null;
  readonly lastPageHideAt: string | null;
  readonly lastPageShowAt: string | null;
  readonly lastOnlineAt: string | null;
  readonly lastBackgroundDurationMs: number | null;
  readonly maxBackgroundDurationMs: number | null;
  [key: string]: unknown;
}

export interface ReconnectDiagnostics {
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly lastReason: string | null;
  readonly lastStartedAt: string | null;
  readonly lastCompletedAt: string | null;
  readonly lastDurationMs: number | null;
  readonly lastError: string | null;
}

export interface SyncGateDiagnostics {
  readonly desiredEnabled: boolean;
  readonly supabaseConfigured: boolean;
  readonly isAuthed: boolean;
  readonly hasCloudSync: boolean;
  readonly forceEnable: boolean;
  readonly instanceGuardEnabled: boolean;
  readonly instanceAllowsSync: boolean;
  readonly instanceRole: 'disabled' | 'leader' | 'follower' | 'acquiring';
  readonly userPresent: boolean;
  readonly blockedReason:
    | 'supabase-not-configured'
    | 'not-authenticated'
    | 'no-cloud-sync'
    | 'secondary-tab'
    | 'instance-guard-blocked'
    | null;
  [key: string]: unknown;
}

export interface MemoryDiagnostics {
  readonly sampledAt: string;
  readonly reason: string;
  readonly jsHeapUsedMb: number | null;
  readonly jsHeapLimitMb: number | null;
  readonly storageUsageMb: number | null;
  readonly storageQuotaMb: number | null;
  readonly deviceMemoryGb: number | null;
}

export type VfsType = 'opfs' | 'opfs-pool' | 'idb' | 'native';

export interface PowerSyncRuntimeState {
  selectedVfs: VfsType | null;
  preferredVfs: VfsType | null;
  candidates: VfsType[];
  platform: string;
  browser: string;
  iosWeb: boolean;
  updatedAt: string;
  events: PowerSyncRuntimeEvent[];
  opfsDiagnostics: OpfsDiagnostics | null;
  lifecycle: LifecycleDiagnostics;
  reconnect: ReconnectDiagnostics;
  syncGate: SyncGateDiagnostics;
  memory: MemoryDiagnostics | null;
}

let _runtimeState: PowerSyncRuntimeState | null = null;

export function getPowerSyncRuntimeState(): PowerSyncRuntimeState | null {
  return _runtimeState;
}

export function setPowerSyncRuntimeState(state: PowerSyncRuntimeState): void {
  _runtimeState = state;
}

export async function samplePowerSyncRuntimeMemory(
  _context: string,
  _opts?: { force?: boolean },
): Promise<void> {
  // No-op in Lite mode
}
