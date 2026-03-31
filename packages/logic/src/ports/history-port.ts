/**
 * HistoryPort
 *
 * Interface for session history persistence.
 * Implemented by infra, consumed by ui via Context.
 */

import { computeUnifiedMetrics, type UnifiedMetrics } from '../domain/unified-metrics';
import type { ModalityRunningStats } from '../engine/events';
import type { SessionEndReportModel, JourneyContext } from '../types/session-report';
import type { SessionPlayContext } from '../engine/events';
import type { XPBreakdown } from '../types/xp';
import type { SessionSummaryRow } from './persistence-port';
import { normalizeModeId } from '../utils/mode-normalizer';

// =============================================================================
// Types
// =============================================================================

/**
 * Modality stats for history entries.
 * Alias for ModalityRunningStats for semantic clarity in history context.
 */
export type HistoryModalityStats = ModalityRunningStats;

export type SessionEndReason = 'completed' | 'abandoned' | 'error';

/** Format d'export/import JSON */
export interface SessionHistoryExport {
  readonly version: 1;
  readonly exportedAt: string; // ISO date
  readonly sessions: readonly SessionHistoryItemJSON[];
}

/** Session sérialisée en JSON (Date → string) */
export interface SessionHistoryItemJSON {
  readonly id: string;
  readonly createdAt: string; // ISO date
  readonly nLevel: number;
  readonly dPrime: number;
  readonly passed: boolean;
  readonly trialsCount: number;
  readonly durationMs: number;
  readonly byModality: Record<string, HistoryModalityStats>;
  readonly generator: string;
  /** Mode de jeu canonique (dual-catch, dualnback-classic, etc.) */
  readonly gameMode?: string;
  readonly activeModalities: readonly string[];
  readonly reason: SessionEndReason;
  /** ID de l'étape Journey si c'est une session du parcours */
  readonly journeyStageId?: number;
  /** ID du parcours (pour multi-parcours) */
  readonly journeyId?: string;
  /** Explicit context at play time: journey stage vs free training */
  readonly playContext: SessionPlayContext;
  // Confidence metrics for Dual Place mode
  readonly flowConfidenceScore?: number;
  readonly flowDirectnessRatio?: number;
  readonly flowWrongSlotDwellMs?: number;
  // Confidence metrics for Dual Memo (Recall) mode
  readonly recallConfidenceScore?: number;
  readonly recallFluencyScore?: number;
  readonly recallCorrectionsCount?: number;
  // Confidence metrics for Dual Pick mode
  readonly labelConfidenceScore?: number;
  readonly labelDirectnessRatio?: number;
  readonly labelWrongSlotDwellMs?: number;
  readonly labelAvgPlacementTimeMs?: number;
  // UPS components (for accurate reconstruction in history view)
  readonly upsAccuracy?: number;
  readonly upsConfidence?: number | null;
  readonly upsScore?: number;
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
}

export interface ImportResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

