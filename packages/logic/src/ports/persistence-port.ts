/**
 * PersistencePort
 *
 * Port unifié pour toutes les opérations de persistence.
 * Implémenté par PowerSyncPersistenceAdapter (prod/tests) dans infra.
 *
 * Cette interface définit le contrat pour l'accès à la base de données.
 * Le code applicatif utilise ce port sans connaître l'implémentation.
 */

import type { StreakInfo, DailyActivity } from '../types/history-types';
import type { SessionPlayContext } from '../engine/events';

// Re-export pour commodité
export type { StreakInfo, DailyActivity };

// =============================================================================
// Types pour les Events
// =============================================================================

export interface EventInput {
  readonly id: string;
  readonly sessionId: string;
  readonly userId?: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: Record<string, unknown>;
  readonly synced?: boolean;
  readonly updatedAt?: string | number;
  readonly deleted?: boolean;
}

export interface StoredEvent {
  readonly id: string;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted: boolean;
  readonly synced: boolean;
}

export interface EventQueryOptions {
  sessionId?: string;
  type?: string | string[];
  after?: number;
  before?: number;
}

export interface SessionSummariesOptions {
  /**
   * Include sessions with `reason = 'abandoned'`.
   * Default behavior is to exclude them (consistent with History/Profile).
   */
  includeAbandoned?: boolean;
}

// =============================================================================
// Types pour les Session Summaries
// =============================================================================

export interface SessionSummaryRow {
  readonly session_id: string;
  readonly user_id: string | null;
  readonly session_type: string;
  readonly created_at: string;
  readonly n_level: number;
  readonly duration_ms: number;
  readonly trials_count: number;
  readonly total_hits: number | null;
  readonly total_misses: number | null;
  readonly total_fa: number | null;
  readonly total_cr: number | null;
  readonly global_d_prime: number | null;
  readonly accuracy: number | null;
  readonly generator: string | null;
  readonly game_mode: string | null;
  readonly passed: boolean | null;
  readonly reason: string | null;
  readonly journey_stage_id: string | null;
  readonly journey_id: string | null;
  readonly play_context?: SessionPlayContext | null;
  readonly by_modality: Record<string, unknown>;
  /** Authoritative adaptive path stage progress for Dual Track journey projection. */
  readonly adaptive_path_progress_pct?: number | null;
  // Flow confidence metrics
  readonly flow_confidence_score: number | null;
  readonly flow_directness_ratio: number | null;
  readonly flow_wrong_slot_dwell_ms: number | null;
  // Recall/Memo confidence metrics
  readonly recall_confidence_score: number | null;
  readonly recall_fluency_score: number | null;
  readonly recall_corrections_count: number | null;
  // UPS metrics
  readonly ups_score: number | null;
  readonly ups_accuracy: number | null;
  readonly ups_confidence: number | null;
  // Timing metrics (for export/stats without events)
  readonly avg_response_time_ms: number | null;
  readonly median_response_time_ms: number | null;
  readonly response_time_std_dev: number | null;
  readonly avg_press_duration_ms: number | null;
  readonly press_duration_std_dev: number | null;
  readonly responses_during_stimulus: number | null;
  readonly responses_after_stimulus: number | null;
  // Focus metrics (tab/window visibility loss)
  readonly focus_lost_count: number | null;
  readonly focus_lost_total_ms: number | null;
  // XP breakdown (for historical display)
  readonly xp_breakdown: Record<string, unknown> | null;
  // Pre-computed worst modality error rate (0-100) for fast time series queries
  readonly worst_modality_error_rate: number | null;
  // Journey context (JSON) for historical display
  readonly journey_context: Record<string, unknown> | null;
  // Comma-separated input methods used (e.g. "keyboard,touch")
  readonly input_methods: string | null;
}

