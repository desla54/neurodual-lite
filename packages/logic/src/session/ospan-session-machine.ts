/**
 * Operation Span (OSPAN) Session Machine - Pure State Machine
 *
 * Manages the OSPAN task session state.
 * No side effects, no randomness - items/equations provided externally.
 *
 * Flow per set:
 * 1. For each item in the set:
 *    a. SHOW_EQUATION(equation, correctAnswer) → processing
 *    b. ANSWER_EQUATION(answer) → showing_item
 *    c. SHOW_ITEM(letter) → item displayed, then next pair or recall
 * 2. BEGIN_RECALL → recalling
 * 3. SUBMIT_RECALL(letters[]) → feedback → NEXT_SET or finished
 */

import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  OspanSessionStartedEvent,
  OspanSetCompletedEvent,
  OspanSessionEndedEvent,
} from '../engine/events';
import type { OspanCompletionInput } from '../engine/session-completion-projector';
import { OspanSpec } from '../specs/ospan.spec';

// =============================================================================
// Types
// =============================================================================

export type OspanTrialPhase =
  | 'idle'
  | 'showing_equation'
  | 'showing_item'
  | 'recalling'
  | 'feedback';
export type OspanSessionPhase = 'playing' | 'finished';
export type OspanEndReason = 'completed' | 'span-limit' | 'abandoned';

export interface OspanEquationResult {
  readonly equation: string;
  readonly correctAnswer: boolean;
  readonly playerAnswer: boolean;
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

export interface OspanSetResult {
  readonly span: number;
  readonly letters: readonly string[];
  readonly recalled: readonly string[];
  readonly recallCorrect: boolean;
  readonly equationResults: readonly OspanEquationResult[];
  readonly equationAccuracy: number;
  readonly responseTimeMs: number;
}

export interface OspanSessionSummary {
  readonly results: readonly OspanSetResult[];
  readonly maxSpanReached: number;
  readonly correctSets: number;
  readonly totalSets: number;
  readonly accuracy: number;
  readonly processingAccuracy: number;
  /** OSPAN absolute score: sum of set sizes for perfectly recalled sets */
  readonly absoluteScore: number;
  /** Session is interpretable as a measure only above the processing threshold. */
  readonly isValidMeasure: boolean;
}

export interface OspanSessionMachineConfig {
  /** Pre-generated sequence of set sizes (e.g. [3,5,7,4,6,3,5,7,4,6,3,5,7,4,6] for standard 15-set protocol) */
  readonly setSequence: readonly number[];
  readonly playContext: SessionPlayContext;
}

/**
 * Generate the standard Unsworth 2005 AOSPAN set sequence:
 * 3 sets of each size (3, 4, 5, 6, 7) = 15 sets, shuffled randomly.
 */
export function generateStandardOspanSequence(): number[] {
  const sizes = [3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7];
  // Fisher-Yates shuffle
  for (let i = sizes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sizes[i], sizes[j]] = [sizes[j] as number, sizes[i] as number];
  }
  return sizes;
}

export interface OspanSessionMachineState {
  readonly sessionPhase: OspanSessionPhase;
  readonly trialPhase: OspanTrialPhase;
  readonly currentSpan: number;
  readonly setIndex: number;
  readonly itemIndex: number;
  readonly currentLetters: readonly string[];
  readonly currentEquationResults: readonly OspanEquationResult[];
  readonly playerRecall: readonly string[];
  readonly maxSpanReached: number;
  readonly results: readonly OspanSetResult[];
  readonly sessionStarted: boolean;
  readonly startedAtMs: number | null;
  readonly endReason: OspanEndReason | null;
  readonly recallStartMs: number | null;
  readonly equationStartMs: number | null;
  readonly userId: string | null;
}

// =============================================================================
// Actions
// =============================================================================

