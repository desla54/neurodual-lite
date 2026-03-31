/**
 * Measure protocol for Visual Logic (Ravens).
 *
 * Three modes:
 *
 * - **Standard** (neurodual): Fixed sequence of 30 items, one per level (1→30).
 *   Gives an objective score comparable across sessions. ~10 minutes.
 *   This is the PRIMARY measure mode.
 *
 * - **Classic SPM** (iraven): 60 fixed items across 5 series (A-E),
 *   levels 1-2, 3-4, 5-6, 7-8, 9-10. Produces a raw score /60.
 *
 * - **Adaptive** (neurodual): 2-up/1-down accelerated staircase over 30 levels.
 *   Used for TRAINING, not measure. Kept here for API compatibility.
 *
 * This module is pure logic — no side effects, no UI.
 * The UI layer drives it by calling `startProtocol`, then repeatedly
 * `nextTrial` → (render & collect response) → `submitResponse`.
 */

import type { ReferenceProfile } from './types';
import type { RavensMatrix } from './types';
import {
  type AdaptiveState,
  type MeasureResult,
  type TrialRecord,
  createProfileAdaptiveState,
  adaptDifficulty,
  isConverged,
  computeMeasureResult,
} from './adaptive';
import { generateMatrix } from './generator';
import { type RuleTutorialGate, getPendingTutorial } from './rule-tutorials';

// ---------------------------------------------------------------------------
// Protocol types
// ---------------------------------------------------------------------------

export type MeasureMode = 'standard' | 'adaptive' | 'spm';

export interface MeasureProtocolConfig {
  mode: MeasureMode;
  /** Session ID used for deterministic seed generation */
  sessionId: string;
  /** Starting level for adaptive mode (default: 1) */
  startLevel?: number;
  /** Max trials for adaptive mode (default: 30) */
  maxTrials?: number;
  /** Tutorial IDs already seen in previous sessions (loaded from persistence) */
  seenTutorials?: readonly string[];
}

/** A single trial ready for the UI to render. */
export interface MeasureTrial {
  /** 0-based trial index */
  index: number;
  /** Difficulty level for this trial */
  level: number;
  /** The generated matrix to display */
  matrix: RavensMatrix;
  /** Seed used (for replay/debugging) */
  seed: string;
}

/** Result of submitting a response to a trial. */
export interface TrialOutcome {
  correct: boolean;
  /** Whether the protocol is finished after this trial */
  finished: boolean;
}

// ---------------------------------------------------------------------------
// Standard mode: 30 items, level 1→30 (one per level)
// ---------------------------------------------------------------------------

const STANDARD_TOTAL_ITEMS = 30;

/** Final result for standard measure mode. */
export interface StandardResult {
  /** Raw score out of 30 */
  rawScore: number;
  /** Total items */
  totalItems: 30;
  /** Accuracy (0-1) */
  accuracy: number;
  /** Highest level answered correctly */
  highestCorrectLevel: number;
  /** Mean RT across all trials (ms) */
  meanRt: number;
  /** Per-tier breakdown */
  tierBreakdown: TierScore[];
}

export interface TierScore {
  readonly tierId: string;
  readonly label: string;
  /** Levels covered by this tier (inclusive) */
  readonly minLevel: number;
  readonly maxLevel: number;
  /** Correct answers in this tier */
  readonly correct: number;
  /** Total items in this tier */
  readonly total: number;
}

const TIERS = [
  { id: 'beginner', label: 'Débutant', min: 1, max: 6 },
  { id: 'intermediate', label: 'Intermédiaire', min: 7, max: 12 },
  { id: 'advanced', label: 'Avancé', min: 13, max: 16 },
  { id: 'expert', label: 'Expert', min: 17, max: 20 },
  { id: 'elite', label: 'Élite', min: 21, max: 25 },
  { id: 'master', label: 'Maître', min: 26, max: 28 },
  { id: 'ceiling', label: 'Plafond', min: 29, max: 30 },
] as const;

// ---------------------------------------------------------------------------
// SPM mode: 60 items across 5 series
// ---------------------------------------------------------------------------

const SPM_TOTAL_ITEMS = 60;
const SPM_ITEMS_PER_SERIES = 12;