export interface SessionSummaryInput {
  readonly sessionId: string;
  readonly userId?: string;
  readonly sessionType:
    | 'tempo'
    | 'recall'
    | 'flow'
    | 'dual-pick'
    | 'trace'
    | 'time'
    | 'track'
    | 'corsi'
    | 'ospan'
    | 'running-span'
    | 'pasat'
    | 'swm'
    | 'cognitive-task'
    | 'imported';
  readonly createdAt: Date;
  readonly nLevel: number;
  readonly durationMs: number;
  readonly trialsCount: number;
  readonly totalHits?: number;
  readonly totalMisses?: number;
  readonly totalFa?: number;
  readonly totalCr?: number;
  readonly globalDPrime?: number;
  readonly accuracy?: number;
  readonly generator?: string;
  readonly gameMode?: string;
  readonly passed?: boolean;
  readonly reason?: string;
  readonly journeyStageId?: string;
  readonly journeyId?: string;
  readonly playContext?: SessionPlayContext;
  readonly byModality?: Record<string, unknown>;
  /** Authoritative adaptive path stage progress for Dual Track journey projection. */
  readonly adaptivePathProgressPct?: number;
  // Flow confidence metrics
  readonly flowConfidenceScore?: number;
  readonly flowDirectnessRatio?: number;
  readonly flowWrongSlotDwellMs?: number;
  // Recall/Memo confidence metrics
  readonly recallConfidenceScore?: number;
  readonly recallFluencyScore?: number;
  readonly recallCorrectionsCount?: number;
  // UPS metrics
  readonly upsScore?: number;
  readonly upsAccuracy?: number;
  readonly upsConfidence?: number;
  // Timing metrics (for export/stats without events)
  readonly avgResponseTimeMs?: number;
  readonly medianResponseTimeMs?: number;
  readonly responseTimeStdDev?: number;
  readonly avgPressDurationMs?: number;
  readonly pressDurationStdDev?: number;
  readonly responsesDuringStimulus?: number;
  readonly responsesAfterStimulus?: number;
  // Focus metrics (tab/window visibility loss)
  readonly focusLostCount?: number;
  readonly focusLostTotalMs?: number;
  // XP breakdown (for historical display)
  readonly xpBreakdown?: Record<string, unknown>;
  // Pre-computed worst modality error rate (0-100) for fast time series queries
  readonly worstModalityErrorRate?: number;
  // Journey context (JSON) for historical display
  readonly journeyContext?: Record<string, unknown>;
  // Comma-separated input methods used (e.g. "keyboard,touch")
  readonly inputMethods?: string;
  // OSpan absolute score (sum of spans for correctly recalled sets)
  readonly absoluteScore?: number;
}

// =============================================================================
// Types pour Algorithm State
// =============================================================================

export interface AlgorithmStateResult {
  stateJson: unknown;
  sessionCount: number;
}

export interface BadgeHistorySnapshot {
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly sessionsToday: number;
  readonly earlyMorningDays: number;
  readonly lateNightDays: number;
  readonly maxNLevel: number;
  readonly bestDPrime: number;
  readonly daysSinceLastSession: number | null;
}

// =============================================================================
// Transactions
// =============================================================================

