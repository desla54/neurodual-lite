/**
 * Calibration Algorithm — Pure domain logic for cognitive profile calibration.
 *
 * Pluggable architecture:
 * - **CalibrationStrategy**: decides how to evaluate a block result (level up/down/lock)
 * - **ProgressionStrategy**: decides when to level up/down during post-calibration training
 * - **Sequence config**: which game modes to pair with each modality
 *
 * Default implementations:
 * - Jaeggi 2-block consistency for calibration
 * - Rolling-window threshold for progression
 * - Dual Track + N-Back per modality
 *
 * This module is pure logic — no side effects, no persistence, no UI state.
 * Shared by: calibration store (UI), cognitive profile projection (infra).
 */

// ─── Modalities ──────────────────────────────────────────────────────────────

export const CALIBRATION_MODALITIES = [
  'position',
  'letters',
  'color',
  'shape',
  'spatial',
  'numbers',
  'emotions',
  'semantic',
  'tones',
] as const;

export type CalibrationModality = (typeof CALIBRATION_MODALITIES)[number];

export type CalibrationGameMode = 'dual-track' | 'nback' | 'dual-trace';

// ─── Strategy interfaces ─────────────────────────────────────────────────────

/**
 * CalibrationStrategy — decides how a block result affects the calibration state.
 * Swap this to change the adaptive algorithm (e.g. Jaeggi → staircase → Bayesian).
 */
export interface CalibrationStrategy {
  applyBlockResult(
    current: ModalityCalibrationState,
    score: number,
    gameMode: CalibrationGameMode,
  ): ModalityCalibrationState;
}

/**
 * ProgressionStrategy — decides level up/down during post-calibration training.
 * Swap this to change how the profile evolves over time after initial calibration.
 */
