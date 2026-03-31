/**
 * N-Level Progression Evaluators
 *
 * Pure functions to evaluate N-level progression at end of session.
 * No Coach needed - just stats in, recommendation out.
 */

import type { SDTCounts } from '../types/core';
import {
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  PROGRESSION_STRIKES_TO_DOWN,
  DIFFICULTY_MAX_N_LEVEL,
} from '../specs/thresholds';

// NLEVEL-2: Max N-level bound
const MAX_N_LEVEL = DIFFICULTY_MAX_N_LEVEL;

// =============================================================================
// Types
// =============================================================================

export interface SessionStats {
  readonly byModality: Map<string, SDTCounts>;
  readonly currentNLevel: number;
}

export type NLevelDelta = -1 | 0 | 1;

export interface ProgressionResult {
  readonly delta: NLevelDelta;
  readonly reasoning: string;
}

// =============================================================================
// Jaeggi Evaluator (Protocol 2008)
// =============================================================================

/**
 * Evaluate N-level progression using Jaeggi protocol.
 *
 * Rules (per Jaeggi 2008 protocol):
 * - All modalities < 3 errors → N+1 ("fewer than three" per paper)
 * - Any modality > 5 errors → N-1
 * - Otherwise → maintain
 */
export function evaluateJaeggiProgression(stats: SessionStats): ProgressionResult {
  // NLEVEL-1 fix: Empty modalities = maintain (no data to evaluate)
  if (stats.byModality.size === 0) {
    return {
      delta: 0,
      reasoning: 'Jaeggi: no modality data, maintain N',
    };
  }

  const errorsByModality: Record<string, number> = {};

  for (const [modalityId, modalityStats] of stats.byModality) {
    errorsByModality[modalityId] = modalityStats.misses + modalityStats.falseAlarms;
  }

  const modalityNames = Object.keys(errorsByModality);
  const errorValues = Object.values(errorsByModality);
  const errorSummary = modalityNames.map((m) => `${m}=${errorsByModality[m]}`).join(', ');

  // Rule 1: N+1 if ALL modalities < 3 errors (Jaeggi 2008: "fewer than three")
  if (errorValues.every((e) => e < JAEGGI_MAX_ERRORS_PER_MODALITY)) {
    // NLEVEL-2 fix: Cap at max N-level
    if (stats.currentNLevel >= MAX_N_LEVEL) {
      return {
        delta: 0,
        reasoning: `Jaeggi: errors (${errorSummary}) < ${JAEGGI_MAX_ERRORS_PER_MODALITY}, but already at max N=${MAX_N_LEVEL}`,
      };
    }
    return {
      delta: 1,
      reasoning: `Jaeggi: errors (${errorSummary}) < ${JAEGGI_MAX_ERRORS_PER_MODALITY}, N+1`,
    };
  }

  // Rule 2: N-1 if ANY modality > 5 errors
  if (errorValues.some((e) => e > JAEGGI_ERRORS_DOWN) && stats.currentNLevel > 1) {
    let worstModality = modalityNames[0] ?? 'unknown';
    let maxErrors = 0;
    for (const [modality, errors] of Object.entries(errorsByModality)) {
      if (errors > maxErrors) {
        maxErrors = errors;
        worstModality = modality;
      }
    }
    return {
      delta: -1,
      reasoning: `Jaeggi: ${worstModality}=${maxErrors} > ${JAEGGI_ERRORS_DOWN}, N-1`,
    };
  }

  // Rule 3: Maintain
  return {
    delta: 0,
    reasoning: `Jaeggi: errors (${errorSummary}), maintain N=${stats.currentNLevel}`,
  };
}

// =============================================================================
// BrainWorkshop Evaluator
// =============================================================================

/**
 * Options for BrainWorkshop progression evaluation.
 */