export interface PersistenceWriteTransaction {
  /** Exécute une requête SQL d'écriture (INSERT, UPDATE, DELETE) dans une transaction */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** Exécute une requête SQL de lecture (SELECT) dans une transaction */
  query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// =============================================================================
// Focused Sub-Interfaces
// =============================================================================

/** Event store operations (read, delete events) */
export interface EventStorePort {
  getSession(sessionId: string): Promise<StoredEvent[]>;
  queryEvents(options: EventQueryOptions): Promise<StoredEvent[]>;
  all(): Promise<StoredEvent[]>;
  count(): Promise<number>;
  deleteSession(sessionId: string): Promise<number>;
  deleteSessions(sessionIds: readonly string[]): Promise<number>;
  clear(): Promise<void>;
}

/** Session summary CRUD */
export interface SessionSummaryStorePort {
  getSessionSummaries(
    userId: string | null,
    options?: SessionSummariesOptions,
  ): Promise<SessionSummaryRow[]>;
  insertSessionSummary(summary: SessionSummaryInput): Promise<void>;
  insertSessionSummaryFireAndForget(summary: SessionSummaryInput): void;
  deleteSessionSummary(sessionId: string): Promise<void>;
  insertSessionSummariesBatch(summaries: SessionSummaryInput[]): Promise<number>;
}

/** Raw SQL access for custom queries in adapters */
export interface SQLQueryPort {
  query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  writeTransaction<T>(fn: (tx: PersistenceWriteTransaction) => Promise<T>): Promise<T>;
}

/** User settings persistence */
export interface SettingsStorePort {
  getSettings(): Promise<Record<string, unknown> | null>;
  saveSettings(config: Record<string, unknown>): Promise<void>;
}

/** Algorithm state persistence (meta-learning) */
export interface AlgorithmStateStorePort {
  getAlgorithmState(userId: string, algorithmType: string): Promise<AlgorithmStateResult | null>;
  saveAlgorithmState(userId: string, algorithmType: string, stateJson: unknown): Promise<void>;
  clearAlgorithmStates(userId: string): Promise<void>;
}

/** Local key-value metadata (DB version tracking, migration state, etc.) */
export interface MetaStorePort {
  getSyncMeta(key: string): Promise<string | null>;
  setSyncMeta(key: string, value: string): Promise<void>;
}

/** Pending deletions queue for cross-device sync */
export interface PendingDeletionsPort {
  queueDeletion(sessionId: string): Promise<void>;
  hasPendingDeletions(): Promise<boolean>;
  getPendingDeletions(): Promise<string[]>;
  confirmDeletion(sessionId: string): Promise<void>;
}

/** Pre-computed stats helpers */
export interface StatsHelpersPort {
  getStreakInfo(userId: string): Promise<StreakInfo>;
  getDailyActivity(userId: string, days?: number): Promise<DailyActivity[]>;
  getBadgeHistorySnapshot(userId: string): Promise<BadgeHistorySnapshot>;
}

/** Database lifecycle (init, close, health) */
export interface DatabaseLifecyclePort {
  init(): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  onError(callback: (error: Error) => void): void;
  healthCheck(): Promise<boolean>;
}

// =============================================================================
// Unified Port (backward compatible — composition of all sub-interfaces)
// =============================================================================

/**
 * PersistencePort - Unified port for all persistence operations.
 *
 * **IMPORTANT: Interface Segregation Principle (ISP)**
 *
 * This interface is an AGGREGATION OF CONVENIENCE - it combines all
 * persistence-related sub-interfaces into a single type.
 *
 * **Recommended Usage:**
 *
 * ✅ **DO** - Depend on specific sub-interfaces in your consumers:
 * ```typescript
 * class HistoryAdapter {
 *   constructor(
 *     private readonly summaryStore: SessionSummaryStorePort,
 *     private readonly statsHelpers: StatsHelpersPort,
 *   ) {}
 * }
 * ```
 *
 * ✅ **DO** - Use PersistencePort only in adapters/wiring code:
 * ```typescript
 * // In infra adapter factory
 * class PowerSyncPersistenceAdapter implements PersistencePort { ... }
 *
 * // In adapter that needs multiple persistence operations
 * class StatsAdapter {
 *   constructor(private readonly db: PersistencePort) {}
 * }
 * ```
 *
 * ❌ **DON'T** - Depend on PersistencePort when you only need one capability:
 * ```typescript
 * // BAD: This class depends on everything when it only reads events
 * class SomeConsumer {
 *   constructor(private readonly db: PersistencePort) {} // Too broad!
 * }
 *
 * // GOOD: Narrow dependency
 * class SomeConsumer {
 *   constructor(private readonly eventStore: EventStorePort) {}
 * }
 * ```
 *
 * **Why this matters:**
 * - Easier testing (mock only what you need)
 * - Clearer intent (interface shows capabilities used)
 * - Loose coupling (changes to unrelated capabilities don't affect you)
 * - Better documentation (constructor shows exact dependencies)
 *
 * **Règles d'utilisation :**
 * - Appelé UNIQUEMENT depuis les adapters dans infra
 * - Les adapters reçoivent ce port en injection (pas de singleton)
 * - Consumers should depend on the narrowest sub-interface they need
 */
export interface PersistencePort
  extends DatabaseLifecyclePort,
    EventStorePort,
    SessionSummaryStorePort,
    SQLQueryPort,
    SettingsStorePort,
    AlgorithmStateStorePort,
    MetaStorePort,
    PendingDeletionsPort,
    StatsHelpersPort {}
