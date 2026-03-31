/**
 * UPSProjector - Unified Performance Score Projector
 *
 * Projette le score UPS à partir des events bruts pour tous les modes.
 * Intègre les projections existantes (Session, Flow, Recall) avec le scoring UPS.
 *
 * Usage:
 * - Tempo: Uses pre-computed tempoConfidence from SessionSummary
 * - Flow: Uses PlaceSessionProjector which includes confidenceScore
 * - Recall: Uses MemoSessionProjector.projectExtended() which includes avgConfidenceScore
 * - Dual Label: Uses DualPickSessionProjector which includes confidenceScore
 */

import type { TempoAccuracyData, UnifiedPerformanceScore } from '../types/ups';
import type {
  PlaceSessionStartedEvent,
  GameEvent,
  MemoSessionStartedEvent,
  SessionStartedEvent,
  DualPickSessionStartedEvent,
  TraceSessionStartedEvent,
  TraceSessionEndedEvent,
  TraceResponseEvent,
  CognitiveTaskSessionStartedEvent,
  CognitiveTaskSessionEndedEvent,
} from './events';
import type { Trial } from '../types/core';
import { SessionProjector } from './session-projector';
import { PlaceSessionProjector } from './place-projector';
import { MemoSessionProjector } from './memo-projector';
import { DualPickSessionProjector } from './dual-pick-projector';
import { projectTimeSessionFromEvents } from './time-session-projection';
import { projectTrackSessionFromEvents } from './track-session-projection';
import { projectCorsiSessionFromEvents } from './corsi-session-projection';
import { projectOspanSessionFromEvents } from './ospan-session-projection';
import { projectRunningSpanSessionFromEvents } from './running-span-session-projection';
import { projectPasatSessionFromEvents } from './pasat-session-projection';
import { projectSwmSessionFromEvents } from './swm-session-projection';
import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';

// =============================================================================
// Types
// =============================================================================

/**
 * Mode de session détecté depuis les events.
 */
export type SessionMode =
  | 'tempo'
  | 'flow'
  | 'recall'
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
  | 'unknown';

/**
 * Résultat de la projection UPS.
 */