export interface BrainWorkshopProgressionOptions {
  /**
   * Number of strikes at the current N-level from previous sessions.
   * Should be calculated from session history using calculateBrainWorkshopStrikes().
   */
  currentStrikes?: number;
}

/**
 * Evaluate N-level progression using BrainWorkshop rules.
 *
 * Brain Workshop v5.0 score% = Hits / (Hits + Misses + FalseAlarms) * 100
 *
 * Rules:
 * - Score >= 80% → N+1
 * - Score < 50% → strike +1
 * - 3 strikes at same N → N-1
 * - Otherwise → maintain
 *
 * @param stats - Session statistics
 * @param options - Optional configuration including current strikes from history
 */
export function evaluateBrainWorkshopProgression(
  stats: SessionStats,
  options?: BrainWorkshopProgressionOptions,
): ProgressionResult {
  const currentStrikes = options?.currentStrikes ?? 0;

  let totalHits = 0;
  let totalMisses = 0;
  let totalFA = 0;

  for (const modalityStats of stats.byModality.values()) {
    totalHits += modalityStats.hits;
    totalMisses += modalityStats.misses;
    totalFA += modalityStats.falseAlarms;
  }

  // BW original: percent = int(H*100/(H+M+FA)) (CR ignored)
  const denominator = totalHits + totalMisses + totalFA;
  const scorePercent = denominator === 0 ? 0 : Math.floor((totalHits * 100) / denominator);

  // Rule 1: N+1 if score >= 80%
  if (scorePercent >= BW_SCORE_UP_PERCENT) {
    // NLEVEL-2 fix: Cap at max N-level
    if (stats.currentNLevel >= MAX_N_LEVEL) {
      return {
        delta: 0,
        reasoning: `BrainWorkshop: score=${scorePercent.toFixed(0)}% >= ${BW_SCORE_UP_PERCENT}%, but already at max N=${MAX_N_LEVEL}`,
      };
    }
    return {
      delta: 1,
      reasoning: `BrainWorkshop: score=${scorePercent.toFixed(0)}% >= ${BW_SCORE_UP_PERCENT}%, N+1`,
    };
  }

  // BW: strikes only apply when N > 1 (no fallback below N=1)
  // Rule 2: Score < 50% adds a strike
  if (stats.currentNLevel > 1 && scorePercent < BW_SCORE_DOWN_PERCENT) {
    const newStrikes = currentStrikes + 1;

    // Rule 2a: 3 strikes → N-1
    if (newStrikes >= PROGRESSION_STRIKES_TO_DOWN && stats.currentNLevel > 1) {
      return {
        delta: -1,
        reasoning: `BrainWorkshop: score=${scorePercent.toFixed(0)}% < ${BW_SCORE_DOWN_PERCENT}%, ${newStrikes} strikes → N-1`,
      };
    }

    // Rule 2b: Strike added but not enough for N-1
    return {
      delta: 0,
      reasoning: `BrainWorkshop: score=${scorePercent.toFixed(0)}% < ${BW_SCORE_DOWN_PERCENT}%, strike ${newStrikes}/${PROGRESSION_STRIKES_TO_DOWN}`,
    };
  }

  // Rule 3: Otherwise → maintain (strikes unchanged)
  return {
    delta: 0,
    reasoning: `BrainWorkshop: score=${scorePercent.toFixed(0)}%, maintain N=${stats.currentNLevel}`,
  };
}

// =============================================================================
// Registry (for dynamic lookup by name)
// =============================================================================

export type ProgressionEvaluator = (stats: SessionStats) => ProgressionResult;

const evaluators: Record<string, ProgressionEvaluator> = {
  jaeggi: evaluateJaeggiProgression,
  brainworkshop: evaluateBrainWorkshopProgression,
};

/**
 * Get progression evaluator by name.
 * Returns undefined for unknown names (no progression).
 */
export function getProgressionEvaluator(name: string): ProgressionEvaluator | undefined {
  return evaluators[name];
}
