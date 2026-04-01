import type { ReadModelSnapshot, Subscribable } from './reactive';
import type { SyncState } from './sync-port';

export interface PowerSyncRuntimeHealth {
  readonly selectedVfs: 'opfs' | 'opfs-pool' | 'idb' | 'native' | null;
  readonly preferredVfs: 'opfs' | 'opfs-pool' | 'idb' | null;
  readonly candidates: readonly ('opfs' | 'opfs-pool' | 'idb')[];
  readonly platform: string;
  readonly browser: string | null;
  readonly iosWeb: boolean;
  readonly updatedAt: string;
  readonly lastEvents: readonly { at: string; phase: string; detail: string }[];
  readonly opfsDiagnostics: {
    readonly hasOPFS: boolean;
    readonly hasWebLocks: boolean;
    readonly hasBroadcastChannel: boolean;
    readonly hasSyncAccessHandle: boolean;
    readonly isWindow: boolean;
    readonly isChromium: boolean;
    readonly isFirefox: boolean;
    readonly isTauriDesktop: boolean;
    readonly isIOSWeb: boolean;
    readonly iosOpfsAllowed: boolean;
    readonly iosForceIdb: boolean;
    readonly supported: boolean;
  } | null;
  readonly lifecycle: {
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
  };
  readonly memory: {
    readonly sampledAt: string;
    readonly reason: string;
    readonly jsHeapUsedMb: number | null;
    readonly jsHeapLimitMb: number | null;
    readonly storageUsageMb: number | null;
    readonly storageQuotaMb: number | null;
    readonly deviceMemoryGb: number | null;
  } | null;
}

export interface ProjectionHealth {
  readonly status: 'unavailable' | 'ok' | 'degraded' | 'error';
  readonly source: 'strict-cross-check' | 'unavailable';
  readonly endedSessions: number | null;
  readonly sessionSummaries: number | null;
  readonly missingSummaries: number | null;
  readonly orphanSummaries: number | null;
  readonly lastCheckedAt: string | null;
  readonly errorMessage: string | null;
}

export interface PersistenceHealthData {
  readonly persistenceStage: string | null;
  readonly sync: SyncState;
  readonly powerSync: PowerSyncRuntimeHealth | null;
  readonly projections: ProjectionHealth;
  readonly activeWatchSubscriptions: number;
}

export interface PersistenceHealthPort {
  watchHealth(): Subscribable<ReadModelSnapshot<PersistenceHealthData>>;

  /** Force an immediate refresh of computed health metrics. */
  refresh(): void;
}
