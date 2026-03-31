/**
 * SessionProjector - Session Projection Class
 *
 * Classe OOP pour projeter les statistiques d'une session
 * à partir des events bruts (Event Sourcing).
 *
 * Aucune donnée stockée - tout est recalculé à la demande.
 *
 * Fonctionnalités:
 * - Calcul des outcomes par trial
 * - Calcul des running stats
 * - Projection complète de session
 * - Stats incrémentales (temps réel)
 */

import { getIsLure, getIsTarget, type ModalityId } from '../domain';
import type {
  GameEvent,
  ModalityRunningStats,
  ModalityTrialOutcome,
  RunningStats,
  SessionStartedEvent,
  SessionSummary,
  TrialOutcome,
  TrialPresentedEvent,
  TrialResult,
  UserResponseEvent,
} from './events';
import { StatisticalCalculator } from './statistical-calculator';
import { TempoConfidenceCalculator } from '../domain/scoring/tempo-confidence';
import { JaeggiConfidenceCalculator } from '../domain/scoring/dualnback-classic-confidence';
import {
  calculateTempoSessionPassed,
  extractThresholdsFromSpec,
  type ModalitySDTCounts,
} from '../domain/scoring/session-passed';
import type { TempoResponseData } from '../types/ups';
import { AllSpecs, type DualnbackClassicConfidenceSpec, type TempoConfidenceSpec } from '../specs';

// =============================================================================
// Spec-Driven Confidence Helpers
// =============================================================================

/**
 * Check if a confidence spec is DualnbackClassicConfidenceSpec (has accuracyThreshold).
 */
function isDualnbackClassicConfidenceSpec(
  spec: TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined,
): spec is DualnbackClassicConfidenceSpec {
  return spec !== undefined && 'accuracyThreshold' in spec;
}

function isTempoConfidenceSpec(
  spec: TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined,
): spec is TempoConfidenceSpec {
  return spec !== undefined && 'timingDiscipline' in spec;
}

/**
 * Get confidence spec from game mode.
 * Returns the confidence spec from the mode's scoring config.
 */
function getConfidenceSpecFromMode(
  gameMode: string,
): TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined {
  const modeSpec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return modeSpec?.scoring?.confidence;
}

// =============================================================================
// Helpers pour extraction dynamique des modalités depuis Trial
// =============================================================================

/** Mapping modalityId -> propriété isTarget du Trial */
const isTargetForModality = getIsTarget;

/** Mapping modalityId -> propriété isLure du Trial */
const isLureForModality = getIsLure;

/**
 * Default modalities when activeModalities is not provided.
 * Used as fallback for legacy callers. Modern code should always pass activeModalities.
 */
const DEFAULT_MODALITIES: readonly ModalityId[] = ['position', 'audio'];

// =============================================================================
// TempoConfidence Helpers
// =============================================================================

// =============================================================================
// Response Index Helper - O(1) lookups instead of O(N) filters
// =============================================================================

/**
 * Pre-index responses by trialIndex for O(1) lookups.
 * Converts O(N²) algorithms to O(N).
 */
function buildResponseIndex(
  responses: readonly UserResponseEvent[],
): Map<number, UserResponseEvent[]> {
  const index = new Map<number, UserResponseEvent[]>();
  for (const response of responses) {
    const existing = index.get(response.trialIndex);
    if (existing) {
      existing.push(response);
    } else {
      index.set(response.trialIndex, [response]);
    }
  }
  return index;
}

/**
 * Calculate Euclidean distance between two points.
 */
