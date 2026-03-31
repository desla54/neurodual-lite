/**
 * UFOV (Useful Field of View) — pure game logic extracted from the training page.
 *
 * Canonical 3-part structure:
 * - Central identification: identify vehicle type (car/truck)
 * - Divided attention: identify vehicle + localize peripheral target
 * - Selective attention: same as divided, with distractors
 *
 * Uses an adaptive display-duration staircase (2-down/1-up):
 * - 2 consecutive correct → decrease duration (harder)
 * - 1 incorrect → increase duration (easier)
 *
 * Threshold = final display duration in ms (lower = better)
 */

// =============================================================================
// Types
// =============================================================================

export type VehicleType = 'car' | 'truck';
export type PositionIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type UfovSubtask = 'central' | 'divided' | 'selective';
export type UfovVariant = 'full' | 'central' | 'divided' | 'selective';

export interface UfovTrial {
  subtask: UfovSubtask;
  vehicle: VehicleType;
  targetPosition: PositionIndex | null; // null for central-only
  distractorPositions: PositionIndex[];
  displayMs: number;
}

export interface UfovTrialResult {
  trial: UfovTrial;
  vehicleResponse: VehicleType | null;
  positionResponse: PositionIndex | null;
  vehicleCorrect: boolean;
  positionCorrect: boolean;
  correct: boolean; // vehicleCorrect AND (positionCorrect or no position needed)
}

export interface UfovBlockSummary {
  subtask: UfovSubtask;
  trials: number;
  correctTrials: number;
  accuracy: number;
  centralAccuracy: number;
  positionAccuracy: number | null;
  thresholdMs: number;
  minDisplayMs: number;
}

// =============================================================================
// Constants
// =============================================================================

export const DURATION_LEVELS = [
  500, 400, 320, 250, 200, 160, 120, 90, 70, 50, 40, 30, 24, 17,
] as const;

export const POSITION_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

// =============================================================================
// Staircase
// =============================================================================

export interface StaircaseState {
  durationIndex: number;
  correctStreak: number;
}

/**
 * 2-down/1-up staircase: 2 consecutive correct moves to a shorter duration,
 * 1 incorrect moves to a longer duration (resets streak).
 */
export function advanceStaircase(state: StaircaseState, wasCorrect: boolean): StaircaseState {
  if (!wasCorrect) {
    return {
      durationIndex: Math.min(DURATION_LEVELS.length - 1, state.durationIndex + 1),
      correctStreak: 0,
    };
  }

  const nextStreak = state.correctStreak + 1;
  if (nextStreak < 2) {
    return { durationIndex: state.durationIndex, correctStreak: nextStreak };
  }

  // 2 consecutive correct → step down (shorter duration = harder)
  return {
    durationIndex: Math.max(0, state.durationIndex - 1),
    correctStreak: 0,
  };
}

/**
 * Get display duration in ms from a duration index.
 */
export function getDurationMs(durationIndex: number): number {
  const clamped = Math.max(0, Math.min(DURATION_LEVELS.length - 1, Math.round(durationIndex)));
  return DURATION_LEVELS[clamped] ?? DURATION_LEVELS[0]!;
}

/**
 * Find the closest duration level index for a given display time in ms.
 */
export function findClosestDurationIndex(displayMs: number): number {
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < DURATION_LEVELS.length; i++) {
    const delta = Math.abs(DURATION_LEVELS[i]! - displayMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate UFOV trials for a given subtask.
 */
export function generateTrials(
  subtask: UfovSubtask,
  count: number,
  displayMs: number,
  distractorCount = 4,
  rng: () => number = Math.random,
): UfovTrial[] {
  const trials: UfovTrial[] = [];
  const allPositions: PositionIndex[] = [0, 1, 2, 3, 4, 5, 6, 7];

  for (let i = 0; i < count; i++) {
    const vehicle: VehicleType = rng() < 0.5 ? 'car' : 'truck';
    const targetPosition: PositionIndex | null =
      subtask === 'central' ? null : allPositions[Math.floor(rng() * allPositions.length)]!;

    let distractorPositions: PositionIndex[] = [];
    if (subtask === 'selective' && targetPosition !== null) {
      const remaining = allPositions.filter((p) => p !== targetPosition);
      // Fisher-Yates partial shuffle
      const shuffled = [...remaining];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
      }
      distractorPositions = shuffled.slice(
        0,
        Math.min(distractorCount, shuffled.length),
      ) as PositionIndex[];
    }

    trials.push({
      subtask,
      vehicle,
      targetPosition,
      distractorPositions,
      displayMs,
    });
  }
  return trials;
}

// =============================================================================
// Response Evaluation
// =============================================================================

/**
 * Evaluate a trial response.
 * Central subtask: only vehicle matters.
 * Divided/selective: vehicle AND position must be correct.
 */
export function evaluateResponse(
  trial: UfovTrial,
  vehicleResponse: VehicleType | null,
  positionResponse: PositionIndex | null,
): UfovTrialResult {
  const vehicleCorrect = vehicleResponse === trial.vehicle;
  const positionCorrect =
    trial.targetPosition === null
      ? true // central subtask has no position
      : positionResponse === trial.targetPosition;

  const correct =
    trial.targetPosition === null ? vehicleCorrect : vehicleCorrect && positionCorrect;

  return {
    trial,
    vehicleResponse,
    positionResponse,
    vehicleCorrect,
    positionCorrect,
    correct,
  };
}

// =============================================================================
// Threshold Score Normalization
// =============================================================================

/**
 * Convert a threshold in ms to a 0-100 score.
 * 500ms (slowest) → 0, 17ms (fastest) → 100.
 */
export function normalizeThresholdToScore(thresholdMs: number): number {
  const raw = ((500 - thresholdMs) / (500 - 17)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// =============================================================================
// Block Summary
// =============================================================================

/**
 * Compute summary for a block of UFOV trials.
 */
export function computeBlockSummary(
  subtask: UfovSubtask,
  results: UfovTrialResult[],
  finalDurationIndex: number,
): UfovBlockSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const centralCorrect = results.filter((r) => r.vehicleCorrect).length;
  const positionTrials = results.filter((r) => r.trial.targetPosition !== null);
  const positionCorrect = positionTrials.filter((r) => r.positionCorrect).length;
  const displayTimes = results.map((r) => r.trial.displayMs);

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  return {
    subtask,
    trials: results.length,
    correctTrials,
    accuracy: clamp((correctTrials / Math.max(1, results.length)) * 100),
    centralAccuracy: clamp((centralCorrect / Math.max(1, results.length)) * 100),
    positionAccuracy:
      positionTrials.length > 0 ? clamp((positionCorrect / positionTrials.length) * 100) : null,
    thresholdMs: getDurationMs(finalDurationIndex),
    minDisplayMs:
      displayTimes.length > 0 ? Math.min(...displayTimes) : getDurationMs(finalDurationIndex),
  };
}

// =============================================================================
// Variant helpers
// =============================================================================

/**
 * Return which subtask blocks to run for a variant.
 */
export function getSubtasksForVariant(variant: UfovVariant): UfovSubtask[] {
  if (variant === 'full') return ['central', 'divided', 'selective'];
  return [variant];
}

/**
 * Compute trials per block given variant and total configured trials.
 */
export function getTrialsPerBlock(variant: UfovVariant, configuredTrials: number): number {
  const safeTrials = Math.max(12, Math.min(72, Math.round(configuredTrials)));
  if (variant === 'full') {
    return Math.max(6, Math.min(24, Math.round(safeTrials / 3)));
  }
  return Math.max(12, Math.min(36, safeTrials));
}
