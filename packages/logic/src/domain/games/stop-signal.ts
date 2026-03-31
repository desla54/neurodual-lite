/**
 * Stop-Signal Task — pure game logic extracted from the training page.
 *
 * Logan & Cowan (1984):
 * - Primary GO task: respond to arrow direction (left/right)
 * - On ~25% of trials, a STOP signal appears after SSD delay
 * - Player must inhibit response on stop trials
 * - SSD adapts via staircase: +50ms on successful stop, -50ms on failed stop
 * - Key metric: SSRT = mean GO RT - mean SSD on successful stops
 */

// =============================================================================
// Constants
// =============================================================================

export const TOTAL_TRIALS = 96;
export const GO_PROBABILITY = 0.75;
export const INITIAL_SSD_MS = 250;
export const SSD_STEP_MS = 50;
export const SSD_MIN_MS = 50;
export const SSD_MAX_MS = 900;
const GO_LEADIN_TRIALS = 8;
const MAX_STOP_STREAK = 1;

// =============================================================================
// Types
// =============================================================================

export type TrialType = 'go' | 'stop';
export type Direction = 'left' | 'right';
export type Outcome = 'correct_go' | 'incorrect_go' | 'miss' | 'successful_stop' | 'failed_stop';

export interface StopSignalTrial {
  trialType: TrialType;
  direction: Direction;
}

export interface TrialResult {
  trialIndex: number;
  trialType: TrialType;
  direction: Direction;
  responded: boolean;
  responseDirection: Direction | null;
  correct: boolean;
  responseTimeMs: number;
  ssd: number | null;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a sequence of stop-signal trials with ~75% go and ~25% stop,
 * balanced left/right directions.
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrialSequence(
  count: number,
  rng: () => number = Math.random,
): StopSignalTrial[] {
  if (count <= 0) return [];

  const goCount = Math.round(count * GO_PROBABILITY);
  const stopCount = count - goCount;
  const leadinGo = Math.min(GO_LEADIN_TRIALS, count, goCount);
  const postLeadGo = goCount - leadinGo;
  const postLeadStop = stopCount;
  const types: TrialType[] = [];

  for (let i = 0; i < leadinGo; i++) {
    types.push('go');
  }

  if (postLeadStop === 0) {
    for (let i = 0; i < postLeadGo; i++) {
      types.push('go');
    }
  } else if (postLeadGo >= postLeadStop - 1) {
    // Build stop positions with guaranteed inter-stop GO spacing (max stop streak = 1),
    // then randomize where the extra GO trials land.
    const bucketCount = postLeadStop + 1;
    const goBuckets = Array.from({ length: bucketCount }, () => 0);
    for (let i = 1; i < postLeadStop; i++) {
      goBuckets[i] = 1;
    }

    let extraGo = postLeadGo - Math.max(0, postLeadStop - 1);
    while (extraGo > 0) {
      const bucketIdx = Math.floor(rng() * bucketCount);
      goBuckets[bucketIdx] = (goBuckets[bucketIdx] ?? 0) + 1;
      extraGo -= 1;
    }

    const firstBucket = goBuckets[0] ?? 0;
    for (let i = 0; i < firstBucket; i++) {
      types.push('go');
    }

    for (let stopIdx = 0; stopIdx < postLeadStop; stopIdx++) {
      types.push('stop');
      const bucket = goBuckets[stopIdx + 1] ?? 0;
      for (let i = 0; i < bucket; i++) {
        types.push('go');
      }
    }
  } else {
    // Extremely unlikely fallback (for unusual ratios): prioritize exact counts.
    let remainingGo = postLeadGo;
    let remainingStop = postLeadStop;
    let stopStreak = 0;
    for (let i = leadinGo; i < count; i++) {
      const slotsLeft = count - i;
      const mustUseStop = remainingStop > 0 && remainingGo === 0;
      const canUseStop = remainingStop > 0 && stopStreak < MAX_STOP_STREAK;
      const baseStopProbability = slotsLeft > 0 ? remainingStop / slotsLeft : 0;
      const chooseStop = mustUseStop || (canUseStop && rng() < baseStopProbability);

      if (chooseStop && remainingStop > 0) {
        types.push('stop');
        remainingStop -= 1;
        stopStreak += 1;
      } else {
        types.push('go');
        if (remainingGo > 0) {
          remainingGo -= 1;
        }
        stopStreak = 0;
      }
    }
  }

  const goDirections = makeBalancedDirections(goCount, rng);
  const stopDirections = makeBalancedDirections(stopCount, rng);
  let goDirIndex = 0;
  let stopDirIndex = 0;

  const trials: StopSignalTrial[] = [];
  for (const trialType of types) {
    if (trialType === 'go') {
      const direction = goDirections[goDirIndex] ?? 'right';
      goDirIndex += 1;
      trials.push({ trialType, direction });
      continue;
    }
    const direction = stopDirections[stopDirIndex] ?? 'left';
    stopDirIndex += 1;
    trials.push({ trialType, direction });
  }

  return trials;
}

function makeBalancedDirections(count: number, rng: () => number): Direction[] {
  const leftCount = Math.floor(count / 2);
  const rightCount = count - leftCount;
  const directions: Direction[] = [];

  for (let i = 0; i < leftCount; i++) directions.push('left');
  for (let i = 0; i < rightCount; i++) directions.push('right');

  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = directions[i];
    const swapped = directions[j];
    if (!current || !swapped) continue;
    [directions[i], directions[j]] = [swapped, current];
  }

