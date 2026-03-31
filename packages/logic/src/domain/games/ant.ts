/**
 * ANT (Attention Network Test) — pure game logic.
 *
 * Fan et al. (2002):
 * - Combines flanker + spatial cueing + alerting in one test
 * - Measures three attentional networks:
 *   1. Alerting  = mean RT(no cue) - mean RT(double cue)
 *   2. Orienting = mean RT(center cue) - mean RT(spatial cue)
 *   3. Executive = mean RT(incongruent) - mean RT(congruent)
 */

// =============================================================================
// Types
// =============================================================================

export type CueCondition = 'none' | 'center' | 'double' | 'spatial';
export type FlankerCondition = 'congruent' | 'incongruent' | 'neutral';
export type TargetLocation = 'top' | 'bottom';
export type TargetDirection = 'left' | 'right';

export interface AntTrial {
  cue: CueCondition;
  flanker: FlankerCondition;
  targetLocation: TargetLocation;
  targetDirection: TargetDirection;
}

export interface AntTrialResult {
  trial: AntTrial;
  correct: boolean;
  responseTimeMs: number;
  responded: boolean;
}

export interface AntNetworkScores {
  /** Alerting = mean RT(no cue) - mean RT(double cue) */
  alerting: number;
  /** Orienting = mean RT(center cue) - mean RT(spatial cue) */
  orienting: number;
  /** Executive = mean RT(incongruent) - mean RT(congruent) */
  executive: number;
}

export interface AntSummary {
  totalTrials: number;
  correctTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for responded correct trials */
  meanRtMs: number;
  networks: AntNetworkScores;
}

// =============================================================================
// Constants
// =============================================================================

export const CUE_CONDITIONS: readonly CueCondition[] = ['none', 'center', 'double', 'spatial'];
export const FLANKER_CONDITIONS: readonly FlankerCondition[] = [
  'congruent',
  'incongruent',
  'neutral',
];
export const TARGET_LOCATIONS: readonly TargetLocation[] = ['top', 'bottom'];
export const TARGET_DIRECTIONS: readonly TargetDirection[] = ['left', 'right'];

export const DEFAULT_TOTAL_TRIALS = 24;

// Timing constants (ms)
export const FIXATION_MS = 400;
export const CUE_MS = 100;
export const FIXATION2_MS = 400;
export const STIMULUS_TIMEOUT_MS = 1700;
export const FEEDBACK_MS = 600;

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate balanced trials cycling through cue x flanker x location x direction.
 * Shuffled using Fisher-Yates.
 */
export function generateTrials(count: number, rng: () => number = Math.random): AntTrial[] {
  const trials: AntTrial[] = [];

  for (let i = 0; i < count; i++) {
    trials.push({
      cue: CUE_CONDITIONS[i % CUE_CONDITIONS.length] as CueCondition,
      flanker: FLANKER_CONDITIONS[i % FLANKER_CONDITIONS.length] as FlankerCondition,
      targetLocation: TARGET_LOCATIONS[i % TARGET_LOCATIONS.length] as TargetLocation,
      targetDirection: TARGET_DIRECTIONS[i % TARGET_DIRECTIONS.length] as TargetDirection,
    });
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trials[i], trials[j]] = [trials[j] as AntTrial, trials[i] as AntTrial];
  }

  return trials;
}

// =============================================================================
// Flanker Display
// =============================================================================

/**
 * Build the 5-character flanker display string.
 * Uses Unicode arrows: left = \u2190, right = \u2192, dash = \u2014
 */
export function getFlankerString(flanker: FlankerCondition, direction: TargetDirection): string {
  const arrow = direction === 'left' ? '\u2190' : '\u2192';
  const opposite = direction === 'left' ? '\u2192' : '\u2190';
  const dash = '\u2014';

  switch (flanker) {
    case 'congruent':
      return `${arrow} ${arrow} ${arrow} ${arrow} ${arrow}`;
    case 'incongruent':
      return `${opposite} ${opposite} ${arrow} ${opposite} ${opposite}`;
    case 'neutral':
      return `${dash} ${dash} ${arrow} ${dash} ${dash}`;
  }
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if the player's response matches the target direction.
 */
export function isResponseCorrect(trial: AntTrial, response: TargetDirection): boolean {
  return response === trial.targetDirection;
}

// =============================================================================
// Network Score Computation
// =============================================================================

/** Compute mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute mean RT for trials matching a cue condition.
 * Only considers responded, correct trials.
 */
export function meanRtByCue(results: readonly AntTrialResult[], cue: CueCondition): number {
  const rts = results
    .filter((r) => r.trial.cue === cue && r.responded && r.correct)
    .map((r) => r.responseTimeMs);
  return mean(rts);
}

/**
 * Compute mean RT for trials matching a flanker condition.
 * Only considers responded, correct trials.
 */
export function meanRtByFlanker(
  results: readonly AntTrialResult[],
  flanker: FlankerCondition,
): number {
  const rts = results
    .filter((r) => r.trial.flanker === flanker && r.responded && r.correct)
    .map((r) => r.responseTimeMs);
  return mean(rts);
}

/**
 * Compute the three ANT network scores.
 * Uses only responded, correct trials for RT calculations.
 */
export function computeNetworkScores(results: readonly AntTrialResult[]): AntNetworkScores {
  const alerting = Math.round(meanRtByCue(results, 'none') - meanRtByCue(results, 'double'));
  const orienting = Math.round(meanRtByCue(results, 'center') - meanRtByCue(results, 'spatial'));
  const executive = Math.round(
    meanRtByFlanker(results, 'incongruent') - meanRtByFlanker(results, 'congruent'),
  );

  return { alerting, orienting, executive };
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: readonly AntTrialResult[]): AntSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;

  const respondedCorrect = results.filter((r) => r.responded && r.correct);
  const meanRtMs =
    respondedCorrect.length > 0
      ? Math.round(
          respondedCorrect.reduce((s, r) => s + r.responseTimeMs, 0) / respondedCorrect.length,
        )
      : 0;

  const networks = computeNetworkScores(results);

  return { totalTrials, correctTrials, accuracy, meanRtMs, networks };
}
