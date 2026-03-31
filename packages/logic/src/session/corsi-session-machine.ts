/**
 * Corsi Block Session Machine - Pure State Machine
 *
 * Manages the Corsi Block Tapping Task session state.
 * No side effects, no randomness - sequences are provided externally.
 *
 * Flow:
 * 1. BEGIN_TRIAL(sequence) → presenting
 * 2. BEGIN_RECALL → recalling (UI signals presentation done)
 * 3. TAP_BLOCK(position) × span → auto-evaluates when full
 * 4. NEXT_TRIAL → next trial or finished
 */

import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  CorsiSessionStartedEvent,
  CorsiTrialCompletedEvent,
  CorsiSessionEndedEvent,
} from '../engine/events';
import type { CorsiCompletionInput } from '../engine/session-completion-projector';

// =============================================================================
// Types
// =============================================================================

export type CorsiDirection = 'forward' | 'backward';
export type CorsiTrialPhase = 'idle' | 'presenting' | 'recalling' | 'feedback';
export type CorsiSessionPhase = 'playing' | 'finished';
export type CorsiEndReason = 'completed' | 'span-limit' | 'abandoned';

export interface CorsiTrialResult {
  readonly span: number;
  readonly sequence: readonly number[];
  readonly recalled: readonly number[];
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

export interface CorsiSessionSummary {
  readonly results: readonly CorsiTrialResult[];
  readonly maxSpanReached: number;
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly accuracy: number;
}

export interface CorsiSessionMachineConfig {
  readonly startSpan: number;
  readonly maxSpan: number;
  readonly maxConsecutiveFailures: number;
  readonly direction: CorsiDirection;
  readonly maxTrials: number;
  readonly playContext: SessionPlayContext;
}

export interface CorsiSessionMachineState {
  readonly sessionPhase: CorsiSessionPhase;
  readonly trialPhase: CorsiTrialPhase;
  readonly currentSpan: number;
  readonly trialIndex: number;
  readonly currentSequence: readonly number[];
  readonly playerInput: readonly number[];
  readonly consecutiveFailures: number;
  readonly maxSpanReached: number;
  readonly results: readonly CorsiTrialResult[];
  readonly sessionStarted: boolean;
  readonly startedAtMs: number | null;
  readonly endReason: CorsiEndReason | null;
  readonly recallStartMs: number | null;
  readonly userId: string | null;
}

// =============================================================================
// Actions
// =============================================================================

export interface BeginCorsiTrialAction {
  readonly type: 'BEGIN_TRIAL';
  readonly sequence: readonly number[];
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface BeginCorsiRecallAction {
  readonly type: 'BEGIN_RECALL';
  readonly timestamp: number;
}

export interface TapCorsiBlockAction {
  readonly type: 'TAP_BLOCK';
  readonly position: number;
  readonly timestamp: number;
}

export interface NextCorsiTrialAction {
  readonly type: 'NEXT_TRIAL';
  readonly sequence: readonly number[];
  readonly timestamp: number;
}

export interface AbandonCorsiSessionAction {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartCorsiSessionAction {
  readonly type: 'RESTART';
}

export interface ReplayCurrentCorsiTrialAction {
  readonly type: 'REPLAY_CURRENT_TRIAL';
}

export type CorsiSessionMachineAction =
  | BeginCorsiTrialAction
  | BeginCorsiRecallAction
  | TapCorsiBlockAction
  | NextCorsiTrialAction
  | AbandonCorsiSessionAction
  | RestartCorsiSessionAction
  | ReplayCurrentCorsiTrialAction;

// =============================================================================
// Event Drafts
// =============================================================================

type CorsiStartEventDraft = Omit<
  CorsiSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type CorsiTrialEventDraft = Omit<
  CorsiTrialCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type CorsiEndEventDraft = Omit<
  CorsiSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type CorsiSessionEventDraft =
  | CorsiStartEventDraft
  | CorsiTrialEventDraft
  | CorsiEndEventDraft;

export type CorsiCompletionDraft = Omit<
  CorsiCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface CorsiSessionMachineTransition {
  readonly state: CorsiSessionMachineState;
  readonly eventDrafts: readonly CorsiSessionEventDraft[];
  readonly completionDraft?: CorsiCompletionDraft;
}

// =============================================================================
// Helpers
// =============================================================================

export function createInitialCorsiSessionState(): CorsiSessionMachineState {
  return {
    sessionPhase: 'playing',
    trialPhase: 'idle',
    currentSpan: 0,
    trialIndex: 0,
    currentSequence: [],
    playerInput: [],
    consecutiveFailures: 0,
    maxSpanReached: 0,
    results: [],
    sessionStarted: false,
    startedAtMs: null,
    endReason: null,
    recallStartMs: null,
    userId: null,
  };
}

export function generateCorsiSequence(span: number, gridSize = 9): number[] {
  const positions = Array.from({ length: gridSize }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j] as number, positions[i] as number];
  }
  return positions.slice(0, span);
}

export function buildCorsiSessionSummary(
  results: readonly CorsiTrialResult[],
): CorsiSessionSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const totalTrials = results.length;
  const maxSpanReached = results.reduce((max, r) => (r.correct && r.span > max ? r.span : max), 0);
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  return { results, maxSpanReached, correctTrials, totalTrials, accuracy };
}

function evaluateTrial(
  sequence: readonly number[],
  recalled: readonly number[],
  direction: CorsiDirection,
): boolean {
  const expected = direction === 'backward' ? [...sequence].reverse() : sequence;
  if (recalled.length !== expected.length) return false;
  return recalled.every((pos, i) => pos === expected[i]);
}

// =============================================================================
// Session Finalization
// =============================================================================