export interface BeginOspanSetAction {
  readonly type: 'BEGIN_SET';
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface ShowOspanEquationAction {
  readonly type: 'SHOW_EQUATION';
  readonly equation: string;
  readonly correctAnswer: boolean;
  readonly timestamp: number;
}

export interface AnswerOspanEquationAction {
  readonly type: 'ANSWER_EQUATION';
  readonly equation: string;
  readonly correctAnswer: boolean;
  readonly answer: boolean;
  readonly timestamp: number;
}

export interface ShowOspanItemAction {
  readonly type: 'SHOW_ITEM';
  readonly letter: string;
  readonly timestamp: number;
}

export interface BeginOspanRecallAction {
  readonly type: 'BEGIN_RECALL';
  readonly timestamp: number;
}

export interface SubmitOspanRecallAction {
  readonly type: 'SUBMIT_RECALL';
  readonly recalled: readonly string[];
  readonly timestamp: number;
}

export interface NextOspanSetAction {
  readonly type: 'NEXT_SET';
  readonly timestamp: number;
}

export interface AbandonOspanSessionAction {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartOspanSessionAction {
  readonly type: 'RESTART';
}

export type OspanSessionMachineAction =
  | BeginOspanSetAction
  | ShowOspanEquationAction
  | AnswerOspanEquationAction
  | ShowOspanItemAction
  | BeginOspanRecallAction
  | SubmitOspanRecallAction
  | NextOspanSetAction
  | AbandonOspanSessionAction
  | RestartOspanSessionAction;

// =============================================================================
// Event Drafts
// =============================================================================

type OspanStartEventDraft = Omit<
  OspanSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type OspanSetEventDraft = Omit<
  OspanSetCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type OspanEndEventDraft = Omit<
  OspanSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type OspanSessionEventDraft = OspanStartEventDraft | OspanSetEventDraft | OspanEndEventDraft;

export type OspanCompletionDraft = Omit<
  OspanCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface OspanSessionMachineTransition {
  readonly state: OspanSessionMachineState;
  readonly eventDrafts: readonly OspanSessionEventDraft[];
  readonly completionDraft?: OspanCompletionDraft;
}

// =============================================================================
// Helpers
// =============================================================================

export function createInitialOspanSessionState(): OspanSessionMachineState {
  return {
    sessionPhase: 'playing',
    trialPhase: 'idle',
    currentSpan: 0,
    setIndex: 0,
    itemIndex: 0,
    currentLetters: [],
    currentEquationResults: [],
    playerRecall: [],
    maxSpanReached: 0,
    results: [],
    sessionStarted: false,
    startedAtMs: null,
    endReason: null,
    recallStartMs: null,
    equationStartMs: null,
    userId: null,
  };
}

/**
 * Generate an AOSPAN-style equation verification problem.
 *
 * Follows Unsworth et al. 2005 pattern: two-step operations like (2 × 3) + 1 = 7?
 * Uses +, −, × operators. Results are always positive integers.
 * Distractor magnitude varies (±1, ±2, ±3) to prevent pattern learning.
 */
export function generateOspanEquation(): {
  equation: string;
  display: string;
  correctAnswer: boolean;
} {
  // Step 1: multiplication or simple operand
  const useMultiStep = Math.random() < 0.7; // 70% two-step, 30% single-step

  let expression: string;
  let correctResult: number;

  if (useMultiStep) {
    // Two-step: (a × b) ± c  or  (a ± b) × c
    const pattern = Math.random();
    if (pattern < 0.5) {
      // (a × b) ± c
      const a = Math.floor(Math.random() * 5) + 1; // 1-5
      const b = Math.floor(Math.random() * 5) + 2; // 2-6
      const c = Math.floor(Math.random() * 5) + 1; // 1-5
      const op2 = Math.random() < 0.5 ? '+' : '\u2212';
      const product = a * b;
      correctResult = op2 === '+' ? product + c : product - c;
      expression = `(${a} \u00d7 ${b}) ${op2} ${c}`;
    } else {
      // (a ± b) × c  (keep c small to avoid huge results)
      const a = Math.floor(Math.random() * 8) + 2; // 2-9
      const b = Math.floor(Math.random() * 4) + 1; // 1-4
      const op1 = Math.random() < 0.5 ? '+' : '\u2212';
      const c = Math.floor(Math.random() * 3) + 2; // 2-4
      const inner = op1 === '+' ? a + b : a - b;
      correctResult = inner * c;
      expression = `(${a} ${op1} ${b}) \u00d7 ${c}`;
    }
  } else {
    // Single-step: a op b (with wider range)
    const ops = ['+', '\u2212', '\u00d7'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)] as '+' | '\u2212' | '\u00d7';
    if (op === '\u00d7') {
      const a = Math.floor(Math.random() * 7) + 2; // 2-8
      const b = Math.floor(Math.random() * 5) + 2; // 2-6
      correctResult = a * b;
      expression = `${a} \u00d7 ${b}`;
    } else {
      const a = Math.floor(Math.random() * 15) + 3; // 3-17
      const b = Math.floor(Math.random() * 10) + 1; // 1-10
      correctResult = op === '+' ? a + b : a - b;
      expression = `${a} ${op} ${b}`;
    }
  }

  // Ensure positive result (re-roll if negative)
  if (correctResult < 0) {
    return generateOspanEquation();
  }

