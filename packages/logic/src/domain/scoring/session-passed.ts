/**
 * Session Passed Calculator - Single Source of Truth
 *
 * Centralized logic for determining if a session "passed" based on:
 * - Game mode (Tempo, Flow, Recall, DualPick, Trace)
 * - Generator/Protocol (Jaeggi, BrainWorkshop, SDT)
 *
 * This file is the ONLY place where passed logic should be implemented.
 * All other modules (projectors, adapters, UI) should import from here.
 */

import type { ModalityId, SDTCounts } from '../../types/core';
import {
  ACCURACY_PASS_NORMALIZED,
  BW_SCORE_PASS_NORMALIZED,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  SDT_DPRIME_PASS,
  TRACE_ACCURACY_PASS_NORMALIZED,
} from '../../specs/thresholds';

// NLEVEL-4 fix: Epsilon for floating-point comparison to handle IEEE 754 precision issues
const FLOAT_EPSILON = 1e-9;

// =============================================================================
// Types
// =============================================================================

/**
 * SDT counts for a single modality.
 * @deprecated Use SDTCounts from types/core.ts instead.
 */
export type ModalitySDTCounts = SDTCounts;

/**
 * Optional thresholds for session passed calculation.
 * When provided (from archived spec), these override the global defaults.
 * Enables faithful replay with historical thresholds.
 */
export interface ScoringThresholds {
  /** d' threshold for SDT strategy (default: 1.5) */
  readonly sdtDPrimePass?: number;
  /** Max errors per modality for Jaeggi strategy (default: 3) */
  readonly jaeggiMaxErrors?: number;
  /** Score threshold for BrainWorkshop strategy (default: 0.8 = 80%) */
  readonly bwRawScorePass?: number;
  /** Accuracy threshold for Flow/Recall/DualPick (default: 0.8) */
  readonly accuracyPass?: number;
}

/**
 * Input for Tempo session passed calculation.
 */
export interface TempoPassedInput {
  readonly generator?: string;
  readonly gameMode?: string;
  readonly byModality: Readonly<Record<ModalityId, ModalitySDTCounts>>;
  readonly globalDPrime: number;
  /**
   * Optional thresholds from archived spec.
   * When provided, these override global defaults for faithful replay.
   */
  readonly thresholds?: ScoringThresholds;
}

/**
 * Input for accuracy-based session passed calculation (Flow, Recall, DualPick).
 */
export interface AccuracyPassedInput {
  readonly accuracy: number;
  /**
   * Optional thresholds from archived spec.
   * When provided, these override global defaults for faithful replay.
   */
  readonly thresholds?: ScoringThresholds;
}

/**
 * Scoring strategy for passed calculation.
 */
export type ScoringStrategy = 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy';

// =============================================================================
// Threshold Extraction from Spec
// =============================================================================

/**
 * Extract ScoringThresholds from an archived ModeSpec.
 *
 * The spec stores `passThreshold` generically, but we need to map it
 * to the correct field based on the scoring strategy.
 *
 * @param spec - The archived spec (or partial spec with scoring info)
 * @returns ScoringThresholds object with the correct field set
 */
export function extractThresholdsFromSpec(spec?: {
  readonly scoring?: {
    readonly strategy?: ScoringStrategy;
    readonly passThreshold?: number;
  };
}): ScoringThresholds | undefined {
  if (!spec?.scoring?.passThreshold) {
    return undefined;
  }

  const { strategy, passThreshold } = spec.scoring;

  switch (strategy) {
    case 'sdt':
      return { sdtDPrimePass: passThreshold };
    case 'dualnback-classic':
      return { jaeggiMaxErrors: passThreshold };
    case 'brainworkshop':
      return { bwRawScorePass: passThreshold };
    case 'accuracy':
      return { accuracyPass: passThreshold };
    default:
      // Unknown strategy, return undefined to use defaults
      return undefined;
  }
}

// =============================================================================
// Strategy Detection
// =============================================================================

/**
 * Detect scoring strategy from generator/gameMode strings.
 */
