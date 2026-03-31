/**
 * Mental Rotation Task — pure game logic.
 *
 * Inspired by Shepard & Metzler (1971), Vandenberg & Kuse (1978):
 * - A reference shape is shown alongside candidates
 * - One candidate is the reference rotated (match)
 * - One is the mirror image of the reference (rotated)
 * - Others are different shapes (distractors)
 * - RT increases linearly with angular disparity
 *
 * Key metrics:
 * - Overall accuracy
 * - RT slope (ms per degree of rotation) — angular disparity effect
 * - Mirror error rate vs distractor error rate
 * - Mean RT by rotation angle
 */

// =============================================================================
// Constants
// =============================================================================

export const ROTATION_ANGLES = [0, 60, 120, 180, 240, 300] as const;
export type RotationAngle = (typeof ROTATION_ANGLES)[number];

// =============================================================================
// Types
// =============================================================================

export type CandidateType = 'match' | 'mirror' | 'distractor';

export interface MentalRotationTrial {
  trialIndex: number;
  shapeIdx: number;
  rotationDeg: number;
  correctCandidateIdx: number;
  candidateTypes: CandidateType[];
}

export interface MentalRotationTrialResult {
  trialIndex: number;
  rotationDeg: number;
  selectedType: CandidateType | 'timeout';
  correct: boolean;
  responseTimeMs: number;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a trial definition (logic only, no shape data).
 * `shapeCount` is the total number of available shapes.
 * `candidateCount` is the number of candidates to present (default 4).
 */
export function generateTrial(
  trialIndex: number,
  shapeCount: number,
  rng: () => number = Math.random,
  candidateCount = 4,
): MentalRotationTrial {
  const shapeIdx = Math.floor(rng() * shapeCount);
  const rotationDeg = ROTATION_ANGLES[Math.floor(rng() * ROTATION_ANGLES.length)]!;

  // Build candidate types: 1 match, 1 mirror, rest distractors
  const types: CandidateType[] = ['match', 'mirror'];
  for (let i = 2; i < candidateCount; i++) {
    types.push('distractor');
  }

  // Fisher-Yates shuffle
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = types[i]!;
    types[i] = types[j]!;
    types[j] = tmp;
  }

  const correctCandidateIdx = types.indexOf('match');

  return {
    trialIndex,
    shapeIdx,
    rotationDeg,
    correctCandidateIdx,
    candidateTypes: types,
  };
}

// =============================================================================
// Response Evaluation
// =============================================================================

/**
 * Evaluate a response to a mental rotation trial.
 */
export function evaluateResponse(
  trial: MentalRotationTrial,
  selectedIdx: number | null,
  responseTimeMs: number,
): MentalRotationTrialResult {
  if (selectedIdx === null) {
    return {
      trialIndex: trial.trialIndex,
      rotationDeg: trial.rotationDeg,
      selectedType: 'timeout',
      correct: false,
      responseTimeMs,
    };
  }

  const selectedType = trial.candidateTypes[selectedIdx] ?? 'distractor';
  const correct = selectedIdx === trial.correctCandidateIdx;

  return {
    trialIndex: trial.trialIndex,
    rotationDeg: trial.rotationDeg,
    selectedType,
    correct,
    responseTimeMs,
  };
}

// =============================================================================
// Angular Disparity Analysis
// =============================================================================

export interface AngleRtEntry {
  angle: number;
  avgRt: number;
  count: number;
}

/**
 * Compute mean RT grouped by rotation angle.
 * Only includes trials with actual responses (not timeouts).
 */
export function computeRtByAngle(results: MentalRotationTrialResult[]): AngleRtEntry[] {
  const valid = results.filter((r) => r.selectedType !== 'timeout');
  const map = new Map<number, number[]>();

  for (const r of valid) {
    const arr = map.get(r.rotationDeg) ?? [];
    arr.push(r.responseTimeMs);
    map.set(r.rotationDeg, arr);
  }

  return Array.from(map.entries())
    .map(([angle, rts]) => ({
      angle,
      avgRt: Math.round(rts.reduce((s, v) => s + v, 0) / rts.length),
      count: rts.length,
    }))
    .sort((a, b) => a.angle - b.angle);
}

/**
 * Compute RT slope (ms per degree) via linear regression on angle vs RT.
 * This is the classic angular disparity effect measure.
 * Uses "folded" angles: 0, 60, 120, 180 (240 -> 120, 300 -> 60).
 * Returns 0 if insufficient data.
 */
export function computeRtSlope(results: MentalRotationTrialResult[]): number {
  const valid = results.filter((r) => r.selectedType !== 'timeout' && r.correct);
  if (valid.length < 2) return 0;

  // Fold angles past 180 to get angular disparity (0-180)
  const points = valid.map((r) => ({
    angle: foldAngle(r.rotationDeg),
    rt: r.responseTimeMs,
  }));

  // Simple linear regression: slope = Cov(x,y) / Var(x)
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.angle, 0);
  const sumY = points.reduce((s, p) => s + p.rt, 0);
  const sumXY = points.reduce((s, p) => s + p.angle * p.rt, 0);
  const sumXX = points.reduce((s, p) => s + p.angle * p.angle, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  return Math.round(slope * 100) / 100; // ms per degree, 2 decimal places
}

/**
 * Fold angles past 180 degrees to get the shortest angular disparity.
 * e.g., 240 -> 120, 300 -> 60
 */
export function foldAngle(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? 360 - normalized : normalized;
}

// =============================================================================
// Summary
// =============================================================================

export interface MentalRotationSummary {
  totalTrials: number;
  correctCount: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for responded trials (ms) */
  meanRt: number;
  /** Number of mirror-image errors */
  mirrorErrors: number;
  /** Number of distractor errors */
  distractorErrors: number;
  /** Number of timeout trials */
  timeouts: number;
  /** RT slope (ms per degree) — angular disparity effect */
  rtSlope: number;
  /** Average RT by rotation angle */
  avgRtByAngle: AngleRtEntry[];
}

/**
 * Compute session summary from mental rotation trial results.
 */
export function computeSummary(results: MentalRotationTrialResult[]): MentalRotationSummary {
  const correctCount = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  const validRts = results.filter((r) => r.selectedType !== 'timeout');
  const meanRt =
    validRts.length > 0
      ? Math.round(validRts.reduce((s, r) => s + r.responseTimeMs, 0) / validRts.length)
      : 0;

  const mirrorErrors = results.filter((r) => !r.correct && r.selectedType === 'mirror').length;
  const distractorErrors = results.filter(
    (r) => !r.correct && r.selectedType === 'distractor',
  ).length;
  const timeouts = results.filter((r) => r.selectedType === 'timeout').length;

  const rtSlope = computeRtSlope(results);
  const avgRtByAngle = computeRtByAngle(results);

  return {
    totalTrials: results.length,
    correctCount,
    accuracy,
    meanRt,
    mirrorErrors,
    distractorErrors,
    timeouts,
    rtSlope,
    avgRtByAngle,
  };
}