  // 50% chance of showing wrong answer
  const showWrong = Math.random() < 0.5;
  let displayedResult = correctResult;
  if (showWrong) {
    // Varied distractor magnitude: ±1, ±2, or ±3
    const offsets = [1, 1, 2, 2, 3]; // weighted toward ±1 and ±2
    const offset = offsets[Math.floor(Math.random() * offsets.length)] as number;
    displayedResult = correctResult + (Math.random() < 0.5 ? offset : -offset);
    // Ensure distractor is non-negative and different from correct
    if (displayedResult < 0 || displayedResult === correctResult) {
      displayedResult = correctResult + offset;
    }
  }

  return {
    equation: expression,
    display: `${expression} = ${displayedResult}`,
    correctAnswer: !showWrong,
  };
}

export function selectOspanLetters(span: number, pool: readonly string[]): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
  }
  return shuffled.slice(0, span);
}

export function buildOspanSessionSummary(results: readonly OspanSetResult[]): OspanSessionSummary {
  const correctSets = results.filter((r) => r.recallCorrect).length;
  const totalSets = results.length;
  const maxSpanReached = results.reduce(
    (max, r) => (r.recallCorrect && r.span > max ? r.span : max),
    0,
  );
  const accuracy = totalSets > 0 ? Math.round((correctSets / totalSets) * 100) : 0;

  // OSPAN absolute score (Unsworth et al. 2005): sum of set sizes for perfectly recalled sets
  const absoluteScore = results.filter((r) => r.recallCorrect).reduce((sum, r) => sum + r.span, 0);

  const totalEquations = results.reduce((sum, r) => sum + r.equationResults.length, 0);
  const correctEquations = results.reduce(
    (sum, r) => sum + r.equationResults.filter((eq) => eq.correct).length,
    0,
  );
  const processingAccuracy =
    totalEquations > 0 ? Math.round((correctEquations / totalEquations) * 100) : 0;
  const processingAccuracyThreshold =
    (OspanSpec.extensions as { processingAccuracyThreshold?: number })
      .processingAccuracyThreshold ?? 85;
  const isValidMeasure = totalEquations > 0 && processingAccuracy >= processingAccuracyThreshold;

  return {
    results,
    maxSpanReached,
    correctSets,
    totalSets,
    accuracy,
    processingAccuracy,
    absoluteScore,
    isValidMeasure,
  };
}

// =============================================================================
// Session Finalization
// =============================================================================

function finalizeOspanSession(
  state: OspanSessionMachineState,
  config: OspanSessionMachineConfig,
  reason: OspanEndReason,
  timestamp: number,
): OspanSessionMachineTransition {
  const finishedState: OspanSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    endReason: reason,
  };

  if (!state.sessionStarted) {
    return { state: finishedState, eventDrafts: [] };
  }

  const summary = buildOspanSessionSummary(state.results);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'OSPAN_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason: reason === 'abandoned' ? 'abandoned' : 'completed',
        totalSets: summary.totalSets,
        correctSets: summary.correctSets,
        maxSpan: summary.maxSpanReached,
        absoluteScore: summary.absoluteScore,
        recallAccuracy: summary.accuracy,
        processingAccuracy: summary.processingAccuracy,
        score: summary.accuracy,
        durationMs,
        playContext: config.playContext,
      },
    ],
    completionDraft: {
      reason: reason === 'abandoned' ? 'abandoned' : 'completed',
      accuracy: summary.accuracy,
      processingAccuracy: summary.processingAccuracy,
      isValidMeasure: summary.isValidMeasure,
      maxSpan: summary.maxSpanReached,
      absoluteScore: summary.absoluteScore,
      correctSets: summary.correctSets,
      totalSets: summary.totalSets,
      durationMs,
    },
  };
}

// =============================================================================
// State Machine Transition
// =============================================================================