export interface SessionHistoryItem {
  readonly id: string;
  readonly createdAt: Date;
  readonly nLevel: number;
  readonly dPrime: number;
  readonly passed: boolean;
  readonly trialsCount: number;
  readonly durationMs: number;
  /** Stats par modalité (position, audio, color, etc.) */
  readonly byModality: Record<string, HistoryModalityStats>;
  /** Nom du générateur utilisé (BrainWorkshop, Jaeggi, Adaptive) */
  readonly generator: string;
  /** Mode de jeu canonique (dual-catch, dualnback-classic, etc.) */
  readonly gameMode?: string;
  /** Modalités actives pendant la session */
  readonly activeModalities: readonly string[];
  /** Raison de fin de session (completed, abandoned, error) */
  readonly reason: SessionEndReason;
  /** ID de l'étape Journey si c'est une session du parcours */
  readonly journeyStageId?: number;
  /** ID du parcours (pour multi-parcours) */
  readonly journeyId?: string;
  /** Explicit context at play time: journey stage vs free training */
  readonly playContext: SessionPlayContext;
  /** Full journey context for historical display (persisted at session end) */
  readonly journeyContext?: JourneyContext;
  /** Unified metrics for cross-mode comparison (Zone 1-20, accuracy) */
  readonly unifiedMetrics: UnifiedMetrics;
  /** UPS (Unified Performance Score, 0-100) - primary cross-mode metric */
  readonly upsScore?: number;
  // Confidence metrics for Dual Place mode
  readonly flowConfidenceScore?: number;
  readonly flowDirectnessRatio?: number;
  readonly flowWrongSlotDwellMs?: number;
  // Confidence metrics for Dual Memo (Recall) mode
  readonly recallConfidenceScore?: number;
  readonly recallFluencyScore?: number;
  readonly recallCorrectionsCount?: number;
  // Confidence metrics for Dual Pick mode
  readonly labelConfidenceScore?: number;
  readonly labelDirectnessRatio?: number;
  readonly labelWrongSlotDwellMs?: number;
  readonly labelAvgPlacementTimeMs?: number;
  // UPS components (for accurate reconstruction in history view)
  readonly upsAccuracy?: number;
  readonly upsConfidence?: number | null;
  /** XP breakdown for this session (for historical display) */
  readonly xpBreakdown?: XPBreakdown;
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
}

// =============================================================================
// Port
// =============================================================================

export interface HistoryPort {
  getSessions(): Promise<SessionHistoryItem[]>;
  getJourneySessions?(
    journeyId: string,
    options?: { gameModes?: readonly string[] },
  ): Promise<SessionHistoryItem[]>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessions(sessionIds: readonly string[]): Promise<void>;
  /** Export toutes les sessions en JSON */
  exportSessions(): Promise<SessionHistoryExport>;
  /** Import des sessions depuis JSON (skip les doublons par ID) */
  importSessions(data: SessionHistoryExport): Promise<ImportResult>;

  /**
   * Check if the history adapter has completed initial sync processing.
   * Returns false during initial PowerSync snapshot processing (migrations, rebuilds).
   * UI should show loading indicator while this is false after login.
   */
  isReady(): boolean;

  /**
   * Mark the history adapter as ready (initial sync processing complete).
   * Called by setupHistoryPowerSyncWatch after initial snapshot processing.
   */
  setReady(ready: boolean): void;

  // === Session Reports (always projected from events) ===

  /**
   * Get the complete session report projected from persisted events.
   * Returns null when events are missing or cannot be projected.
   */
  getReport(sessionId: string): Promise<SessionEndReportModel | null>;

  // === Session Events (for lazy-loaded turn-by-turn detail) ===

  /**
   * Get raw events for a session.
   * Used for lazy-loading turn-by-turn detail in report view.
   * Returns empty array if no events found.
   */
  getSessionEvents(sessionId: string): Promise<unknown[]>;
}

// =============================================================================
// Row-to-Domain Transformation
// =============================================================================

function parseSessionCreatedAt(value: unknown): Date {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : new Date(0);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : new Date(0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const normalized =
        /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)
          ? trimmed
          : `${trimmed}Z`;
      const parsed = /^-?\d+(\.\d+)?$/.test(normalized)
        ? Number(normalized)
        : Date.parse(normalized);
      if (Number.isFinite(parsed)) {
        return new Date(parsed);
      }
    }
  }
  return new Date(0);
}

function resolvePlayContext(
  row: Pick<SessionSummaryRow, 'play_context' | 'journey_stage_id' | 'journey_id'>,
): SessionPlayContext {
  const value = row.play_context;
  if (
    value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
  ) {
    return value;
  }
  if (row.journey_stage_id || row.journey_id) return 'journey';
  return 'free';
}

/**
 * Convert a SessionSummaryRow from SQLite to SessionHistoryItem for UI.
 *
 * IMPORTANT: This function is used by @powersync/react useQuery in ui/queries/history.ts.
 * It's placed in logic (not infra) because:
 * - It's a pure transformation (no side effects)
 * - ui can import from logic (but NOT from infra)
 * - It uses types from logic (SessionSummaryRow, SessionHistoryItem)
 *
 * DO NOT move this to infra - it would break the Ports & Adapters architecture.
 */
