/**
 * Posner Cueing Task — pure game logic extracted from the training page.
 *
 * Posner (1980):
 * - Two boxes (left/right) on screen with fixation cross in center
 * - One box flashes (cue) for 100ms then target (*) appears
 * - Valid (80%): target in cued box. Invalid (20%): target in uncued box
 * - Key metrics: cueing effect = RT(invalid) - RT(valid)
 */

// =============================================================================
// Types
// =============================================================================

export type Side = 'left' | 'right';
export type Validity = 'valid' | 'invalid';

export interface PosnerTrial {
  cueSide: Side;
  validity: Validity;
  targetSide: Side;
}

export interface PosnerTrialResult {
  trial: PosnerTrial;
  response: Side | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

export interface PosnerSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  validAccuracy: number;
  invalidAccuracy: number;
  meanValidRt: number;
  meanInvalidRt: number;
  cueingEffect: number;
  validTrials: number;
  invalidTrials: number;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_VALID_PROBABILITY = 0.8;
export const TARGET_TIMEOUT_MS = 1500;

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Derive target side from cue side and validity.
 * Valid: target on cued side. Invalid: target on opposite side.
 */
export function deriveTargetSide(cueSide: Side, validity: Validity): Side {
  if (validity === 'valid') return cueSide;
  return cueSide === 'left' ? 'right' : 'left';
}

/**
 * Generate an array of Posner trials with the given valid probability.
 * Uses a deterministic RNG seed when provided, otherwise Math.random.
 */
export function generateTrials(
  count: number,
  validProbability = DEFAULT_VALID_PROBABILITY,
  rng: () => number = Math.random,
): PosnerTrial[] {
  const trials: PosnerTrial[] = [];
  for (let i = 0; i < count; i++) {
    const cueSide: Side = rng() < 0.5 ? 'left' : 'right';
    const validity: Validity = rng() < validProbability ? 'valid' : 'invalid';
    const targetSide = deriveTargetSide(cueSide, validity);
    trials.push({ cueSide, validity, targetSide });
  }
  return trials;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Evaluate a response against a trial.
 * Correct if response matches the target side.
 * Null response = timeout = incorrect.
 */
export function evaluateResponse(
  trial: PosnerTrial,
  response: Side | null,
  rt: number,
): PosnerTrialResult {
  const timedOut = response === null;
  const correct = !timedOut && response === trial.targetSide;
  return {
    trial,
    response,
    correct,
    rt: timedOut ? TARGET_TIMEOUT_MS : rt,
    timedOut,
  };
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from an array of trial results.
 * Cueing effect = meanInvalidRt - meanValidRt (on correct trials only).
 */
export function computeSummary(results: PosnerTrialResult[]): PosnerSummary {
  const validResults = results.filter((r) => r.trial.validity === 'valid');
  const invalidResults = results.filter((r) => r.trial.validity === 'invalid');

  const validCorrect = validResults.filter((r) => r.correct);
  const invalidCorrect = invalidResults.filter((r) => r.correct);

  const validRts = validCorrect.filter((r) => !r.timedOut).map((r) => r.rt);
  const invalidRts = invalidCorrect.filter((r) => !r.timedOut).map((r) => r.rt);

  const meanValidRt =
    validRts.length > 0 ? Math.round(validRts.reduce((a, b) => a + b, 0) / validRts.length) : 0;
  const meanInvalidRt =
    invalidRts.length > 0
      ? Math.round(invalidRts.reduce((a, b) => a + b, 0) / invalidRts.length)
      : 0;

  const cueingEffect = meanInvalidRt - meanValidRt;
  const correctCount = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  return {
    totalTrials: results.length,
    correctTrials: correctCount,
    accuracy,
    validAccuracy:
      validResults.length > 0 ? Math.round((validCorrect.length / validResults.length) * 100) : 0,
    invalidAccuracy:
      invalidResults.length > 0
        ? Math.round((invalidCorrect.length / invalidResults.length) * 100)
        : 0,
    meanValidRt,
    meanInvalidRt,
    cueingEffect,
    validTrials: validResults.length,
    invalidTrials: invalidResults.length,
  };
}