export function transitionOspanSessionMachine(
  state: OspanSessionMachineState,
  action: OspanSessionMachineAction,
  config: OspanSessionMachineConfig,
): OspanSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_SET': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.trialPhase !== 'idle') return { state, eventDrafts: [] };

      const spanForThisSet = config.setSequence[state.setIndex] ?? 3;
      const eventDrafts: OspanSessionEventDraft[] = [];

      if (!state.sessionStarted) {
        eventDrafts.push({
          type: 'OSPAN_SESSION_STARTED',
          userId: action.userId,
          config: {
            startSpan: config.setSequence[0] ?? 3,
            maxConsecutiveFailures: 0,
          },
          device: action.device,
          context: action.context,
          playContext: config.playContext,
          gameMode: 'ospan',
        });
      }

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: state.startedAtMs ?? action.timestamp,
          trialPhase: 'showing_equation',
          currentSpan: spanForThisSet,
          itemIndex: 0,
          currentLetters: [],
          currentEquationResults: [],
          playerRecall: [],
          recallStartMs: null,
          equationStartMs: null,
          userId: state.userId ?? action.userId,
        },
        eventDrafts,
      };
    }

    case 'SHOW_EQUATION': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'showing_equation') {
        return { state, eventDrafts: [] };
      }
      return {
        state: {
          ...state,
          equationStartMs: action.timestamp,
        },
        eventDrafts: [],
      };
    }

    case 'ANSWER_EQUATION': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'showing_equation') {
        return { state, eventDrafts: [] };
      }
      const correct = action.answer === action.correctAnswer;
      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.equationStartMs ?? action.timestamp),
      );
      const eqResult: OspanEquationResult = {
        equation: action.equation,
        correctAnswer: action.correctAnswer,
        playerAnswer: action.answer,
        correct,
        responseTimeMs,
      };
      return {
        state: {
          ...state,
          trialPhase: 'showing_item',
          currentEquationResults: [...state.currentEquationResults, eqResult],
        },
        eventDrafts: [],
      };
    }

    case 'SHOW_ITEM': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'showing_item') {
        return { state, eventDrafts: [] };
      }

      const newLetters = [...state.currentLetters, action.letter];
      const nextItemIndex = state.itemIndex + 1;

      // If we've shown all items for this span, stay in showing_item
      // and let the UI trigger BEGIN_RECALL
      if (nextItemIndex >= state.currentSpan) {
        return {
          state: {
            ...state,
            currentLetters: newLetters,
            itemIndex: nextItemIndex,
          },
          eventDrafts: [],
        };
      }

      // More items to show - go back to equation
      return {
        state: {
          ...state,
          currentLetters: newLetters,
          itemIndex: nextItemIndex,
          trialPhase: 'showing_equation',
          equationStartMs: null,
        },
        eventDrafts: [],
      };
    }

    case 'BEGIN_RECALL': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.trialPhase !== 'showing_item') return { state, eventDrafts: [] };

      return {
        state: {
          ...state,
          trialPhase: 'recalling',
          recallStartMs: action.timestamp,
        },
        eventDrafts: [],
      };
    }

    case 'SUBMIT_RECALL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'recalling') {
        return { state, eventDrafts: [] };
      }

      const recallCorrect =
        action.recalled.length === state.currentLetters.length &&
        action.recalled.every((l, i) => l === state.currentLetters[i]);

      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.recallStartMs ?? action.timestamp),
      );

      const equationAccuracy =
        state.currentEquationResults.length > 0
          ? Math.round(
              (state.currentEquationResults.filter((eq) => eq.correct).length /
                state.currentEquationResults.length) *
                100,
            )
          : 100;

      const setResult: OspanSetResult = {
        span: state.currentSpan,
        letters: state.currentLetters,
        recalled: action.recalled,
        recallCorrect,
        equationResults: state.currentEquationResults,
        equationAccuracy,
        responseTimeMs,
      };

      const results = [...state.results, setResult];
      const newMaxSpan =
        recallCorrect && state.currentSpan > state.maxSpanReached
          ? state.currentSpan
          : state.maxSpanReached;

      return {
        state: {
          ...state,
          playerRecall: [...action.recalled],
          results,
          maxSpanReached: newMaxSpan,
          trialPhase: 'feedback',
        },
        eventDrafts: [
          {
            type: 'OSPAN_SET_COMPLETED',
            setIndex: state.setIndex,
            span: state.currentSpan,
            letters: [...state.currentLetters],
            recalled: [...action.recalled],
            recallCorrect,
            equationAccuracy,
            responseTimeMs,
          },
        ],
      };
    }

    case 'NEXT_SET': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'feedback') {
        return { state, eventDrafts: [] };
      }

      const nextSetIndex = state.setIndex + 1;

      // Standard protocol: end after all sets in the sequence
      if (nextSetIndex >= config.setSequence.length) {
        return finalizeOspanSession(state, config, 'completed', action.timestamp);
      }

      return {
        state: {
          ...state,
          setIndex: nextSetIndex,
          trialPhase: 'idle',
          currentSpan: config.setSequence[nextSetIndex] ?? 3,
          itemIndex: 0,
          currentLetters: [],
          currentEquationResults: [],
          playerRecall: [],
          recallStartMs: null,
          equationStartMs: null,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizeOspanSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialOspanSessionState(),
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