export function sessionSummaryRowToHistoryItem(row: SessionSummaryRow): SessionHistoryItem {
  // Parse by_modality from JSONB
  const byModality: Record<string, HistoryModalityStats> = {};
  if (row.by_modality && typeof row.by_modality === 'object') {
    for (const [key, value] of Object.entries(row.by_modality)) {
      const stats = value as Record<string, unknown>;
      byModality[key] = {
        hits: (stats['hits'] as number) ?? 0,
        misses: (stats['misses'] as number) ?? 0,
        falseAlarms: (stats['falseAlarms'] as number) ?? 0,
        correctRejections: (stats['correctRejections'] as number) ?? 0,
        avgRT: (stats['avgRT'] as number) ?? 0,
        dPrime: (stats['dPrime'] as number) ?? 0,
      };
    }
  }

  // Determine activeModalities from byModality keys
  const activeModalities = Object.keys(byModality);
  if (activeModalities.length === 0) {
    activeModalities.push('position', 'audio'); // Default
  }

  // Compute unified metrics
  // Use ups_accuracy (spec-driven, 0-100 scale) if available, fallback to legacy accuracy
  const accuracy =
    row.ups_accuracy != null
      ? row.ups_accuracy / 100 // ups_accuracy is 0-100, unifiedMetrics expects 0-1
      : (row.accuracy ?? (row.global_d_prime ? row.global_d_prime / 3 : 0));
  const unifiedMetrics = computeUnifiedMetrics(accuracy, row.n_level);

  // SQLite may return created_at as Date object or string depending on version/config.
  // If string without timezone, add Z to force UTC interpretation.
  const createdAt = parseSessionCreatedAt(row.created_at);

  const journeyStageId = row.journey_stage_id ? parseInt(row.journey_stage_id, 10) : undefined;
  const journeyId = row.journey_id ?? undefined;
  const playContext = resolvePlayContext(row);

  return {
    id: row.session_id,
    createdAt,
    nLevel: row.n_level,
    dPrime: row.global_d_prime ?? 0,
    passed: row.passed ?? false,
    trialsCount: row.trials_count,
    durationMs: Number(row.duration_ms),
    byModality,
    generator: row.generator ?? 'BrainWorkshop',
    gameMode: row.game_mode ? normalizeModeId(row.game_mode) : undefined,
    activeModalities,
    reason: (row.reason as SessionEndReason) ?? 'completed',
    journeyStageId,
    journeyId,
    playContext,
    journeyContext: row.journey_context as unknown as JourneyContext | undefined,
    unifiedMetrics,
    upsScore: row.ups_score ?? undefined,
    upsAccuracy: row.ups_accuracy ?? undefined,
    upsConfidence: row.ups_confidence ?? undefined,
    flowConfidenceScore: row.flow_confidence_score ?? undefined,
    flowDirectnessRatio: row.flow_directness_ratio ?? undefined,
    flowWrongSlotDwellMs: row.flow_wrong_slot_dwell_ms ?? undefined,
    recallConfidenceScore: row.recall_confidence_score ?? undefined,
    recallFluencyScore: row.recall_fluency_score ?? undefined,
    recallCorrectionsCount: row.recall_corrections_count ?? undefined,
    xpBreakdown: row.xp_breakdown as unknown as SessionHistoryItem['xpBreakdown'],
    // Timing metrics
    avgResponseTimeMs: row.avg_response_time_ms ?? undefined,
    medianResponseTimeMs: row.median_response_time_ms ?? undefined,
    responseTimeStdDev: row.response_time_std_dev ?? undefined,
    avgPressDurationMs: row.avg_press_duration_ms ?? undefined,
    pressDurationStdDev: row.press_duration_std_dev ?? undefined,
    responsesDuringStimulus: row.responses_during_stimulus ?? undefined,
    responsesAfterStimulus: row.responses_after_stimulus ?? undefined,
    // Focus metrics
    focusLostCount: row.focus_lost_count ?? undefined,
    focusLostTotalMs: row.focus_lost_total_ms ?? undefined,
  };
}