export function detectScoringStrategy(generator?: string, gameMode?: string): ScoringStrategy {
  const gen = generator?.toLowerCase() ?? '';
  const mode = gameMode?.toLowerCase() ?? '';

  if (gen.includes('dualnback') || mode.includes('dualnback')) {
    return 'dualnback-classic';
  }

  if (gen.includes('brainworkshop') || mode.includes('brainworkshop')) {
    return 'brainworkshop';
  }

  // Default for Tempo modes
  return 'sdt';
}

// =============================================================================
// BrainWorkshop Helpers
// =============================================================================

/**
 * Calculate BrainWorkshop score for a single modality.
 *
 * Formula: H / (H + M + FA)
 * IMPORTANT: Correct Rejections are IGNORED (faithful to BW v5.0).
 *
 * Returns value between 0 and 1.
 */
export function calculateBWScore(counts: ModalitySDTCounts): number {
  const { hits, misses, falseAlarms } = counts;
  const denominator = hits + misses + falseAlarms;

  if (denominator === 0) return 0;

  return hits / denominator;
}

/**
 * Calculate BrainWorkshop score from multiple modalities.
 *
 * Formula: H / (H + M + FA) aggregated across all modalities.
 * IMPORTANT: Correct Rejections are IGNORED (faithful to BW v5.0).
 *
 * Returns value between 0 and 1.
 */
export function calculateBWScoreFromModalities(
  byModality: Readonly<Record<string, ModalitySDTCounts>>,
): number {
  let totalH = 0;
  let totalM = 0;
  let totalFA = 0;

  for (const stats of Object.values(byModality)) {
    totalH += stats.hits;
    totalM += stats.misses;
    totalFA += stats.falseAlarms;
    // Note: correctRejections intentionally ignored (BW formula)
  }

  const denominator = totalH + totalM + totalFA;
  if (denominator === 0) return 0;

  return totalH / denominator;
}

// =============================================================================
// Jaeggi Helpers
// =============================================================================

/**
 * Check if all modalities have errors at or below Jaeggi threshold.
 * Errors = Misses + False Alarms
 * Returns true if ALL modalities have < maxErrors errors (Jaeggi 2008: "fewer than three").
 *
 * @param byModality - SDT counts per modality
 * @param maxErrors - Error boundary (exclusive). Default: JAEGGI_MAX_ERRORS_PER_MODALITY = 3
 */
export function checkJaeggiErrorsBelow(
  byModality: Readonly<Record<string, ModalitySDTCounts>>,
  maxErrors: number = JAEGGI_MAX_ERRORS_PER_MODALITY,
): boolean {
  for (const stats of Object.values(byModality)) {
    const errors = stats.misses + stats.falseAlarms;
    // Jaeggi 2008: "fewer than three" means < 3, so fail if >= maxErrors
    if (errors >= maxErrors) {
      return false;
    }
  }
  return true;
}

/**
 * Get error counts per modality for Jaeggi protocol.
 */
export function getJaeggiErrorsByModality(
  byModality: Readonly<Record<string, ModalitySDTCounts>>,
): Record<string, number> {
  const errors: Record<string, number> = {};
  for (const [modality, stats] of Object.entries(byModality)) {
    errors[modality] = stats.misses + stats.falseAlarms;
  }
  return errors;
}

// =============================================================================
// Main Passed Calculators
// =============================================================================

/**
 * Calculate passed for Tempo session (Dual Catch, Jaeggi, BrainWorkshop, Custom).
 *
 * Strategy is auto-detected from generator/gameMode:
 * - Jaeggi: All modalities must have < maxErrors errors (default: 3)
 * - BrainWorkshop: H/(H+M+FA) >= threshold (default: 0.8 = 80%)
 * - SDT (default): globalDPrime >= threshold (default: 1.5)
 *
 * When thresholds are provided (from archived spec), they override defaults.
 * This enables faithful replay with historical thresholds.
 */