function spmLevelForItem(itemIndex: number): number {
  const series = Math.floor(itemIndex / SPM_ITEMS_PER_SERIES);
  const posInSeries = itemIndex % SPM_ITEMS_PER_SERIES;
  const baseLevel = 1 + series * 2;
  return baseLevel + (posInSeries >= SPM_ITEMS_PER_SERIES / 2 ? 1 : 0);
}

function spmSeriesForItem(itemIndex: number): number {
  return Math.floor(itemIndex / SPM_ITEMS_PER_SERIES);
}

/** Final result for SPM classic mode. */
export interface SpmResult {
  rawScore: number;
  totalItems: 60;
  accuracy: number;
  seriesScores: [number, number, number, number, number];
  meanRt: number;
}

// ---------------------------------------------------------------------------
// Protocol result (discriminated union)
// ---------------------------------------------------------------------------

export type MeasureProtocolResult =
  | { mode: 'standard'; result: StandardResult }
  | { mode: 'adaptive'; result: MeasureResult }
  | { mode: 'spm'; result: SpmResult };

// ---------------------------------------------------------------------------
// Protocol state machine
// ---------------------------------------------------------------------------

export interface MeasureProtocolState {
  config: MeasureProtocolConfig;
  profile: ReferenceProfile;
  adaptive: AdaptiveState;
  trials: TrialRecord[];
  trialIndex: number;
  finished: boolean;
  /** Tutorial IDs that have been dismissed during this session */
  seenTutorials: ReadonlySet<string>;
}

/** What nextStep returns — either a trial or a tutorial to show first. */
export type MeasureNextStep =
  | { kind: 'trial'; trial: MeasureTrial }
  | { kind: 'tutorial'; gate: RuleTutorialGate }
  | { kind: 'finished' };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize a new measure protocol. */
export function startProtocol(config: MeasureProtocolConfig): MeasureProtocolState {
  const profile: ReferenceProfile = config.mode === 'spm' ? 'iraven' : 'neurodual';

  const startLevel = config.startLevel ?? 1;
  const maxTrials =
    config.mode === 'spm'
      ? SPM_TOTAL_ITEMS
      : config.mode === 'standard'
        ? STANDARD_TOTAL_ITEMS
        : (config.maxTrials ?? 30);

  return {
    config,
    profile,
    adaptive: createProfileAdaptiveState(profile, startLevel, maxTrials),
    trials: [],
    trialIndex: 0,
    finished: false,
    seenTutorials: new Set(config.seenTutorials ?? []),
  };
}

/** Get the level for the current trial index, based on mode. */
function getLevelForTrial(state: MeasureProtocolState): number {
  switch (state.config.mode) {
    case 'standard':
      // Fixed sequence: level = trialIndex + 1 (1, 2, 3, …, 30)
      return state.trialIndex + 1;
    case 'spm':
      return spmLevelForItem(state.trialIndex);
    case 'adaptive':
      return state.adaptive.level;
  }
}

/** Generate the next trial to present. Returns null if protocol is finished. */
export function nextTrial(state: MeasureProtocolState): MeasureTrial | null {
  if (state.finished) return null;

  const level = getLevelForTrial(state);
  const seed = `${state.config.sessionId}-m${state.trialIndex}`;
  const matrix = generateMatrix(seed, level, state.profile);

  return {
    index: state.trialIndex,
    level,
    matrix,
    seed,
  };
}

/**
 * Get the next step: either a tutorial gate to show, or a trial to present.
 * Tutorials trigger in standard and adaptive modes (not SPM, levels ≤ 10).
 */
export function nextStep(state: MeasureProtocolState): MeasureNextStep {
  if (state.finished) return { kind: 'finished' };

  // Check for pending tutorial (standard & adaptive modes)
  if (state.config.mode !== 'spm') {
    const level = getLevelForTrial(state);
    const pending = getPendingTutorial(level, state.seenTutorials);
    if (pending) {
      return { kind: 'tutorial', gate: pending };
    }
  }

  const trial = nextTrial(state);
  if (!trial) return { kind: 'finished' };
  return { kind: 'trial', trial };
}