function finalizeCorsiSession(
  state: CorsiSessionMachineState,
  config: CorsiSessionMachineConfig,
  reason: CorsiEndReason,
  timestamp: number,
): CorsiSessionMachineTransition {
  const finishedState: CorsiSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    endReason: reason,
  };

  if (!state.sessionStarted) {
    return { state: finishedState, eventDrafts: [] };
  }

  const summary = buildCorsiSessionSummary(state.results);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'CORSI_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason: reason === 'abandoned' ? 'abandoned' : 'completed',
        totalTrials: summary.totalTrials,
        correctTrials: summary.correctTrials,
        maxSpan: summary.maxSpanReached,
        score: summary.accuracy,
        durationMs,
        playContext: config.playContext,
      },
    ],
    completionDraft: {
      reason: reason === 'abandoned' ? 'abandoned' : 'completed',
      accuracy: summary.accuracy,
      maxSpan: summary.maxSpanReached,
      correctTrials: summary.correctTrials,
      totalTrials: summary.totalTrials,
      durationMs,
    },
  };
}

// =============================================================================
// State Machine Transition
// =============================================================================

export function transitionCorsiSessionMachine(
  state: CorsiSessionMachineState,
  action: CorsiSessionMachineAction,
  config: CorsiSessionMachineConfig,
): CorsiSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_TRIAL': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.trialPhase !== 'idle') return { state, eventDrafts: [] };

      const effectiveSpan = state.sessionStarted ? state.currentSpan : config.startSpan;
      const eventDrafts: CorsiSessionEventDraft[] = [];

      if (!state.sessionStarted) {
        eventDrafts.push({
          type: 'CORSI_SESSION_STARTED',
          userId: action.userId,
          config: {
            startSpan: config.startSpan,
            maxConsecutiveFailures: config.maxConsecutiveFailures,
            direction: config.direction,
          },
          device: action.device,
          context: action.context,
          playContext: config.playContext,
          gameMode: 'corsi-block',
        });
      }

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: state.startedAtMs ?? action.timestamp,
          trialPhase: 'presenting',
          currentSpan: effectiveSpan,
          currentSequence: action.sequence,
          playerInput: [],
          recallStartMs: null,
          userId: state.userId ?? action.userId,
        },
        eventDrafts,
      };
    }

    case 'BEGIN_RECALL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'presenting') {
        return { state, eventDrafts: [] };
      }
      return {
        state: {
          ...state,
          trialPhase: 'recalling',
          recallStartMs: action.timestamp,
        },
        eventDrafts: [],
      };
    }

    case 'TAP_BLOCK': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'recalling') {
        return { state, eventDrafts: [] };
      }

      const newInput = [...state.playerInput, action.position];

      // Not enough taps yet
      if (newInput.length < state.currentSequence.length) {
        return {
          state: { ...state, playerInput: newInput },
          eventDrafts: [],
        };
      }

      // Evaluate trial
      const correct = evaluateTrial(state.currentSequence, newInput, config.direction);
      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.recallStartMs ?? action.timestamp),
      );
      const trialResult: CorsiTrialResult = {
        span: state.currentSpan,
        sequence: state.currentSequence,
        recalled: newInput,
        correct,
        responseTimeMs,
      };
      const results = [...state.results, trialResult];
      const newMaxSpan =
        correct && state.currentSpan > state.maxSpanReached
          ? state.currentSpan
          : state.maxSpanReached;

      return {
        state: {
          ...state,
          playerInput: newInput,
          results,
          maxSpanReached: newMaxSpan,
          trialPhase: 'feedback',
        },
        eventDrafts: [
          {
            type: 'CORSI_TRIAL_COMPLETED',
            trialIndex: state.trialIndex,
            span: state.currentSpan,
            sequence: [...state.currentSequence],
            recalled: newInput,
            correct,
            responseTimeMs,
          },
        ],
      };
    }

    case 'NEXT_TRIAL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'feedback') {
        return { state, eventDrafts: [] };
      }

      const lastResult = state.results[state.results.length - 1];
      if (!lastResult) return { state, eventDrafts: [] };

      const wasCorrect = lastResult.correct;
      const newConsecutiveFailures = wasCorrect ? 0 : state.consecutiveFailures + 1;
      const nextTrialIndex = state.trialIndex + 1;

      // End conditions
      if (newConsecutiveFailures >= config.maxConsecutiveFailures) {
        return finalizeCorsiSession(
          { ...state, consecutiveFailures: newConsecutiveFailures },
          config,
          'completed',
          action.timestamp,
        );
      }

      const nextSpan = wasCorrect ? state.currentSpan + 1 : state.currentSpan;

      if (nextSpan > config.maxSpan) {
        return finalizeCorsiSession(state, config, 'span-limit', action.timestamp);
      }

      if (nextTrialIndex >= config.maxTrials) {
        return finalizeCorsiSession(state, config, 'completed', action.timestamp);
      }

      return {
        state: {
          ...state,
          trialIndex: nextTrialIndex,
          trialPhase: 'presenting',
          currentSpan: nextSpan,
          currentSequence: action.sequence,
          playerInput: [],
          consecutiveFailures: newConsecutiveFailures,
          recallStartMs: null,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizeCorsiSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialCorsiSessionState(),
        eventDrafts: [],
      };

    case 'REPLAY_CURRENT_TRIAL':
      if (
        state.sessionPhase === 'finished' ||
        state.trialPhase === 'idle' ||
        state.currentSequence.length === 0
      ) {
        return { state, eventDrafts: [] };
      }

      return {
        state: {
          ...state,
          trialPhase: 'presenting',
          playerInput: [],
          recallStartMs: null,
        },
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