export function calculateTempoSessionPassed(input: TempoPassedInput): boolean {
  const strategy = detectScoringStrategy(input.generator, input.gameMode);
  const thresholds = input.thresholds;

  switch (strategy) {
    case 'dualnback-classic': {
      const maxErrors = thresholds?.jaeggiMaxErrors ?? JAEGGI_MAX_ERRORS_PER_MODALITY;
      return checkJaeggiErrorsBelow(input.byModality, maxErrors);
    }

    case 'brainworkshop': {
      const score = calculateBWScoreFromModalities(input.byModality);
      const passThreshold = thresholds?.bwRawScorePass ?? BW_SCORE_PASS_NORMALIZED;
      // NLEVEL-4 fix: Use epsilon for floating-point comparison
      return score >= passThreshold - FLOAT_EPSILON;
    }
    default: {
      const dPrimeThreshold = thresholds?.sdtDPrimePass ?? SDT_DPRIME_PASS;
      // NLEVEL-4 fix: Use epsilon for floating-point comparison
      return input.globalDPrime >= dPrimeThreshold - FLOAT_EPSILON;
    }
  }
}

/**
 * Calculate passed for Flow session.
 * passed = accuracy >= threshold (default: 80%)
 */
export function calculatePlaceSessionPassed(
  accuracy: number,
  thresholds?: ScoringThresholds,
): boolean {
  const passThreshold = thresholds?.accuracyPass ?? ACCURACY_PASS_NORMALIZED;
  // NLEVEL-4 fix: Use epsilon for floating-point comparison
  return accuracy >= passThreshold - FLOAT_EPSILON;
}

/**
 * Calculate passed for Recall session.
 * passed = accuracy >= threshold (default: 80%)
 */
export function calculateMemoSessionPassed(
  accuracy: number,
  thresholds?: ScoringThresholds,
): boolean {
  const passThreshold = thresholds?.accuracyPass ?? ACCURACY_PASS_NORMALIZED;
  // NLEVEL-4 fix: Use epsilon for floating-point comparison
  return accuracy >= passThreshold - FLOAT_EPSILON;
}

/**
 * Calculate passed for DualPick session.
 * passed = accuracy >= threshold (default: 80%)
 */
export function calculateDualPickSessionPassed(
  accuracy: number,
  thresholds?: ScoringThresholds,
): boolean {
  const passThreshold = thresholds?.accuracyPass ?? ACCURACY_PASS_NORMALIZED;
  // NLEVEL-4 fix: Use epsilon for floating-point comparison
  return accuracy >= passThreshold - FLOAT_EPSILON;
}

/**
 * Calculate passed for Trace session (BETA).
 * passed = accuracy >= threshold (default: 70% for beta mode)
 */
export function calculateTraceSessionPassed(
  accuracy: number,
  thresholds?: ScoringThresholds,
): boolean {
  // Trace uses a lower threshold (TRACE_ACCURACY_PASS_NORMALIZED = 0.7 vs ACCURACY_PASS_NORMALIZED = 0.8)
  // If thresholds.accuracyPass is provided, use it; otherwise use TRACE_ACCURACY_PASS_NORMALIZED
  const passThreshold = thresholds?.accuracyPass ?? TRACE_ACCURACY_PASS_NORMALIZED;
  // NLEVEL-4 fix: Use epsilon for floating-point comparison
  return accuracy >= passThreshold - FLOAT_EPSILON;
}

// =============================================================================
// Generic Passed Calculator
// =============================================================================

/**
 * Session type for generic passed calculation.
 */
export type SessionType = 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'trace';

/**
 * Generic passed calculation based on session type.
 *
 * @param sessionType - Type of session
 * @param data - Either TempoPassedInput or AccuracyPassedInput
 * @returns boolean indicating if session passed
 */
export function calculateSessionPassed(
  sessionType: SessionType,
  data: TempoPassedInput | AccuracyPassedInput,
): boolean {
  switch (sessionType) {
    case 'tempo':
      return calculateTempoSessionPassed(data as TempoPassedInput);

    case 'flow': {
      const input = data as AccuracyPassedInput;
      return calculatePlaceSessionPassed(input.accuracy, input.thresholds);
    }

    case 'recall': {
      const input = data as AccuracyPassedInput;
      return calculateMemoSessionPassed(input.accuracy, input.thresholds);
    }

    case 'dual-pick': {
      const input = data as AccuracyPassedInput;
      return calculateDualPickSessionPassed(input.accuracy, input.thresholds);
    }

    case 'trace': {
      const input = data as AccuracyPassedInput;
      return calculateTraceSessionPassed(input.accuracy, input.thresholds);
    }

    default:
      return false;
  }
}
