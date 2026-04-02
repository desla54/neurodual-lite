/**
 * Journey Progression
 *
 * Pure progression logic for all journey types:
 * - NeuroDual Mix: +10% per session with accuracy >= 85%
 * - DNB Classic (Jaeggi): < 3 worst-modality errors → level up, > 5 → level down
 * - Brain Workshop: score >= 80% → level up, 3 consecutive < 50% → level down
 */

import {
  generateJourneyStages,
  NEURODUAL_MIX_GAME_MODES,
  type JourneyState,
  type JourneyStageProgress,
} from '@neurodual/logic';

// ---------------------------------------------------------------------------
// Constants (matching original thresholds from specs/thresholds.ts)
// ---------------------------------------------------------------------------

// NeuroDual Mix
const NEURODUAL_ACCURACY_THRESHOLD = 0.85;
const NEURODUAL_PROGRESS_PER_SESSION = 10;

// Jaeggi (DNB Classic)
const JAEGGI_MAX_ERRORS_PER_MODALITY = 3; // < 3 → level up
const JAEGGI_ERRORS_DOWN = 5; // > 5 → level down

// BrainWorkshop
const BW_SCORE_UP = 80; // >= 80% → level up
const BW_SCORE_STRIKE = 50; // < 50% → strike
const BW_STRIKES_TO_DOWN = 3; // 3 strikes → level down

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface JourneySessionResult {
  readonly gameMode: string;
  readonly nLevel: number;
  /** Accuracy as a ratio 0-1. */
  readonly accuracy: number;
  /** UPS score 0-100 (used by BW protocol). */
  readonly upsScore?: number;
  /** Per-modality error counts: misses + falseAlarms. */
  readonly modalityErrors?: readonly number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCurrentStage(
  state: JourneyState,
  nLevel: number,
  gameMode?: string,
): { stageDef: { stageId: number; nLevel: number }; stageProgress: JourneyStageProgress } | null {
  const stageDefinitions = generateJourneyStages(
    state.targetLevel,
    state.startLevel,
    true,
    gameMode,
  );
  const stageDef = stageDefinitions.find((s) => s.nLevel === nLevel);
  if (!stageDef) return null;
  const stageProgress = state.stages.find((s) => s.stageId === stageDef.stageId);
  if (!stageProgress) return null;
  if (stageProgress.status === 'locked' || stageProgress.status === 'completed') return null;
  return { stageDef, stageProgress };
}

function applyStageResult(
  state: JourneyState,
  stageId: number,
  update: Partial<JourneyStageProgress> & { stageCompleted: boolean },
  gameMode?: string,
): JourneyState {
  const stageDefinitions = generateJourneyStages(
    state.targetLevel,
    state.startLevel,
    true,
    gameMode,
  );
  const { stageCompleted, ...stageUpdate } = update;

  const updatedStages: JourneyStageProgress[] = state.stages.map((s) => {
    if (s.stageId === stageId) {
      return {
        ...s,
        ...stageUpdate,
        status: stageCompleted ? 'completed' : s.status,
      } satisfies JourneyStageProgress;
    }
    if (stageCompleted && s.stageId === stageId + 1 && s.status === 'locked') {
      return { ...s, status: 'unlocked' } satisfies JourneyStageProgress;
    }
    // If level down: reopen the previous stage (mark current back to locked handled by caller)
    return s;
  });

  const newCurrentStage = stageCompleted
    ? Math.min(state.currentStage + 1, stageDefinitions.length)
    : state.currentStage;

  return { ...state, stages: updatedStages, currentStage: newCurrentStage };
}

function applyLevelDown(state: JourneyState, stageId: number, _gameMode?: string): JourneyState {
  if (stageId <= 1) return state; // Can't go below stage 1

  const prevStageId = stageId - 1;
  const updatedStages: JourneyStageProgress[] = state.stages.map((s) => {
    // Re-open previous stage
    if (s.stageId === prevStageId) {
      return {
        ...s,
        status: 'unlocked',
        progressPct: 0,
        validatingSessions: 0,
      } satisfies JourneyStageProgress;
    }
    // Lock current stage
    if (s.stageId === stageId) {
      return {
        ...s,
        status: 'locked',
        progressPct: 0,
        validatingSessions: 0,
      } satisfies JourneyStageProgress;
    }
    return s;
  });

  return {
    ...state,
    stages: updatedStages,
    currentStage: prevStageId,
    consecutiveStrikes: 0,
  };
}

// ---------------------------------------------------------------------------
// NeuroDual Mix progression
// ---------------------------------------------------------------------------

export function isNeuroDualMixSession(result: JourneySessionResult): boolean {
  return (NEURODUAL_MIX_GAME_MODES as readonly string[]).includes(result.gameMode);
}

export function applyNeuroDualMixSession(
  state: JourneyState,
  result: JourneySessionResult,
): JourneyState | null {
  if (!isNeuroDualMixSession(result)) return null;

  const found = findCurrentStage(state, result.nLevel, 'neurodual-mix');
  if (!found) return null;

  const isStroop = result.gameMode === 'stroop-flex';
  const isDnb = result.gameMode === 'dualnback-classic';
  const passed = result.accuracy >= NEURODUAL_ACCURACY_THRESHOLD;
  const currentPct = found.stageProgress.progressPct ?? 0;
  const score = Math.round(result.accuracy * 100);

  // --- Stroop Flex ---
  if (isStroop) {
    if (!passed) {
      // Failed Stroop: stay on Stroop, no progression change
      return null;
    }
    // Passed Stroop: +10%, next = DNB Classic
    const newPct = Math.min(100, currentPct + NEURODUAL_PROGRESS_PER_SESSION);
    const updated = applyStageResult(
      state,
      found.stageDef.stageId,
      {
        progressPct: newPct,
        validatingSessions: found.stageProgress.validatingSessions + 1,
        bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
        stageCompleted: newPct >= 100,
      },
      'neurodual-mix',
    );
    return { ...updated, nextSessionGameMode: 'dualnback-classic' };
  }

  // --- DNB Classic ---
  if (isDnb) {
    if (passed) {
      // Passed DNB: +10%, next = Stroop Flex
      const newPct = Math.min(100, currentPct + NEURODUAL_PROGRESS_PER_SESSION);
      const updated = applyStageResult(
        state,
        found.stageDef.stageId,
        {
          progressPct: newPct,
          validatingSessions: found.stageProgress.validatingSessions + 1,
          bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
          stageCompleted: newPct >= 100,
        },
        'neurodual-mix',
      );
      return { ...updated, nextSessionGameMode: 'stroop-flex' };
    }
    // Failed DNB: cancel previous Stroop gain (-10%), next = Stroop Flex
    const newPct = Math.max(0, currentPct - NEURODUAL_PROGRESS_PER_SESSION);
    const updated = applyStageResult(
      state,
      found.stageDef.stageId,
      {
        progressPct: newPct,
        bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
        stageCompleted: false,
      },
      'neurodual-mix',
    );
    return { ...updated, nextSessionGameMode: 'stroop-flex' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// DNB Classic (Jaeggi) progression
// ---------------------------------------------------------------------------

export function applyJaeggiSession(
  state: JourneyState,
  result: JourneySessionResult,
): JourneyState | null {
  if (result.gameMode !== 'dualnback-classic') return null;

  const found = findCurrentStage(state, result.nLevel);
  if (!found) return null;

  // Determine decision from per-modality errors
  let decision: 'up' | 'stay' | 'down' = 'stay';

  if (result.modalityErrors && result.modalityErrors.length > 0) {
    const maxErrors = Math.max(...result.modalityErrors);
    if (maxErrors < JAEGGI_MAX_ERRORS_PER_MODALITY) {
      decision = 'up';
    } else if (maxErrors > JAEGGI_ERRORS_DOWN) {
      decision = 'down';
    }
  } else {
    // Fallback: use accuracy
    if (result.accuracy >= 0.9) decision = 'up';
    else if (result.accuracy < 0.5) decision = 'down';
  }

  const score = Math.round(result.accuracy * 100);

  if (decision === 'up') {
    return applyStageResult(state, found.stageDef.stageId, {
      validatingSessions: found.stageProgress.validatingSessions + 1,
      bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
      stageCompleted: true,
    });
  }

  if (decision === 'down') {
    // Update bestScore before leveling down
    const updated = applyStageResult(state, found.stageDef.stageId, {
      bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
      stageCompleted: false,
    });
    return applyLevelDown(updated, found.stageDef.stageId);
  }

  // Stay
  return applyStageResult(state, found.stageDef.stageId, {
    validatingSessions: found.stageProgress.validatingSessions + 1,
    bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
    stageCompleted: false,
  });
}

// ---------------------------------------------------------------------------
// Brain Workshop progression
// ---------------------------------------------------------------------------

export function applyBrainWorkshopSession(
  state: JourneyState,
  result: JourneySessionResult,
): JourneyState | null {
  if (result.gameMode !== 'sim-brainworkshop') return null;

  const found = findCurrentStage(state, result.nLevel);
  if (!found) return null;

  const score = result.upsScore ?? Math.round(result.accuracy * 100);
  const strikesBefore = state.consecutiveStrikes ?? 0;

  // >= 80% → immediate level up
  if (score >= BW_SCORE_UP) {
    const updated = applyStageResult(state, found.stageDef.stageId, {
      validatingSessions: found.stageProgress.validatingSessions + 1,
      bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
      stageCompleted: true,
    });
    return { ...updated, consecutiveStrikes: 0 };
  }

  // < 50% → strike
  if (score < BW_SCORE_STRIKE) {
    const strikesAfter = strikesBefore + 1;

    if (strikesAfter >= BW_STRIKES_TO_DOWN) {
      // 3 strikes → level down
      const updated = applyStageResult(state, found.stageDef.stageId, {
        bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
        stageCompleted: false,
      });
      return applyLevelDown(updated, found.stageDef.stageId);
    }

    // Record strike
    const updated = applyStageResult(state, found.stageDef.stageId, {
      bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
      stageCompleted: false,
    });
    return { ...updated, consecutiveStrikes: strikesAfter };
  }

  // 50-79% → stay (reset strikes)
  const updated = applyStageResult(state, found.stageDef.stageId, {
    validatingSessions: found.stageProgress.validatingSessions + 1,
    bestScore: Math.max(found.stageProgress.bestScore ?? 0, score),
    stageCompleted: false,
  });
  return { ...updated, consecutiveStrikes: 0 };
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

/**
 * Apply a session result to the appropriate journey based on gameMode.
 * Returns the updated state, or null if the session doesn't match any journey protocol.
 */
export function applySessionToJourney(
  state: JourneyState,
  journeyGameMode: string,
  result: JourneySessionResult,
): JourneyState | null {
  switch (journeyGameMode) {
    case 'neurodual-mix':
      return applyNeuroDualMixSession(state, result);
    case 'dualnback-classic':
      return applyJaeggiSession(state, result);
    case 'sim-brainworkshop':
      return applyBrainWorkshopSession(state, result);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// State builders
// ---------------------------------------------------------------------------

export function buildFreshJourneyState(
  startLevel: number,
  targetLevel: number,
  gameMode?: string,
): JourneyState {
  const stages = generateJourneyStages(targetLevel, startLevel, true, gameMode);
  return {
    currentStage: 1,
    stages: stages.map((s) => ({
      stageId: s.stageId,
      status: s.stageId === 1 ? ('unlocked' as const) : ('locked' as const),
      validatingSessions: 0,
      bestScore: null,
      progressPct: 0,
    })),
    isActive: true,
    startLevel,
    targetLevel,
    isSimulator: true,
    // Only BrainWorkshop uses the strikes system (hearts UI)
    consecutiveStrikes: gameMode === 'sim-brainworkshop' ? 0 : undefined,
    // NeuroDual Mix always starts with Stroop Flex
    nextSessionGameMode: gameMode === 'neurodual-mix' ? 'stroop-flex' : undefined,
  };
}

/** @deprecated Use buildFreshJourneyState('neurodual-mix') instead */
export const buildNeuroDualMixJourneyState = (startLevel: number, targetLevel: number) =>
  buildFreshJourneyState(startLevel, targetLevel, 'neurodual-mix');