function calculateDistance(
  p1: { x: number; y: number } | undefined,
  p2: { x: number; y: number } | undefined,
): number | undefined {
  if (!p1 || !p2) return undefined;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Extract TempoResponseData from events for TempoConfidence calculation.
 * OPTIMIZED: Uses pre-indexed responses for O(N) complexity.
 *
 * Includes mouse-specific data for accurate RT analysis:
 * - inputMethod: keyboard, mouse, touch, gamepad
 * - cursorTravelDistance: pixels from cursor at stimulus to button at click
 * - responseIndexInTrial: 0 or 1 for dual-match detection
 */
export function extractTempoResponseData(
  trials: readonly TrialPresentedEvent[],
  responses: readonly UserResponseEvent[],
  activeModalities: readonly ModalityId[],
): TempoResponseData[] {
  // Brain Workshop arithmetic has no meaningful RT/press duration and is evaluated at trial end.
  const tempoModalities = activeModalities.filter((m) => m !== 'arithmetic');
  // Create a map of trial index to trial info
  const trialMap = new Map<number, TrialPresentedEvent>();
  for (const trial of trials) {
    if (!trial.trial.isBuffer) {
      trialMap.set(trial.trial.index, trial);
    }
  }

  // Pre-index responses by trialIndex - O(N) instead of O(N²)
  const responseIndex = buildResponseIndex(responses);

  // Build response data
  const responseData: TempoResponseData[] = [];

  for (const response of responses) {
    if (response.modality === 'arithmetic') continue;
    const trialEvent = trialMap.get(response.trialIndex);
    if (!trialEvent) continue;

    const trial = trialEvent.trial;
    const isTarget = isTargetForModality(trial, response.modality);

    // Calculate cursor travel distance for mouse input
    const cursorTravelDistance =
      response.inputMethod === 'mouse'
        ? calculateDistance(trialEvent.cursorPosition, response.buttonPosition)
        : undefined;

    responseData.push({
      trialIndex: response.trialIndex,
      reactionTimeMs: response.reactionTimeMs,
      pressDurationMs: response.pressDurationMs,
      responsePhase: response.responsePhase,
      result: isTarget ? 'hit' : 'falseAlarm',
      modality: response.modality,
      // Mouse-specific fields
      inputMethod: response.inputMethod,
      cursorTravelDistance,
      responseIndexInTrial: response.responseIndexInTrial,
    });
  }

  // Add misses (targets without responses) - O(1) lookup per trial
  for (const [trialIndex, trialEvent] of trialMap) {
    const trial = trialEvent.trial;
    const trialResponses = responseIndex.get(trialIndex) ?? [];

    for (const modality of tempoModalities) {
      const isTarget = isTargetForModality(trial, modality);
      const hasResponse = trialResponses.some((r) => r.modality === modality);

      if (isTarget && !hasResponse) {
        responseData.push({
          trialIndex,
          reactionTimeMs: 0,
          pressDurationMs: null,
          responsePhase: 'after_stimulus',
          result: 'miss',
          modality,
          // No mouse data for misses
        });
      }
    }
  }

  return responseData;
}

// =============================================================================
// SessionProjector
// =============================================================================

/**
 * Projecteur de session.
 * Encapsule toutes les fonctions de projection Event Sourcing.
 */
export class SessionProjector {
  // ===========================================================================
  // Trial Outcome Computation
  // ===========================================================================

  /**
   * Détermine le résultat d'un trial pour une modalité.
   */
  static computeTrialResult(isTarget: boolean, pressed: boolean): TrialResult {
    if (isTarget) {
      return pressed ? 'hit' : 'miss';
    }
    return pressed ? 'falseAlarm' : 'correctRejection';
  }

  /**
   * Calcule le résultat complet d'un trial à partir des events.
   * Supporte toutes les modalités dynamiquement.
   *
   * @deprecated Use computeTrialOutcomeFromIndex for better performance
   */
  static computeTrialOutcome(
    trialEvent: TrialPresentedEvent,
    responses: readonly UserResponseEvent[],
    activeModalities?: readonly ModalityId[],
  ): TrialOutcome {
    const trial = trialEvent.trial;
    const trialResponses = responses.filter((r) => r.trialIndex === trial.index);
    return SessionProjector.computeTrialOutcomeFromResponses(
      trialEvent,
      trialResponses,
      activeModalities,
    );
  }

  /**
   * OPTIMIZED: Calcule le résultat d'un trial avec responses pré-filtrées.
   * Use with buildResponseIndex() for O(1) lookup per trial.
   */
  static computeTrialOutcomeFromResponses(
    trialEvent: TrialPresentedEvent,
    trialResponses: readonly UserResponseEvent[],
    activeModalities?: readonly ModalityId[],
  ): TrialOutcome {
    const trial = trialEvent.trial;

    // Utiliser les modalités actives ou les modalités par défaut
    const modalities = activeModalities ?? DEFAULT_MODALITIES;

    const byModality: Record<ModalityId, ModalityTrialOutcome> = {};

    for (const modalityId of modalities) {
      const response = trialResponses.find((r) => r.modality === modalityId);
      const isTarget = isTargetForModality(trial, modalityId);
      const wasLure = isLureForModality(trial, modalityId);
      const pressed = modalityId === 'arithmetic' ? (response?.isCorrect ?? false) : !!response;

      byModality[modalityId] = {
        result: SessionProjector.computeTrialResult(isTarget, pressed),
        reactionTime: modalityId === 'arithmetic' ? null : (response?.reactionTimeMs ?? null),
        wasLure,
      };
    }

    return {
      trialIndex: trial.index,
      byModality,
    };
  }

  // ===========================================================================
  // Running Stats Computation
  // ===========================================================================

  /**
   * Calcule les running stats à partir des outcomes.
   * Supporte toutes les modalités dynamiquement.
   */
  static computeRunningStats(outcomes: readonly TrialOutcome[]): RunningStats {
    // Collecter les modalités présentes dans les outcomes
    const modalityIds = new Set<ModalityId>();
    for (const outcome of outcomes) {
      for (const modalityId of Object.keys(outcome.byModality)) {
        modalityIds.add(modalityId);
      }
    }

    // Accumulateurs par modalité
    const modalityAccumulators: Record<
      ModalityId,
      { hits: number; misses: number; fa: number; cr: number; rts: number[] }
    > = {};

    for (const modalityId of modalityIds) {
      modalityAccumulators[modalityId] = { hits: 0, misses: 0, fa: 0, cr: 0, rts: [] };
    }

    // Parcourir les outcomes
    for (const outcome of outcomes) {
      for (const [modalityId, modalityOutcome] of Object.entries(outcome.byModality)) {
        const acc = modalityAccumulators[modalityId];
        if (!acc) continue;

        switch (modalityOutcome.result) {
          case 'hit':
            acc.hits++;
            break;
          case 'miss':
            acc.misses++;
            break;
          case 'falseAlarm':
            acc.fa++;
            break;
          case 'correctRejection':
            acc.cr++;
            break;
        }

        if (modalityOutcome.reactionTime !== null) {
          acc.rts.push(modalityOutcome.reactionTime);
        }
      }
    }

    // Construire byModality stats
    const byModality: Record<ModalityId, ModalityRunningStats> = {};
    const dPrimes: number[] = [];

    for (const [modalityId, acc] of Object.entries(modalityAccumulators)) {
      const dPrime = StatisticalCalculator.computeDPrime(acc.hits, acc.misses, acc.fa, acc.cr);
      const avgRT = acc.rts.length > 0 ? acc.rts.reduce((a, b) => a + b, 0) / acc.rts.length : null;

      byModality[modalityId] = {
        hits: acc.hits,
        misses: acc.misses,
        falseAlarms: acc.fa,
        correctRejections: acc.cr,
        avgRT,
        dPrime,
      };

      dPrimes.push(dPrime);
    }

    // globalDPrime = moyenne des d-primes par modalité (cohérent avec RunningStatsCalculator)
    const globalDPrime =
      dPrimes.length > 0 ? dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length : 0;

    return {
      trialsCompleted: outcomes.length,
      globalDPrime,
      byModality,
    };
  }

  // ===========================================================================
  // Full Session Projection
  // ===========================================================================

  /**
   * Projette une session complète à partir des events bruts.
   */
  static project(events: readonly GameEvent[]): SessionSummary | null {
    const sessionStart = events.find((e): e is SessionStartedEvent => e.type === 'SESSION_STARTED');
    if (!sessionStart) return null;

    // Récupérer les modalités actives depuis la config de session
    const activeModalities = sessionStart.config?.activeModalities ?? ['position', 'audio'];

    const sessionEnd = events.find((e) => e.type === 'SESSION_ENDED');
    const trials = events.filter((e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED');
    const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');
    const misfireCount = events.filter((e) => e.type === 'INPUT_MISFIRED').length;
    const duplicateCount = events.filter((e) => e.type === 'DUPLICATE_RESPONSE_DETECTED').length;
    const focusLostCount = events.filter((e) => e.type === 'FOCUS_LOST').length;
    const focusLostTotalMs = events
      .filter((e): e is GameEvent & { lostDurationMs: number } => e.type === 'FOCUS_REGAINED')
      .reduce((sum, e) => sum + e.lostDurationMs, 0);
    const focusLost = events.filter((e) => e.type === 'FOCUS_LOST');
    const focusRegained = events.filter((e) => e.type === 'FOCUS_REGAINED');

    // OPTIMIZED: Pre-index responses by trialIndex for O(1) lookups
    // This converts O(N²) to O(N) complexity
    const responseIndex = buildResponseIndex(responses);

    // Compute outcomes for each trial (avec modalités actives)
    // O(N) instead of O(N²) thanks to responseIndex
    const outcomes = trials
      .filter((t) => !t.trial.isBuffer) // Skip buffer trials
      .map((t) => {
        const trialResponses = responseIndex.get(t.trial.index) ?? [];
        return SessionProjector.computeTrialOutcomeFromResponses(
          t,
          trialResponses,
          activeModalities,
        );
      });

    // Focus stats
    const totalFocusLostMs = focusRegained.reduce(
      (sum, e) => sum + (e.type === 'FOCUS_REGAINED' ? e.lostDurationMs : 0),
      0,
    );

    // Duration
    const lastEvent = events[events.length - 1];
    const durationMs = sessionEnd
      ? sessionEnd.timestamp - sessionStart.timestamp
      : lastEvent
        ? lastEvent.timestamp - sessionStart.timestamp
        : 0;

    // Timing stats (ISI and stimulus duration)
    const isiValues = trials.map((t) => t.isiMs);
    const stimulusDurationValues = trials.map((t) => t.stimulusDurationMs);

    // Lure stats par modalité
    const luresCount: Record<ModalityId, number> = {};
    for (const modalityId of activeModalities) {
      luresCount[modalityId] = trials.filter((t) => isLureForModality(t.trial, modalityId)).length;
    }

    // Compute final stats first (needed for accuracy calculation)
    const finalStats = SessionProjector.computeRunningStats(outcomes);

    // Extract generator and gameMode from session config
    const generator = sessionStart.config?.generator;
    const gameMode = sessionStart.gameMode;

    // TempoConfidence calculation
    // Extract response data for confidence metrics (TimingDiscipline, RTStability, PressStability, PES, FocusScore)
    const responseData = extractTempoResponseData(trials, responses, activeModalities);

    // Get confidence spec from archived spec (for replay) or current mode spec
    const archivedConfidenceSpec = sessionStart.spec?.scoring?.confidence;
    const currentConfidenceSpec = gameMode ? getConfidenceSpecFromMode(gameMode) : undefined;
    const confidenceSpec = archivedConfidenceSpec ?? currentConfidenceSpec;

    // Use JaeggiConfidenceCalculator for DualnbackClassic mode (conditional timing penalty based on accuracy)
    // Use TempoConfidenceCalculator for all other tempo modes
    let tempoConfidence:
      | import('../types/ups').TempoConfidenceResult
      | import('../types/ups').JaeggiConfidenceResult
      | null;
    if (gameMode === 'dualnback-classic' || generator === 'DualnbackClassic') {
      // Calculate accuracy for Jaeggi confidence by summing all modalities
      let totalHits = 0;
      let totalMisses = 0;
      let totalFalseAlarms = 0;
      let totalCorrectRejections = 0;
      for (const modalityStats of Object.values(finalStats.byModality)) {
        totalHits += modalityStats.hits;
        totalMisses += modalityStats.misses;
        totalFalseAlarms += modalityStats.falseAlarms;
        totalCorrectRejections += modalityStats.correctRejections;
      }
      const totalResponses = totalHits + totalMisses + totalFalseAlarms + totalCorrectRejections;
      const accuracy =
        totalResponses > 0 ? (totalHits + totalCorrectRejections) / totalResponses : 0;

      // Pass spec if it's DualnbackClassicConfidenceSpec
      const jaeggiSpec = isDualnbackClassicConfidenceSpec(confidenceSpec)
        ? confidenceSpec
        : undefined;
      const jaeggiResult = JaeggiConfidenceCalculator.calculate(
        responseData,
        accuracy,
        jaeggiSpec,
        {
          misfireCount,
          duplicateCount,
          focusLostCount,
          focusLostTotalMs,
        },
      );
      // JaeggiConfidenceResult is compatible with TempoConfidenceResult (superset)
      tempoConfidence = jaeggiResult.hasEnoughData ? jaeggiResult : null;
    } else {
      // Pass spec if it's TempoConfidenceSpec (not Jaeggi)
      const tempoSpec = isTempoConfidenceSpec(confidenceSpec) ? confidenceSpec : undefined;
      // Provide additional input-control context when available (especially on touch devices).
      const tempoResult = TempoConfidenceCalculator.calculate(responseData, tempoSpec, {
        misfireCount,
        duplicateCount,
        focusLostCount,
        focusLostTotalMs,
      });
      tempoConfidence = tempoResult.hasEnoughData ? tempoResult : null;
    }

    // Calculate passed using centralized logic
    // Convert byModality to ModalitySDTCounts format
    const byModalityForPassed: Record<ModalityId, ModalitySDTCounts> = {};
    for (const [modality, stats] of Object.entries(finalStats.byModality)) {
      byModalityForPassed[modality] = {
        hits: stats.hits,
        misses: stats.misses,
        falseAlarms: stats.falseAlarms,
        correctRejections: stats.correctRejections,
      };
    }

    // Extract thresholds from archived spec (if available) for faithful replay
    const thresholds = extractThresholdsFromSpec(sessionStart.spec);

    const passed = calculateTempoSessionPassed({
      generator,
      gameMode,
      byModality: byModalityForPassed,
      globalDPrime: finalStats.globalDPrime,
      thresholds,
    });

    return {
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.nLevel,
      totalTrials: trials.length,
      outcomes,
      finalStats,
      durationMs,
      focusLostCount: focusLost.length,
      totalFocusLostMs,
      isiStats: StatisticalCalculator.computeTimingStats(isiValues),
      stimulusDurationStats: StatisticalCalculator.computeTimingStats(stimulusDurationValues),
      luresCount,
      tempoConfidence,
      passed,
      generator,
      gameMode,
    };
  }

  // ===========================================================================
  // Incremental Stats (pour affichage en temps réel)
  // ===========================================================================

  /**
   * Calcule les stats à un moment donné (après N trials).
   * OPTIMIZED: O(N) complexity using pre-indexed responses.
   */
  static computeStatsAtTrial(events: readonly GameEvent[], upToTrialIndex: number): RunningStats {
    // Récupérer les modalités actives
    const sessionStart = events.find((e): e is SessionStartedEvent => e.type === 'SESSION_STARTED');
    const activeModalities = sessionStart?.config?.activeModalities ?? ['position', 'audio'];

    const trials = events.filter(
      (e): e is TrialPresentedEvent =>
        e.type === 'TRIAL_PRESENTED' && e.trial.index <= upToTrialIndex,
    );
    const responses = events.filter(
      (e): e is UserResponseEvent => e.type === 'USER_RESPONDED' && e.trialIndex <= upToTrialIndex,
    );

    // OPTIMIZED: Pre-index responses for O(1) lookups
    const responseIndex = buildResponseIndex(responses);

    const outcomes = trials
      .filter((t) => !t.trial.isBuffer)
      .map((t) => {
        const trialResponses = responseIndex.get(t.trial.index) ?? [];
        return SessionProjector.computeTrialOutcomeFromResponses(
          t,
          trialResponses,
          activeModalities,
        );
      });

    return SessionProjector.computeRunningStats(outcomes);
  }
}