export interface ProgressionStrategy {
  shouldLevelUp(avg: number, gameMode: CalibrationGameMode): boolean;
  shouldLevelDown(avg: number, gameMode: CalibrationGameMode): boolean;
  /** Compute progress toward next level (0-100). windowFill = sessions / ROLLING_WINDOW. */
  computeProgress(avg: number, gameMode: CalibrationGameMode, windowFill: number): number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of trials per N-Back calibration block (20 + N buffer, handled by engine) */
export const NBACK_BLOCK_SIZE = 20;

/** Number of rounds per Dual Track calibration block */
export const DUAL_TRACK_BLOCK_SIZE = 5;

/** Tracking duration for Dual Track calibration (ms) */
export const DUAL_TRACK_CALIBRATION_TRACKING_MS = 15_000;

/** Max blocks per step before force-locking */
export const MAX_BLOCKS_PER_STEP = 6;

/** Accuracy thresholds (Jaeggi) */
export const THRESHOLD_UP = 0.8;
export const THRESHOLD_DOWN = 0.65;

/** Min/max N-levels */
export const CALIBRATION_MIN_LEVEL = 2;
export const CALIBRATION_MAX_LEVEL = 5;

/** Starting level for all calibrations */
export const START_LEVEL = 2;

/** Dual Track ball config per level */
export const DUAL_TRACK_BALL_CONFIG: Record<number, { targets: number; distractors: number }> = {
  2: { targets: 2, distractors: 3 },
  3: { targets: 3, distractors: 3 },
  4: { targets: 4, distractors: 4 },
  5: { targets: 5, distractors: 3 },
};

/** Small screen (<6") adjustment: -1 ball per config */
export const DUAL_TRACK_BALL_CONFIG_SMALL: Record<
  number,
  { targets: number; distractors: number }
> = {
  2: { targets: 2, distractors: 2 },
  3: { targets: 3, distractors: 2 },
  4: { targets: 4, distractors: 3 },
  5: { targets: 5, distractors: 2 },
};

/** Rolling window size for post-calibration progression */
export const ROLLING_WINDOW = 5;

/** Max rounds in a staircase calibration session before force-locking */
export const STAIRCASE_MAX_ROUNDS = 12;

/** Number of failures at the same level to trigger yo-yo lock */
export const STAIRCASE_FAIL_THRESHOLD = 2;

/** N-Back progression: d-prime thresholds */
export const NBACK_DPRIME_UP = 3.0;
export const NBACK_DPRIME_DOWN = 1.5;

/** Dual Track progression: accuracy thresholds */
export const DT_ACCURACY_UP = 0.9;
export const DT_ACCURACY_DOWN = 0.5;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModalityCalibrationState {
  currentLevel: number;
  consecutiveMasteredBlocks: number;
  lastBlockAccuracy: number | null;
  masteredLevel: number | null;
  blocksPlayed: number;
  progressToNext: number;
  rollingScores: number[];
}

export const DEFAULT_MODALITY_STATE: ModalityCalibrationState = {
  currentLevel: START_LEVEL,
  consecutiveMasteredBlocks: 0,
  lastBlockAccuracy: null,
  masteredLevel: null,
  blocksPlayed: 0,
  progressToNext: 0,
  rollingScores: [],
};

// ─── Staircase calibration (intra-session) ──────────────────────────────────

/**
 * State for the intra-session staircase calibration.
 * The staircase adjusts difficulty round-by-round within a single session
 * to rapidly find the player's mastered level.
 */
export interface StaircaseState {
  currentLevel: number;
  /** Number of failures at each level (key = level number) */
  failCounts: Record<number, number>;
  masteredLevel: number | null;
  roundsPlayed: number;
}

export const DEFAULT_STAIRCASE_STATE: StaircaseState = {
  currentLevel: START_LEVEL,
  failCounts: {},
  masteredLevel: null,
  roundsPlayed: 0,
};

/**
 * Apply one round result to the staircase state.
 *
 * - perfect (100% accuracy) → level up (or lock max)
 * - any error → record fail at current level; if 2 fails → yo-yo detected, lock level below
 * - at min level and fail → lock min
 * - force-lock after STAIRCASE_MAX_ROUNDS
 */
export function applyStaircaseRound(state: StaircaseState, perfect: boolean): StaircaseState {
  if (state.masteredLevel != null) return state;

  const next: StaircaseState = {
    ...state,
    roundsPlayed: state.roundsPlayed + 1,
    failCounts: { ...state.failCounts },
  };

  // Force-lock after max rounds
  if (next.roundsPlayed >= STAIRCASE_MAX_ROUNDS) {
    return { ...next, masteredLevel: next.currentLevel };
  }

  if (perfect) {
    // At max → lock max
    if (state.currentLevel >= CALIBRATION_MAX_LEVEL) {
      return { ...next, masteredLevel: CALIBRATION_MAX_LEVEL };
    }
    // Level up
    return { ...next, currentLevel: state.currentLevel + 1 };
  }

  // Failure
  const failsHere = (state.failCounts[state.currentLevel] ?? 0) + 1;
  next.failCounts[state.currentLevel] = failsHere;

  // At min level → lock min
  if (state.currentLevel <= CALIBRATION_MIN_LEVEL) {
    return { ...next, masteredLevel: CALIBRATION_MIN_LEVEL };
  }

  // Yo-yo detected: 2 fails at this level → lock level below
  if (failsHere >= STAIRCASE_FAIL_THRESHOLD) {
    return { ...next, masteredLevel: state.currentLevel - 1 };
  }

  // First fail at this level → drop down
  return { ...next, currentLevel: state.currentLevel - 1 };
}

export interface CalibrationStep {
  modality: CalibrationModality;
  gameMode: CalibrationGameMode;
}

export type CalibrationPhase = 'idle' | 'running' | 'complete';

export interface CalibrationState {
  phase: CalibrationPhase;
  currentStepIndex: number;
  results: Record<string, ModalityCalibrationState>;
  startedAt: number | null;
  completedAt: number | null;
}

export const DEFAULT_CALIBRATION_STATE: CalibrationState = {
  phase: 'idle',
  currentStepIndex: 0,
  results: {},
  startedAt: null,
  completedAt: null,
};

export type CalibrationEvent =
  | { type: 'CALIBRATION_STARTED'; timestamp: number }
  | {
      type: 'CALIBRATION_SESSION_RECORDED';
      timestamp: number;
      modality: CalibrationModality;
      gameMode: CalibrationGameMode;
      score: number;
    }
  | {
      type: 'CALIBRATION_MODALITY_DETERMINED';
      timestamp: number;
      modality: CalibrationModality;
      gameMode: CalibrationGameMode;
      masteredLevel: number;
    }
  | { type: 'CALIBRATION_STEP_SKIPPED'; timestamp: number; stepIndex: number }
  | { type: 'CALIBRATION_BASELINE_SET'; timestamp: number; level: number }
  | { type: 'CALIBRATION_RESET'; timestamp: number }
  | { type: 'CALIBRATION_COMPLETED'; timestamp: number };

// ─── Game mode UI config ─────────────────────────────────────────────────────

/**
 * UI metadata for a calibration game mode.
 * Centralizes label, icon key, and route so the UI never hardcodes game mode details.
 */
export interface CalibrationGameModeConfig {
  readonly id: CalibrationGameMode;
  /** Display label (e.g. 'N-Back', 'Dual Track', 'Dual Trace') */
  readonly label: string;
  /** Icon key — resolved to a component in the UI layer */
  readonly iconKey: 'brain' | 'eye' | 'fingerprint' | 'pencil-line';
  /** Route to navigate to when playing this mode */
  readonly route: string;
}

const GAME_MODE_CONFIGS: Record<CalibrationGameMode, CalibrationGameModeConfig> = {
  'dual-track': {
    id: 'dual-track',
    label: 'Dual Track',
    iconKey: 'eye',
    route: '/dual-track',
  },
  nback: {
    id: 'nback',
    label: 'N-Back',
    iconKey: 'brain',
    route: '/nback',
  },
  'dual-trace': {
    id: 'dual-trace',
    label: 'Dual Trace',
    iconKey: 'pencil-line',
    route: '/dual-trace',
  },
};

/** Get UI config for a specific game mode */
export function getGameModeConfig(mode: CalibrationGameMode): CalibrationGameModeConfig {
  return GAME_MODE_CONFIGS[mode];
}

/**
 * Get the two active game mode configs (in order: primary, secondary).
 * Primary = calibration mode (Dual Track), secondary = derived mode (N-Back).
 */
export function getActiveGameModeConfigs(): readonly [
  CalibrationGameModeConfig,
  CalibrationGameModeConfig,
] {
  const primary = GAME_MODE_CONFIGS[CALIBRATION_SEQUENCE[0]?.gameMode ?? 'dual-track'];
  const secondary = GAME_MODE_CONFIGS[CALIBRATION_DERIVED_MODES[0] ?? 'nback'];
  return [primary, secondary];
}

// ─── Sequence configuration ──────────────────────────────────────────────────

/**
 * Build a calibration sequence.
 * Calibration uses only Dual Track (staircase finds level in one session).
 * N-Back automatically inherits the mastered level from DT per modality.
 */
export function buildCalibrationSequence(
  calibrationMode: CalibrationGameMode = 'dual-track',
): readonly CalibrationStep[] {
  return CALIBRATION_MODALITIES.map((modality) => ({ modality, gameMode: calibrationMode }));
}

/** Default sequence: Dual Track only, one step per modality */
export const CALIBRATION_SEQUENCE: readonly CalibrationStep[] = buildCalibrationSequence();

/** Total number of calibration steps */
export const TOTAL_CALIBRATION_STEPS = CALIBRATION_SEQUENCE.length; // 9

/**
 * Game modes that inherit their level from the calibration mode.
 * When a modality is calibrated via DT, these modes get the same masteredLevel.
 */
export const CALIBRATION_DERIVED_MODES: readonly CalibrationGameMode[] = ['nback'];

/**
 * Training sequence — used post-calibration for the Leitner scheduler.
 * Includes all game modes (DT + NB) per modality, even though calibration only uses DT.
 */
export const TRAINING_SEQUENCE: readonly CalibrationStep[] = CALIBRATION_MODALITIES.flatMap(
  (modality) => [
    { modality, gameMode: 'dual-track' as CalibrationGameMode },
    { modality, gameMode: 'nback' as CalibrationGameMode },
  ],
);

// ─── Default Jaeggi calibration strategy ─────────────────────────────────────

/**
 * Jaeggi-inspired 2-block consistency:
 * - ≥80% → level up
 * - <65% → level down
 * - 65-80% on 2 consecutive blocks → LOCKED as mastered
 * - Force-lock after MAX_BLOCKS_PER_STEP
 */
export const jaeggiCalibrationStrategy: CalibrationStrategy = {
  applyBlockResult(current, score, gameMode) {
    if (current.masteredLevel != null) return current;

    const { up, down } = getCalibrationThresholds(gameMode);

    const next = {
      ...current,
      lastBlockAccuracy: score,
      blocksPlayed: current.blocksPlayed + 1,
    };

    if (next.blocksPlayed >= MAX_BLOCKS_PER_STEP) {
      return { ...next, masteredLevel: next.currentLevel, consecutiveMasteredBlocks: 0 };
    }

    if (score >= up) {
      if (current.currentLevel >= CALIBRATION_MAX_LEVEL) {
        return { ...next, masteredLevel: CALIBRATION_MAX_LEVEL, consecutiveMasteredBlocks: 0 };
      }
      return { ...next, currentLevel: current.currentLevel + 1, consecutiveMasteredBlocks: 0 };
    }

    if (score < down) {
      if (current.currentLevel <= CALIBRATION_MIN_LEVEL) {
        return { ...next, masteredLevel: CALIBRATION_MIN_LEVEL, consecutiveMasteredBlocks: 0 };
      }
      return { ...next, currentLevel: current.currentLevel - 1, consecutiveMasteredBlocks: 0 };
    }

    const newConsecutive = current.consecutiveMasteredBlocks + 1;
    if (newConsecutive >= 2) {
      return {
        ...next,
        masteredLevel: current.currentLevel,
        consecutiveMasteredBlocks: newConsecutive,
      };
    }

    return { ...next, consecutiveMasteredBlocks: newConsecutive };
  },
};

// ─── Default rolling-window progression strategy ─────────────────────────────

export const rollingWindowProgressionStrategy: ProgressionStrategy = {
  shouldLevelUp(avg, gameMode) {
    return gameMode === 'nback' ? avg >= NBACK_DPRIME_UP : avg >= DT_ACCURACY_UP;
  },
  shouldLevelDown(avg, gameMode) {
    return gameMode === 'nback' ? avg <= NBACK_DPRIME_DOWN : avg <= DT_ACCURACY_DOWN;
  },
  computeProgress(avg, gameMode, windowFill) {
    const threshold = gameMode === 'nback' ? NBACK_DPRIME_UP : DT_ACCURACY_UP;
    // Raw ratio of average to threshold (0-1+)
    const rawRatio = avg / threshold;
    // Scale by how full the rolling window is (1/5 sessions = 20% weight)
    const scaledProgress = rawRatio * Math.min(windowFill, 1);
    return Math.max(0, Math.min(100, Math.round(scaledProgress * 100)));
  },
};

function getCalibrationThresholds(gameMode: CalibrationGameMode): { up: number; down: number } {
  if (gameMode === 'nback') {
    return {
      up: NBACK_DPRIME_UP,
      down: NBACK_DPRIME_DOWN,
    };
  }

  return {
    up: THRESHOLD_UP,
    down: THRESHOLD_DOWN,
  };
}

// ─── Active configuration ────────────────────────────────────────────────────

/**
 * Active strategies. Change these to swap algorithms globally.
 * No user-facing option — developer-controlled only.
 */
let activeCalibrationStrategy: CalibrationStrategy = jaeggiCalibrationStrategy;
let activeProgressionStrategy: ProgressionStrategy = rollingWindowProgressionStrategy;

export function setCalibrationStrategy(strategy: CalibrationStrategy): void {
  activeCalibrationStrategy = strategy;
}

export function setProgressionStrategy(strategy: ProgressionStrategy): void {
  activeProgressionStrategy = strategy;
}

export function getCalibrationStrategy(): CalibrationStrategy {
  return activeCalibrationStrategy;
}

export function getProgressionStrategy(): ProgressionStrategy {
  return activeProgressionStrategy;
}

// ─── Public API (delegates to active strategies) ─────────────────────────────

export function applyBlockResult(
  current: ModalityCalibrationState,
  score: number,
  gameMode: CalibrationGameMode,
): ModalityCalibrationState {
  return activeCalibrationStrategy.applyBlockResult(current, score, gameMode);
}

export function shouldLevelUp(avg: number, gameMode: CalibrationGameMode): boolean {
  return activeProgressionStrategy.shouldLevelUp(avg, gameMode);
}

export function shouldLevelDown(avg: number, gameMode: CalibrationGameMode): boolean {
  return activeProgressionStrategy.shouldLevelDown(avg, gameMode);
}

export function computeProgress(
  avg: number,
  gameMode: CalibrationGameMode,
  windowFill = 1,
): number {
  return activeProgressionStrategy.computeProgress(avg, gameMode, windowFill);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function resultKey(modality: CalibrationModality, gameMode: CalibrationGameMode): string {
  return `${modality}:${gameMode}`;
}

export function getResult(
  results: Record<string, ModalityCalibrationState>,
  modality: CalibrationModality,
  gameMode: CalibrationGameMode,
): ModalityCalibrationState {
  return results[resultKey(modality, gameMode)] ?? { ...DEFAULT_MODALITY_STATE };
}

export function getCalibrationProgress(
  state: CalibrationState,
  excludeModalities?: readonly string[],
): number {
  const excludeSet =
    excludeModalities && excludeModalities.length > 0 ? new Set(excludeModalities) : null;
  const activeSteps = excludeSet
    ? CALIBRATION_SEQUENCE.filter((s) => !excludeSet.has(s.modality))
    : CALIBRATION_SEQUENCE;
  if (activeSteps.length === 0) return 1;
  const completed = activeSteps.filter((step) => {
    const r = getResult(state.results, step.modality, step.gameMode);
    return r.masteredLevel != null;
  }).length;
  return completed / activeSteps.length;
}

export function getCurrentCalibrationStep(
  state: CalibrationState,
  excludeModalities?: readonly string[],
): CalibrationStep | null {
  if (state.phase !== 'running') return null;
  const excludeSet =
    excludeModalities && excludeModalities.length > 0 ? new Set(excludeModalities) : null;
  if (!excludeSet) return CALIBRATION_SEQUENCE[state.currentStepIndex] ?? null;
  // Find the next non-excluded incomplete step from current index
  for (let i = state.currentStepIndex; i < CALIBRATION_SEQUENCE.length; i++) {
    const step = CALIBRATION_SEQUENCE[i];
    if (!step || excludeSet.has(step.modality)) continue;
    const r = getResult(state.results, step.modality, step.gameMode);
    if (r.masteredLevel == null) return step;
  }
  return null;
}

export function getMasteredLevel(
  state: CalibrationState,
  modality: CalibrationModality,
  gameMode: CalibrationGameMode,
): number | null {
  return getResult(state.results, modality, gameMode).masteredLevel;
}

export function getBlockSize(gameMode: CalibrationGameMode): number {
  return gameMode === 'dual-track' ? DUAL_TRACK_BLOCK_SIZE : NBACK_BLOCK_SIZE;
}

export function getDualTrackBallConfig(
  level: number,
  smallScreen = false,
): { targets: number; distractors: number; total: number } {
  const config = smallScreen ? DUAL_TRACK_BALL_CONFIG_SMALL : DUAL_TRACK_BALL_CONFIG;
  const clampedLevel = Math.min(Math.max(level, CALIBRATION_MIN_LEVEL), CALIBRATION_MAX_LEVEL);
  const fallbackEntry = config[CALIBRATION_MIN_LEVEL];
  if (!fallbackEntry) {
    throw new Error('[calibration] Missing dual-track ball config for minimum calibration level');
  }
  const entry = config[clampedLevel] ?? fallbackEntry;
  return { ...entry, total: entry.targets + entry.distractors };
}

export function rollingAverage(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─── Event reducer ───────────────────────────────────────────────────────────

export function findNextIncompleteStep(
  results: Record<string, ModalityCalibrationState>,
  fromIndex: number,
): number {
  for (let i = fromIndex; i < CALIBRATION_SEQUENCE.length; i++) {
    const step = CALIBRATION_SEQUENCE[i];
    if (!step) continue;
    const r = getResult(results, step.modality, step.gameMode);
    if (r.masteredLevel == null) return i;
  }
  return CALIBRATION_SEQUENCE.length;
}

/** Check if calibration is complete when some modalities are excluded. */
export function isCalibrationCompleteWithExclusions(
  state: CalibrationState,
  excludeModalities?: readonly string[],
): boolean {
  if (state.phase === 'complete') return true;
  const excludeSet =
    excludeModalities && excludeModalities.length > 0 ? new Set(excludeModalities) : null;
  if (!excludeSet) return false;
  // All non-excluded steps must have a mastered level
  return CALIBRATION_SEQUENCE.filter((s) => !excludeSet.has(s.modality)).every((step) => {
    const r = getResult(state.results, step.modality, step.gameMode);
    return r.masteredLevel != null;
  });
}

function applyRecordedSession(
  state: CalibrationState,
  input: {
    readonly timestamp: number;
    readonly modality: CalibrationModality;
    readonly gameMode: CalibrationGameMode;
    readonly score: number;
  },
): CalibrationState {
  const stepKey = resultKey(input.modality, input.gameMode);
  const runningState =
    state.phase === 'idle'
      ? {
          ...state,
          phase: 'running' as const,
          startedAt: state.startedAt ?? input.timestamp,
          currentStepIndex: findNextIncompleteStep(state.results, 0),
        }
      : state;
  const current = getResult(runningState.results, input.modality, input.gameMode);

  if (current.masteredLevel == null) {
    const updated = applyBlockResult(current, input.score, input.gameMode);
    const newResults = { ...runningState.results, [stepKey]: updated };

    if (updated.masteredLevel != null) {
      const nextIndex = findNextIncompleteStep(newResults, 0);
      if (nextIndex >= CALIBRATION_SEQUENCE.length) {
        return {
          ...runningState,
          phase: 'complete',
          results: newResults,
          currentStepIndex: nextIndex,
          completedAt: input.timestamp,
        };
      }
      return { ...runningState, results: newResults, currentStepIndex: nextIndex };
    }

    return { ...runningState, results: newResults };
  }

  if (current.masteredLevel >= CALIBRATION_MAX_LEVEL) {
    return runningState;
  }

  const newRolling = [...current.rollingScores, input.score].slice(-ROLLING_WINDOW);
  const avg = rollingAverage(newRolling);
  const progress = computeProgress(avg, input.gameMode, newRolling.length / ROLLING_WINDOW);

  if (newRolling.length >= ROLLING_WINDOW && shouldLevelUp(avg, input.gameMode)) {
    return {
      ...runningState,
      results: {
        ...runningState.results,
        [stepKey]: {
          ...current,
          masteredLevel: Math.min(current.masteredLevel + 1, CALIBRATION_MAX_LEVEL),
          progressToNext: 0,
          lastBlockAccuracy: input.score,
          rollingScores: [],
        },
      },
    };
  }

  if (newRolling.length >= ROLLING_WINDOW && shouldLevelDown(avg, input.gameMode)) {
    return {
      ...runningState,
      results: {
        ...runningState.results,
        [stepKey]: {
          ...current,
          masteredLevel: Math.max(current.masteredLevel - 1, CALIBRATION_MIN_LEVEL),
          progressToNext: 0,
          lastBlockAccuracy: input.score,
          rollingScores: [],
        },
      },
    };
  }

  return {
    ...runningState,
    results: {
      ...runningState.results,
      [stepKey]: {
        ...current,
        progressToNext: progress,
        lastBlockAccuracy: input.score,
        rollingScores: newRolling,
      },
    },
  };
}

function applyBaselineLevel(
  state: CalibrationState,
  input: { readonly timestamp: number; readonly level: number },
): CalibrationState {
  const level = Math.min(Math.max(input.level, CALIBRATION_MIN_LEVEL), CALIBRATION_MAX_LEVEL);
  let changed = false;
  const newResults = { ...state.results };

  for (const step of CALIBRATION_SEQUENCE) {
    const key = resultKey(step.modality, step.gameMode);
    const current = getResult(newResults, step.modality, step.gameMode);
    if (current.masteredLevel != null) continue;
    changed = true;
    const baselineState = {
      ...DEFAULT_MODALITY_STATE,
      currentLevel: level,
      masteredLevel: level,
    };
    newResults[key] = baselineState;
    // Propagate to derived modes
    for (const derivedMode of CALIBRATION_DERIVED_MODES) {
      const derivedKey = resultKey(step.modality, derivedMode);
      const derivedCurrent = getResult(newResults, step.modality, derivedMode);
      if (derivedCurrent.masteredLevel != null) continue;
      newResults[derivedKey] = baselineState;
    }
  }

  if (!changed) {
    return state.phase === 'idle'
      ? {
          ...state,
          phase: 'complete',
          currentStepIndex: CALIBRATION_SEQUENCE.length,
          startedAt: state.startedAt ?? input.timestamp,
          completedAt: state.completedAt ?? input.timestamp,
        }
      : state;
  }

  return {
    ...state,
    phase: 'complete',
    results: newResults,
    currentStepIndex: CALIBRATION_SEQUENCE.length,
    startedAt: state.startedAt ?? input.timestamp,
    completedAt: input.timestamp,
  };
}

export function applyCalibrationEvent(
  state: CalibrationState,
  event: CalibrationEvent,
): CalibrationState {
  switch (event.type) {
    case 'CALIBRATION_STARTED':
      return {
        ...state,
        phase: 'running',
        startedAt: state.startedAt ?? event.timestamp,
        currentStepIndex: findNextIncompleteStep(state.results, 0),
      };

    case 'CALIBRATION_SESSION_RECORDED':
      return applyRecordedSession(state, event);

    case 'CALIBRATION_MODALITY_DETERMINED': {
      const key = resultKey(event.modality, event.gameMode);
      const current = getResult(state.results, event.modality, event.gameMode);
      const level = Math.min(
        Math.max(event.masteredLevel, CALIBRATION_MIN_LEVEL),
        CALIBRATION_MAX_LEVEL,
      );
      const newResults: Record<string, ModalityCalibrationState> = {
        ...state.results,
        [key]: { ...current, masteredLevel: level, currentLevel: level },
      };
      // Propagate to derived modes (e.g. DT calibration → NB gets same level)
      for (const derivedMode of CALIBRATION_DERIVED_MODES) {
        const derivedKey = resultKey(event.modality, derivedMode);
        const derivedCurrent = getResult(newResults, event.modality, derivedMode);
        newResults[derivedKey] = {
          ...derivedCurrent,
          masteredLevel: level,
          currentLevel: level,
        };
      }
      const runningState =
        state.phase === 'idle'
          ? { ...state, phase: 'running' as const, startedAt: state.startedAt ?? event.timestamp }
          : state;
      const nextIndex = findNextIncompleteStep(newResults, 0);
      if (nextIndex >= CALIBRATION_SEQUENCE.length) {
        return {
          ...runningState,
          phase: 'complete',
          results: newResults,
          currentStepIndex: nextIndex,
          completedAt: event.timestamp,
        };
      }
      return { ...runningState, results: newResults, currentStepIndex: nextIndex };
    }

    case 'CALIBRATION_STEP_SKIPPED': {
      const step = CALIBRATION_SEQUENCE[event.stepIndex];
      if (!step) return state;
      const key = resultKey(step.modality, step.gameMode);
      const current = getResult(state.results, step.modality, step.gameMode);
      const newResults = {
        ...state.results,
        [key]: { ...current, masteredLevel: current.currentLevel },
      };
      const nextIndex = findNextIncompleteStep(newResults, event.stepIndex + 1);
      if (nextIndex >= CALIBRATION_SEQUENCE.length) {
        return {
          ...state,
          phase: 'complete',
          results: newResults,
          currentStepIndex: nextIndex,
          completedAt: event.timestamp,
        };
      }
      return { ...state, results: newResults, currentStepIndex: nextIndex };
    }

    case 'CALIBRATION_BASELINE_SET':
      return applyBaselineLevel(state, event);

    case 'CALIBRATION_RESET':
      return { ...DEFAULT_CALIBRATION_STATE };

    case 'CALIBRATION_COMPLETED':
      return { ...state, phase: 'complete', completedAt: event.timestamp };
  }
}

export function reduceCalibrationEvents(events: readonly CalibrationEvent[]): CalibrationState {
  return events.reduce<CalibrationState>((state, event) => applyCalibrationEvent(state, event), {
    ...DEFAULT_CALIBRATION_STATE,
  });
}

export interface CalibrationBaselineFact {
  readonly level: number;
  readonly timestamp: number;
}

export interface CalibrationResetFact {
  readonly timestamp: number;
}

export interface CalibrationSessionFact {
  readonly modality: CalibrationModality;
  readonly gameMode: CalibrationGameMode;
  readonly score: number;
  readonly timestamp: number;
}

export interface CalibrationProjectionFacts {
  readonly baselines?: readonly CalibrationBaselineFact[];
  readonly resets?: readonly CalibrationResetFact[];
  readonly sessions?: readonly CalibrationSessionFact[];
}

export function projectCalibrationProfileFromFacts(
  input: CalibrationProjectionFacts,
): CalibrationState {
  const timeline = [
    ...(input.sessions ?? []).map((session, index) => ({
      event: {
        type: 'CALIBRATION_SESSION_RECORDED' as const,
        timestamp: session.timestamp,
        modality: session.modality,
        gameMode: session.gameMode,
        score: session.score,
      },
      timestamp: session.timestamp,
      order: 0,
      index,
    })),
    ...(input.baselines ?? []).map((baseline, index) => ({
      event: {
        type: 'CALIBRATION_BASELINE_SET' as const,
        timestamp: baseline.timestamp,
        level: baseline.level,
      },
      timestamp: baseline.timestamp,
      order: 1,
      index,
    })),
    ...(input.resets ?? []).map((reset, index) => ({
      event: {
        type: 'CALIBRATION_RESET' as const,
        timestamp: reset.timestamp,
      },
      timestamp: reset.timestamp,
      order: 2,
      index,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp || a.order - b.order || a.index - b.index);

  return reduceCalibrationEvents(timeline.map((entry) => entry.event));
}

export function computeGlobalScore(results: Record<string, ModalityCalibrationState>): number {
  let sum = 0;
  for (const step of CALIBRATION_SEQUENCE) {
    const key = resultKey(step.modality, step.gameMode);
    const result = results[key];
    const level = result?.masteredLevel ?? 0;
    const progress = result?.progressToNext ?? 0;
    const effective =
      level > 0 ? level - 1 + (level < CALIBRATION_MAX_LEVEL ? progress / 100 : 1) : 0;
    sum += effective;
  }
  const maxPossible = TOTAL_CALIBRATION_STEPS * CALIBRATION_MAX_LEVEL;
  return maxPossible > 0 ? Math.round((sum / maxPossible) * 100) : 0;
}

export function findModalityExtremes(results: Record<string, ModalityCalibrationState>): {
  strongest: CalibrationModality | null;
  weakest: CalibrationModality | null;
} {
  let strongest: CalibrationModality | null = null;
  let weakest: CalibrationModality | null = null;
  let bestScore = -1;
  let worstScore = Infinity;

  for (const modality of CALIBRATION_MODALITIES) {
    // Sum scores across all game modes for this modality
    let totalScore = 0;
    let modeCount = 0;
    for (const step of CALIBRATION_SEQUENCE) {
      if (step.modality !== modality) continue;
      const r = results[resultKey(step.modality, step.gameMode)];
      totalScore += (r?.progressToNext ?? 0) + (r?.masteredLevel ?? 0) * 100;
      modeCount++;
    }
    if (modeCount === 0) continue;
    const avg = totalScore / modeCount;

    if (avg <= 0) continue;

    if (avg > bestScore) {
      bestScore = avg;
      strongest = modality;
    }
    if (avg < worstScore) {
      worstScore = avg;
      weakest = modality;
    }
  }

  // If all modalities have the same score, there's no meaningful strongest/weakest
  if (weakest === strongest || (bestScore > 0 && Math.abs(bestScore - worstScore) < 1)) {
    return { strongest: null, weakest: null };
  }

  return { strongest, weakest };
}

// ─── Modality mapping tables ─────────────────────────────────────────────────

/** Maps calibration modality to the Dual Track identity mode key. */
export const MODALITY_TO_DT_IDENTITY: Record<CalibrationModality, string> = {
  position: 'position',
  shape: 'image',
  color: 'color',
  letters: 'letter',
  spatial: 'spatial',
  numbers: 'digits',
  emotions: 'emotions',
  semantic: 'words',
  tones: 'tones',
};

/** Maps calibration modality to the N-Back modality channels. */
export const MODALITY_TO_NB_MODALITIES: Record<CalibrationModality, readonly string[]> = {
  position: ['position'],
  shape: ['image'],
  color: ['color'],
  letters: ['audio'],
  spatial: ['spatial'],
  numbers: ['digits'],
  emotions: ['emotions'],
  semantic: ['words'],
  tones: ['tones'],
};

// ─── Score & evidence helpers ────────────────────────────────────────────────

/** Score for a single calibration step result, normalized 0-100. */
export function getCalibrationStepScore(result: ModalityCalibrationState | undefined): number {
  const level = result?.masteredLevel;
  if (level == null || level <= 0) return 0;
  const effective =
    level - 1 + (level < CALIBRATION_MAX_LEVEL ? (result?.progressToNext ?? 0) / 100 : 1);
  return Math.round((effective / CALIBRATION_MAX_LEVEL) * 100);
}

/** Shared mastered level across two game mode results for a modality. */
export function getSharedModalityLevel(
  primaryResult: ModalityCalibrationState | undefined,
  secondaryResult: ModalityCalibrationState | undefined,
): number {
  const primaryLevel = primaryResult?.masteredLevel ?? 0;
  const secondaryLevel = secondaryResult?.masteredLevel ?? 0;
  if (primaryLevel <= 0 || secondaryLevel <= 0) return 0;
  return Math.min(primaryLevel, secondaryLevel);
}

export type ModalityEvidenceStatus = 'none' | 'baseline' | 'mixed' | 'session';

/** Combined evidence status from two game mode sources. */
export function getModalityEvidenceStatus(
  primarySource: string | undefined,
  secondarySource: string | undefined,
): ModalityEvidenceStatus {
  const left = primarySource ?? 'none';
  const right = secondarySource ?? 'none';
  if (left === 'none' && right === 'none') return 'none';
  if (left === 'session' && right === 'session') return 'session';
  if (left === 'baseline' && right === 'baseline') return 'baseline';
  return 'mixed';
}

/** Extract the appropriate score metric for a calibration session result. */
export function getCalibrationSessionScore(
  gameMode: CalibrationGameMode,
  modeScore: { readonly value: number; readonly unit: string },
  unifiedAccuracy: number,
): number {
  return gameMode === 'nback' && modeScore.unit === "d'" ? modeScore.value : unifiedAccuracy;
}

// ─── Play config builder ─────────────────────────────────────────────────────

export interface CalibrationPlayConfig {
  readonly modality: CalibrationModality;
  readonly identityMode: string;
  readonly targets: number;
  readonly distractors: number;
  readonly trackingMs: number;
  readonly blockSize: number;
  readonly level: number;
  readonly nbackModalities: readonly string[];
}

/** Build a play config from a calibration/training step. Returns null if the modality mapping is missing. */
export function buildCalibrationPlayConfig(
  modality: CalibrationModality,
  gameMode: CalibrationGameMode,
  level: number,
): CalibrationPlayConfig | null {
  const identityMode = MODALITY_TO_DT_IDENTITY[modality];
  const nbackModalities = MODALITY_TO_NB_MODALITIES[modality];
  if (!identityMode || !nbackModalities) return null;

  const ballConfig = getDualTrackBallConfig(level);
  return {
    modality,
    identityMode,
    targets: ballConfig.targets,
    distractors: ballConfig.distractors,
    trackingMs: DUAL_TRACK_CALIBRATION_TRACKING_MS,
    blockSize: gameMode === 'dual-track' ? DUAL_TRACK_BLOCK_SIZE : NBACK_BLOCK_SIZE,
    level,
    nbackModalities,
  };
}

// ─── Progression Scheduler (Leitner-based) ───────────────────────────────────

/**
 * A recommended next training session.
 */
export interface NextTrainingSession {
  readonly modality: CalibrationModality;
  readonly gameMode: CalibrationGameMode;
  readonly level: number;
  /** Review interval assigned by the Leitner box (1 = every session, 4 = every 4 sessions) */
  readonly interval: number;
  /** How "overdue" this step is (>1 = overdue, <1 = not yet due) */
  readonly overdueRatio: number;
  /** Human-readable reason for picking this step */
  readonly reason: 'weakest' | 'catch-up' | 'maintain' | 'master' | 'training';
}

/**
 * Leitner-based progression scheduler.
 *
 * Adapted Leitner system where each step (modality × gameMode) is assigned
 * a review interval based on its level relative to the weakest in the profile:
 *
 *   interval = 1 + (level - minLevel)
 *
 * - Weakest level → interval 1 (every session)
 * - 1 above weakest → interval 2 (every 2 sessions)
 * - 2 above → interval 3
 * - etc.
 *
 * Special case: at max level but not yet mastered (progressToNext < 80),
 * the interval is capped at 2 to keep training frequently.
 *
 * The scheduler computes how "overdue" each step is:
 *   overdueRatio = sessionsSinceLastPlay / interval
 *
 * The most overdue step is picked. This naturally:
 * - Prioritizes weaknesses (short interval, overdue faster)
 * - Cycles through stronger steps (long interval, eventually overdue)
 * - Never completely ignores any step
 *
 * @param results - Current calibration state per step
 * @param recentStepKeys - Ordered list of recently played step keys (most recent first),
 *   e.g. ['position:dual-track', 'letters:nback', ...]. Used to compute sessions since last play.
 * @param excludeModalities - Modalities to skip (disabled by user in profile settings).
 */
export function pickNextTrainingSession(
  results: Record<string, ModalityCalibrationState>,
  recentStepKeys?: readonly string[],
  excludeModalities?: readonly string[],
): NextTrainingSession | null {
  const excludeSet =
    excludeModalities && excludeModalities.length > 0 ? new Set(excludeModalities) : null;
  const activeSequence = excludeSet
    ? TRAINING_SEQUENCE.filter((s) => !excludeSet.has(s.modality))
    : TRAINING_SEQUENCE;
  if (activeSequence.length === 0) return null;

  // Find min and max levels across all steps
  let minLevel = CALIBRATION_MAX_LEVEL;
  let maxLevel = CALIBRATION_MIN_LEVEL;
  let hasAnyResult = false;
  for (const step of activeSequence) {
    const r = results[resultKey(step.modality, step.gameMode)];
    if (r?.masteredLevel != null && r.masteredLevel > 0) {
      hasAnyResult = true;
      if (r.masteredLevel < minLevel) minLevel = r.masteredLevel;
      if (r.masteredLevel > maxLevel) maxLevel = r.masteredLevel;
    }
  }
  const allSameLevel = minLevel === maxLevel;

  // If nothing calibrated, return first step
  if (!hasAnyResult) {
    const first = activeSequence[0];
    if (!first) return null;
    return {
      modality: first.modality,
      gameMode: first.gameMode,
      level: START_LEVEL,
      interval: 1,
      overdueRatio: 1,
      reason: 'weakest',
    };
  }

  // Build index: how many sessions ago was each step last played?
  const sessionsSinceLastPlay = new Map<string, number>();
  if (recentStepKeys && recentStepKeys.length > 0) {
    for (let i = 0; i < recentStepKeys.length; i++) {
      const key = recentStepKeys[i];
      if (!key) continue;
      if (!sessionsSinceLastPlay.has(key)) {
        sessionsSinceLastPlay.set(key, i + 1); // 1-based: most recent = 1
      }
    }
  }
  // Steps not in recent history are considered very overdue
  const defaultSessionsAgo = (recentStepKeys?.length ?? 0) + activeSequence.length;

  // Pairing rule: the training flow alternates DT → NB per modality,
  // following activeSequence order. If the most recent step was
  // modality X in dual-track, the next must be X in nback (the paired step).
  // Only after both modes of a modality are played do we move to the next.
  const lastKey = recentStepKeys?.[0];
  if (lastKey) {
    const [lastMod] = lastKey.split(':') as [string, string];
    // Skip pairing if the last modality is excluded
    if (!excludeSet?.has(lastMod as string)) {
      // Find the paired step in the sequence (same modality, other game mode)
      const pairedStep = activeSequence.find(
        (s) => s.modality === lastMod && resultKey(s.modality, s.gameMode) !== lastKey,
      );
      if (pairedStep) {
        const pairedKey = resultKey(pairedStep.modality, pairedStep.gameMode);
        const pairedPlayed = sessionsSinceLastPlay.has(pairedKey);
        // If the paired mode hasn't been played recently, recommend it
        if (!pairedPlayed) {
          const r = results[pairedKey];
          const level = r?.masteredLevel ?? START_LEVEL;
          return {
            modality: pairedStep.modality,
            gameMode: pairedStep.gameMode,
            level,
            interval: 1,
            overdueRatio: defaultSessionsAgo,
            reason: allSameLevel ? 'training' : level === minLevel ? 'weakest' : 'catch-up',
          };
        }
      }
    }
  }

  // Build set of modalities that have been played (in any game mode)
  const playedModalities = new Set<string>();
  if (recentStepKeys) {
    for (const key of recentStepKeys) {
      const mod = key?.split(':')[0];
      if (mod) playedModalities.add(mod);
    }
  }

  // Score each step via Leitner scheduling
  let bestCandidate: NextTrainingSession | null = null;
  let bestOverdueRatio = -1;
  let bestModalityIsNew = false;

  for (const step of activeSequence) {
    const key = resultKey(step.modality, step.gameMode);
    const r = results[key];
    const level = r?.masteredLevel ?? START_LEVEL;
    const progress = r?.progressToNext ?? 0;

    // Compute Leitner box interval
    let interval = 1 + (level - minLevel);

    // At max level but not mastered: keep reviewing frequently
    if (level >= CALIBRATION_MAX_LEVEL && progress < 80) {
      interval = Math.min(interval, 2);
    }

    // Ensure interval is at least 1
    interval = Math.max(1, interval);

    // How overdue is this step?
    const sessionsAgo = sessionsSinceLastPlay.get(key) ?? defaultSessionsAgo;
    const overdueRatio = sessionsAgo / interval;

    // Determine reason
    let reason: NextTrainingSession['reason'];
    if (allSameLevel) {
      reason = level >= CALIBRATION_MAX_LEVEL && progress < 80 ? 'master' : 'training';
    } else if (level >= CALIBRATION_MAX_LEVEL && progress < 80) {
      reason = 'master';
    } else if (level === minLevel) {
      reason = 'weakest';
    } else if (level < minLevel + 2) {
      reason = 'catch-up';
    } else {
      reason = 'maintain';
    }

    // Tiebreaker: prefer modalities the user hasn't played at all
    const modalityIsNew = !playedModalities.has(step.modality);
    const isBetter =
      overdueRatio > bestOverdueRatio ||
      (overdueRatio === bestOverdueRatio && modalityIsNew && !bestModalityIsNew);

    if (isBetter) {
      bestOverdueRatio = overdueRatio;
      bestModalityIsNew = modalityIsNew;
      bestCandidate = {
        modality: step.modality,
        gameMode: step.gameMode,
        level,
        interval,
        overdueRatio,
        reason,
      };
    }
  }

  return bestCandidate;
}

// ─── Modality labels (UI-safe, i18n fallback) ───────────────────────────────

export const CALIBRATION_MODALITY_LABELS: Record<CalibrationModality, string> = {
  position: 'Position',
  shape: 'Formes',
  color: 'Couleurs',
  letters: 'Lettres',
  spatial: 'Spatial',
  numbers: 'Chiffres',
  emotions: 'Émotions',
  semantic: 'Mots',
  tones: 'Tonalités',
};