export interface UPSProjectionResult {
  /** Mode de session détecté */
  readonly mode: SessionMode;
  /** Score UPS calculé */
  readonly ups: UnifiedPerformanceScore;
  /** Session ID */
  readonly sessionId: string;
  /** N-Level */
  readonly nLevel: number;
  /** Nombre de trials/drops/picks */
  readonly totalTrials: number;
  /** Durée en ms */
  readonly durationMs: number;
  /** Session complète ou abandonnée */
  readonly completed: boolean;
  /** ID d'étape Journey (si applicable) */
  readonly journeyStageId?: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Détecte le mode de session à partir des events.
 */
function detectSessionMode(events: readonly GameEvent[]): SessionMode {
  for (const event of events) {
    if (event.type === 'FLOW_SESSION_STARTED') return 'flow';
    if (event.type === 'RECALL_SESSION_STARTED') return 'recall';
    if (event.type === 'DUAL_PICK_SESSION_STARTED') return 'dual-pick';
    if (event.type === 'TRACE_SESSION_STARTED') return 'trace';
    if (event.type === 'TIME_SESSION_STARTED') return 'time';
    if (event.type === 'MOT_SESSION_STARTED') return 'track';
    if (event.type === 'CORSI_SESSION_STARTED') return 'corsi';
    if (event.type === 'OSPAN_SESSION_STARTED') return 'ospan';
    if (event.type === 'RUNNING_SPAN_SESSION_STARTED') return 'running-span';
    if (event.type === 'PASAT_SESSION_STARTED' || event.type === 'PASAT_SESSION_ENDED')
      return 'pasat';
    if (event.type === 'SWM_SESSION_STARTED' || event.type === 'SWM_SESSION_ENDED') return 'swm';
    if (event.type === 'COGNITIVE_TASK_SESSION_STARTED') return 'cognitive-task';
    if (event.type === 'SESSION_STARTED') return 'tempo';
  }
  return 'unknown';
}

/**
 * Extrait les données d'accuracy pour le mode Tempo.
 */
function extractTempoAccuracyData(events: readonly GameEvent[]): TempoAccuracyData {
  const summary = SessionProjector.project(events);
  if (!summary) {
    return { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  }

  // Aggregate from all modalities
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  for (const modalityStats of Object.values(summary.finalStats.byModality)) {
    hits += modalityStats.hits;
    misses += modalityStats.misses;
    falseAlarms += modalityStats.falseAlarms;
    correctRejections += modalityStats.correctRejections;
  }

  return { hits, misses, falseAlarms, correctRejections };
}

// =============================================================================
// UPSProjector
// =============================================================================

/**
 * Projette le score UPS à partir des events bruts.
 */
export class UPSProjector {
  // ===========================================================================
  // Main Projection
  // ===========================================================================

  /**
   * Projette le score UPS depuis les events d'une session.
   * Détecte automatiquement le mode et applique la stratégie appropriée.
   *
   * @param events - Events de la session
   * @param trials - Trials pour Recall (requis pour évaluation des picks)
   * @param isGaming - Résultat de la détection de gaming (optionnel)
   */
  static project(
    events: readonly GameEvent[],
    trials?: readonly Trial[],
    isGaming = false,
  ): UPSProjectionResult | null {
    const mode = detectSessionMode(events);

    switch (mode) {
      case 'tempo':
        return UPSProjector.projectTempo(events, isGaming);
      case 'flow':
        return UPSProjector.projectFlow(events, isGaming);
      case 'recall':
        return UPSProjector.projectRecall(events, trials ?? [], isGaming);
      case 'dual-pick':
        return UPSProjector.projectDualPick(events, isGaming);
      case 'trace':
        return UPSProjector.projectTrace(events, isGaming);
      case 'time':
        return UPSProjector.projectTime(events, isGaming);
      case 'track':
        return UPSProjector.projectTrack(events, isGaming);
      case 'corsi':
        return UPSProjector.projectCorsi(events, isGaming);
      case 'ospan':
        return UPSProjector.projectOspan(events, isGaming);
      case 'running-span':
        return UPSProjector.projectRunningSpan(events, isGaming);
      case 'pasat':
        return UPSProjector.projectPasat(events, isGaming);
      case 'swm':
        return UPSProjector.projectSwm(events, isGaming);
      case 'cognitive-task':
        return UPSProjector.projectCognitiveTask(events, isGaming);
      default:
        return null;
    }
  }

  // ===========================================================================
  // Mode-Specific Projections
  // ===========================================================================

  /**
   * Projette UPS pour une session Tempo.
   * Uses pre-computed tempoConfidence from SessionSummary when available.
   */
  static projectTempo(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const sessionStart = events.find((e): e is SessionStartedEvent => e.type === 'SESSION_STARTED');
    if (!sessionStart) return null;

    const sessionEnd = events.find((e) => e.type === 'SESSION_ENDED');
    const summary = SessionProjector.project(events);
    if (!summary) return null;

    // Extract accuracy data from summary
    const accuracyData = extractTempoAccuracyData(events);

    // Use pre-computed tempoConfidence from SessionSummary
    // This avoids duplicate calculation since SessionProjector already computed it
    const confidence = summary.tempoConfidence?.score ?? null;

    // Calculate UPS using spec-driven accuracy and weights (gameMode determines formulas)
    const gameMode = sessionStart.gameMode ?? 'dual-catch';
    const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(accuracyData, gameMode);
    const ups = UnifiedScoreCalculator.calculate(accuracy, confidence, isGaming, gameMode);

    return {
      mode: 'tempo',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.nLevel,
      totalTrials: summary.totalTrials,
      durationMs: summary.durationMs,
      completed: sessionEnd?.type === 'SESSION_ENDED' && sessionEnd.reason === 'completed',
      journeyStageId: sessionStart.journeyStageId,
    };
  }

  /**
   * Projette UPS pour une session Flow.
   */
  static projectFlow(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const sessionStart = events.find(
      (e): e is PlaceSessionStartedEvent => e.type === 'FLOW_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const summary = PlaceSessionProjector.project(events);
    if (!summary) return null;

    // Calculate UPS using Flow data
    const ups = UnifiedScoreCalculator.calculatePlace(
      {
        correctDrops: summary.extendedStats.correctDrops,
        totalDrops: summary.extendedStats.totalDrops,
        confidenceScore: summary.confidenceScore,
      },
      isGaming,
    );

    return {
      mode: 'flow',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: summary.totalTrials,
      durationMs: summary.durationMs,
      completed: summary.completed,
      journeyStageId: sessionStart.journeyStageId,
    };
  }

  /**
   * Projette UPS pour une session Recall.
   */
  static projectRecall(
    events: readonly GameEvent[],
    trials: readonly Trial[],
    isGaming = false,
  ): UPSProjectionResult | null {
    const sessionStart = events.find(
      (e): e is MemoSessionStartedEvent => e.type === 'RECALL_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const summary = MemoSessionProjector.projectExtended(events, trials);
    if (!summary) return null;

    // Calculate UPS using Recall data
    const ups = UnifiedScoreCalculator.calculateRecall(
      {
        correctPicks: summary.finalStats.correctPicks,
        totalPicks: summary.finalStats.totalPicks,
        avgConfidenceScore: summary.avgConfidenceScore,
        windowsCompleted: summary.finalStats.windowsCompleted,
      },
      isGaming,
    );

    return {
      mode: 'recall',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: summary.totalTrials,
      durationMs: summary.durationMs,
      completed: summary.completed,
      journeyStageId: sessionStart.journeyStageId,
    };
  }

  /**
   * Projette UPS pour une session Dual Label.
   */
  static projectDualPick(
    events: readonly GameEvent[],
    isGaming = false,
  ): UPSProjectionResult | null {
    const sessionStart = events.find(
      (e): e is DualPickSessionStartedEvent => e.type === 'DUAL_PICK_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const summary = DualPickSessionProjector.project(events);
    if (!summary) return null;

    // Calculate UPS using Dual Label scoring
    const ups = UnifiedScoreCalculator.calculateDualPick(
      {
        correctDrops: summary.extendedStats.correctDrops,
        totalDrops: summary.extendedStats.totalDrops,
        confidenceScore: summary.confidenceScore,
      },
      isGaming,
    );

    return {
      mode: 'dual-pick',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: summary.totalTrials,
      durationMs: summary.durationMs,
      completed: summary.completed,
      journeyStageId: sessionStart.journeyStageId,
    };
  }

  /**
   * Projette UPS pour une session Trace.
   */
  static projectTrace(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const sessionStart = events.find(
      (e): e is TraceSessionStartedEvent => e.type === 'TRACE_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const sessionEnd = events.find(
      (e): e is TraceSessionEndedEvent => e.type === 'TRACE_SESSION_ENDED',
    );
    if (!sessionEnd) return null;

    // Count correct and total responses from TRACE_RESPONDED events (excluding warmup)
    const responseEvents = events.filter(
      (e): e is TraceResponseEvent => e.type === 'TRACE_RESPONDED' && !e.isWarmup,
    );

    const correctResponses = responseEvents.filter((e) => e.isCorrect).length;
    const totalResponses = responseEvents.length;

    // Calculate accuracy (0-1)
    const accuracy = totalResponses > 0 ? correctResponses / totalResponses : 0;

    // For Trace mode, confidence is based on consistency of response times
    // Simple approach: use accuracy as confidence proxy for now
    const confidence = accuracy;

    // Calculate UPS using similar approach to Flow/DualPick
    const ups = UnifiedScoreCalculator.calculatePlace(
      {
        correctDrops: correctResponses,
        totalDrops: totalResponses,
        confidenceScore: confidence,
      },
      isGaming,
    );

    return {
      mode: 'trace',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: sessionEnd.totalTrials,
      durationMs: sessionEnd.durationMs,
      completed: sessionEnd.reason === 'completed',
      journeyStageId: sessionStart.journeyStageId,
    };
  }

  /**
   * Projette UPS pour une session Dual Time.
   */
  static projectTime(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectTimeSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'time',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: 1,
      totalTrials: projection.totalTrials,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session Dual Track.
   */
  static projectTrack(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectTrackSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'track',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: projection.targetCount,
      totalTrials: projection.totalTrials,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session Corsi Block.
   */
  static projectCorsi(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectCorsiSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'corsi',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: projection.maxSpan,
      totalTrials: projection.totalTrials,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session OSPAN.
   */
  static projectOspan(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectOspanSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'ospan',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: projection.maxSpan,
      totalTrials: projection.totalSets,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session Running Span.
   */
  static projectRunningSpan(
    events: readonly GameEvent[],
    isGaming = false,
  ): UPSProjectionResult | null {
    const projection = projectRunningSpanSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'running-span',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: projection.maxSpan,
      totalTrials: projection.totalTrials,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session PASAT.
   */
  static projectPasat(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectPasatSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'pasat',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: 1,
      totalTrials: projection.totalTrials,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session SWM.
   */
  static projectSwm(events: readonly GameEvent[], isGaming = false): UPSProjectionResult | null {
    const projection = projectSwmSessionFromEvents(events, isGaming);
    if (!projection?.startEvent) return null;

    return {
      mode: 'swm',
      ups: projection.ups,
      sessionId: projection.startEvent.sessionId,
      nLevel: projection.maxSpanReached,
      totalTrials: projection.totalRounds,
      durationMs: projection.durationMs,
      completed: projection.reason === 'completed',
    };
  }

  /**
   * Projette UPS pour une session Cognitive Task.
   */
  static projectCognitiveTask(
    events: readonly GameEvent[],
    isGaming = false,
  ): UPSProjectionResult | null {
    const sessionStart = events.find(
      (e): e is CognitiveTaskSessionStartedEvent => e.type === 'COGNITIVE_TASK_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const sessionEnd = events.find(
      (e): e is CognitiveTaskSessionEndedEvent => e.type === 'COGNITIVE_TASK_SESSION_ENDED',
    );
    if (!sessionEnd) return null;

    // accuracy in the event is 0-1, UPS expects 0-100
    const accuracyPct = sessionEnd.accuracy * 100;
    const confidence = sessionEnd.meanRtMs ? Math.max(0, 100 - sessionEnd.meanRtMs / 10) : null;

    const ups = UnifiedScoreCalculator.calculate(
      accuracyPct,
      confidence,
      isGaming,
      sessionEnd.taskType,
    );

    return {
      mode: 'cognitive-task',
      ups,
      sessionId: sessionStart.sessionId,
      nLevel: 1,
      totalTrials: sessionEnd.totalTrials,
      durationMs: sessionEnd.durationMs,
      completed: sessionEnd.reason === 'completed',
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Détecte le mode de session.
   */
  static detectMode(events: readonly GameEvent[]): SessionMode {
    return detectSessionMode(events);
  }

  /**
   * Calcule uniquement le score UPS (sans les détails).
   */
  static getScore(
    events: readonly GameEvent[],
    trials?: readonly Trial[],
    isGaming = false,
  ): number | null {
    const result = UPSProjector.project(events, trials, isGaming);
    return result?.ups.score ?? null;
  }
}