/**
 * Mark a tutorial as seen and return a new state.
 */
export function dismissTutorial(
  state: MeasureProtocolState,
  tutorialId: string,
): MeasureProtocolState {
  const seenTutorials = new Set(state.seenTutorials);
  seenTutorials.add(tutorialId);
  return { ...state, seenTutorials };
}

/**
 * Submit a response and advance the protocol.
 * Pure function — does not mutate the input state.
 */
export function submitResponse(
  state: MeasureProtocolState,
  selectedIndex: number,
  rt: number,
): { state: MeasureProtocolState; outcome: TrialOutcome } {
  const level = getLevelForTrial(state);
  const seed = `${state.config.sessionId}-m${state.trialIndex}`;
  const matrix = generateMatrix(seed, level, state.profile);
  const correct = selectedIndex === findAnswerIndex(matrix);

  const trial: TrialRecord = { level, correct, rt };
  const trials = [...state.trials, trial];
  const nextIndex = state.trialIndex + 1;

  let adaptive = state.adaptive;
  let finished: boolean;

  switch (state.config.mode) {
    case 'standard':
      adaptive = { ...adaptive, trialCount: nextIndex };
      finished = nextIndex >= STANDARD_TOTAL_ITEMS;
      break;
    case 'spm':
      adaptive = { ...adaptive, trialCount: nextIndex };
      finished = nextIndex >= SPM_TOTAL_ITEMS;
      break;
    case 'adaptive':
      adaptive = adaptDifficulty(adaptive, correct);
      finished = isConverged(adaptive);
      break;
  }

  return {
    state: {
      ...state,
      adaptive,
      trials,
      trialIndex: nextIndex,
      finished,
    },
    outcome: { correct, finished },
  };
}

/** Compute the final result. Call only when state.finished is true. */
export function getResult(state: MeasureProtocolState): MeasureProtocolResult {
  switch (state.config.mode) {
    case 'standard':
      return { mode: 'standard', result: computeStandardResult(state.trials) };
    case 'spm':
      return { mode: 'spm', result: computeSpmResult(state.trials) };
    case 'adaptive':
      return { mode: 'adaptive', result: computeMeasureResult(state.adaptive, state.trials) };
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function findAnswerIndex(_matrix: RavensMatrix): number {
  return 0;
}

function computeStandardResult(trials: TrialRecord[]): StandardResult {
  const rawScore = trials.filter((t) => t.correct).length;
  const totalRt = trials.reduce((sum, t) => sum + t.rt, 0);

  // Highest level answered correctly
  const correctLevels = trials.filter((t) => t.correct).map((t) => t.level);
  const highestCorrectLevel = correctLevels.length > 0 ? Math.max(...correctLevels) : 0;

  // Per-tier breakdown
  const tierBreakdown: TierScore[] = TIERS.map((tier) => {
    const tierTrials = trials.filter((t) => t.level >= tier.min && t.level <= tier.max);
    const correct = tierTrials.filter((t) => t.correct).length;
    return {
      tierId: tier.id,
      label: tier.label,
      minLevel: tier.min,
      maxLevel: tier.max,
      correct,
      total: tierTrials.length,
    };
  });

  return {
    rawScore,
    totalItems: 30,
    accuracy: trials.length > 0 ? rawScore / trials.length : 0,
    highestCorrectLevel,
    meanRt: trials.length > 0 ? totalRt / trials.length : 0,
    tierBreakdown,
  };
}

function computeSpmResult(trials: TrialRecord[]): SpmResult {
  const rawScore = trials.filter((t) => t.correct).length;
  const seriesScores: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (let i = 0; i < trials.length; i++) {
    const series = spmSeriesForItem(i) as 0 | 1 | 2 | 3 | 4;
    // biome-ignore lint: index is within bounds (i < trials.length)
    if (trials[i]!.correct) seriesScores[series]++;
  }

  const totalRt = trials.reduce((sum, t) => sum + t.rt, 0);

  return {
    rawScore,
    totalItems: 60,
    accuracy: trials.length > 0 ? rawScore / trials.length : 0,
    seriesScores,
    meanRt: trials.length > 0 ? totalRt / trials.length : 0,
  };
}