  return directions;
}

// =============================================================================
// Outcome Classification
// =============================================================================

/**
 * Classify the outcome of a single trial.
 */
export function classifyOutcome(
  trialType: TrialType,
  responded: boolean,
  responseDirection: Direction | null,
  trialDirection: Direction,
): Outcome {
  if (trialType === 'stop') {
    return responded ? 'failed_stop' : 'successful_stop';
  }
  // GO trial
  if (!responded) return 'miss';
  return responseDirection === trialDirection ? 'correct_go' : 'incorrect_go';
}

/**
 * Determine if a trial outcome is "correct".
 * - GO: responded with correct direction
 * - STOP: did NOT respond
 */
export function isCorrect(outcome: Outcome): boolean {
  return outcome === 'correct_go' || outcome === 'successful_stop';
}

// =============================================================================
// SSD Staircase
// =============================================================================

/**
 * Adapt SSD after a stop trial using the staircase procedure.
 * - Successful stop (inhibited): SSD goes UP by step (harder next time)
 * - Failed stop (responded): SSD goes DOWN by step (easier next time)
 * - Bounded within [SSD_MIN_MS, SSD_MAX_MS]
 */
export function adaptSsd(
  currentSsd: number,
  successfullyInhibited: boolean,
  step: number = SSD_STEP_MS,
  min: number = SSD_MIN_MS,
  max: number = SSD_MAX_MS,
): number {
  if (successfullyInhibited) {
    return Math.min(currentSsd + step, max);
  }
  return Math.max(currentSsd - step, min);
}

// =============================================================================
// SSRT Calculation
// =============================================================================

/**
 * Compute Stop-Signal Reaction Time.
 * SSRT = mean GO RT (correct responses only) - mean SSD (successful stops only)
 * Returns 0 if either pool is empty or result would be negative.
 */
export function computeSSRT(results: TrialResult[]): number {
  const correctGoResults = results.filter((r) => r.trialType === 'go' && r.correct && r.responded);
  const successfulStopResults = results.filter((r) => r.trialType === 'stop' && r.correct);

  if (correctGoResults.length === 0 || successfulStopResults.length === 0) return 0;

  const meanGoRt =
    correctGoResults.reduce((sum, r) => sum + r.responseTimeMs, 0) / correctGoResults.length;
  const meanSsd =
    successfulStopResults.reduce((sum, r) => sum + (r.ssd ?? 0), 0) / successfulStopResults.length;

  return Math.max(0, Math.round(meanGoRt - meanSsd));
}

// =============================================================================
// Summary
// =============================================================================

export interface StopSignalSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  goTrials: number;
  stopTrials: number;
  goAccuracy: number;
  stopAccuracy: number;
  meanGoRt: number;
  meanSsd: number;
  ssrt: number;
}

/**
 * Compute a full session summary from trial results.
 */
export function computeSummary(results: TrialResult[]): StopSignalSummary {
  const goResults = results.filter((r) => r.trialType === 'go');
  const stopResults = results.filter((r) => r.trialType === 'stop');
  const correctGo = goResults.filter((r) => r.correct && r.responded);
  const successfulStops = stopResults.filter((r) => r.correct);

  const goRts = correctGo.map((r) => r.responseTimeMs);
  const meanGoRt =
    goRts.length > 0 ? Math.round(goRts.reduce((a, b) => a + b, 0) / goRts.length) : 0;

  const meanSsd =
    successfulStops.length > 0
      ? Math.round(
          successfulStops.map((r) => r.ssd ?? 0).reduce((a, b) => a + b, 0) /
            successfulStops.length,
        )
      : 0;

  const ssrt = meanGoRt > 0 && meanSsd > 0 ? Math.max(0, meanGoRt - meanSsd) : 0;

  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  return {
    totalTrials: results.length,
    correctTrials,
    accuracy,
    goTrials: goResults.length,
    stopTrials: stopResults.length,
    goAccuracy: goResults.length > 0 ? Math.round((correctGo.length / goResults.length) * 100) : 0,
    stopAccuracy:
      stopResults.length > 0 ? Math.round((successfulStops.length / stopResults.length) * 100) : 0,
    meanGoRt,
    meanSsd,
    ssrt,
  };
}
