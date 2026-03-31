/**
 * PASAT Session Machine - Pure State Machine
 *
 * Paced Auditory Serial Addition Test.
 * No side effects, no randomness - numbers provided externally.
 *
 * Flow:
 * 1. SHOW_NUMBER(n) → first number displayed (no response needed)
 * 2. SHOW_NUMBER(n) → player must respond with sum of current + previous
 * 3. RESPOND(answer) → feedback
 * 4. Loop until all trials done or consecutive failures
 */

import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  PasatSessionStartedEvent,
  PasatTrialCompletedEvent,
  PasatSessionEndedEvent,
} from '../engine/events';
import type { PasatCompletionInput } from '../engine/session-completion-projector';

// =============================================================================
// Types
// =============================================================================

export type PasatTrialPhase = 'idle' | 'showing_first' | 'awaiting_response' | 'feedback';
export type PasatSessionPhase = 'playing' | 'finished';
export type PasatEndReason = 'completed' | 'abandoned';

export interface PasatTrialResult {
  readonly previousNumber: number;
  readonly currentNumber: number;
  readonly correctAnswer: number;
  readonly playerAnswer: number | null;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly isiMs: number;
}

export interface PasatSessionSummary {
  readonly results: readonly PasatTrialResult[];
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly accuracy: number;
  readonly fastestIsiMs: number;
  readonly avgResponseTimeMs: number;
}

export interface PasatSessionMachineConfig {
  readonly defaultIsiMs: number;
  readonly minIsiMs: number;
  readonly isiStepMs: number;
  readonly maxConsecutiveFailures: number;
  readonly maxTrials: number;
  readonly playContext: SessionPlayContext;
}

export interface PasatSessionMachineState {
  readonly sessionPhase: PasatSessionPhase;
  readonly trialPhase: PasatTrialPhase;
  readonly trialIndex: number;
  readonly previousNumber: number | null;
  readonly currentNumber: number | null;
  readonly currentIsiMs: number;
  readonly consecutiveCorrect: number;
  readonly consecutiveFailures: number;
  readonly results: readonly PasatTrialResult[];
  readonly sessionStarted: boolean;
  readonly startedAtMs: number | null;
  readonly endReason: PasatEndReason | null;
  readonly stimulusShownAtMs: number | null;
  readonly userId: string | null;
}

// =============================================================================
// Actions
// =============================================================================

export interface BeginPasatSessionAction {
  readonly type: 'BEGIN_SESSION';
  readonly firstNumber: number;
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface ShowPasatNumberAction {
  readonly type: 'SHOW_NUMBER';
  readonly number: number;
  readonly timestamp: number;
}

export interface RespondPasatAction {
  readonly type: 'RESPOND';
  readonly answer: number;
  readonly timestamp: number;
}

export interface TimeoutPasatAction {
  readonly type: 'TIMEOUT';
  readonly timestamp: number;
}

export interface NextPasatTrialAction {
  readonly type: 'NEXT_TRIAL';
  readonly number: number;
  readonly timestamp: number;
}

export interface AbandonPasatSessionAction {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartPasatSessionAction {
  readonly type: 'RESTART';
}

export type PasatSessionMachineAction =
  | BeginPasatSessionAction
  | ShowPasatNumberAction
  | RespondPasatAction
  | TimeoutPasatAction
  | NextPasatTrialAction
  | AbandonPasatSessionAction
  | RestartPasatSessionAction;

// =============================================================================
// Event Drafts
// =============================================================================

type PasatStartEventDraft = Omit<
  PasatSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type PasatTrialEventDraft = Omit<
  PasatTrialCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type PasatEndEventDraft = Omit<
  PasatSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type PasatSessionEventDraft =
  | PasatStartEventDraft
  | PasatTrialEventDraft
  | PasatEndEventDraft;

export type PasatCompletionDraft = Omit<
  PasatCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface PasatSessionMachineTransition {
  readonly state: PasatSessionMachineState;
  readonly eventDrafts: readonly PasatSessionEventDraft[];
  readonly completionDraft?: PasatCompletionDraft;
}

// =============================================================================
// Helpers
// =============================================================================

export function createInitialPasatSessionState(): PasatSessionMachineState {
  return {
    sessionPhase: 'playing',
    trialPhase: 'idle',
    trialIndex: 0,
    previousNumber: null,
    currentNumber: null,
    currentIsiMs: 0,
    consecutiveCorrect: 0,
    consecutiveFailures: 0,
    results: [],
    sessionStarted: false,
    startedAtMs: null,
    endReason: null,
    stimulusShownAtMs: null,
    userId: null,
  };
}

export function generatePasatNumber(): number {
  return Math.floor(Math.random() * 9) + 1;
}

export function buildPasatSessionSummary(
  results: readonly PasatTrialResult[],
): PasatSessionSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const totalTrials = results.length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  const fastestIsiMs = results.length > 0 ? Math.min(...results.map((r) => r.isiMs)) : 0;
  const responseTimes = results.filter((r) => r.playerAnswer !== null).map((r) => r.responseTimeMs);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  return { results, correctTrials, totalTrials, accuracy, fastestIsiMs, avgResponseTimeMs };
}

// =============================================================================
// ISI Adjustment — every 3 consecutive correct, speed up
// =============================================================================

const ISI_SPEEDUP_STREAK = 3;

// =============================================================================
// Session Finalization
// =============================================================================

function finalizePasatSession(
  state: PasatSessionMachineState,
  config: PasatSessionMachineConfig,
  reason: PasatEndReason,
  timestamp: number,
): PasatSessionMachineTransition {
  const finishedState: PasatSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    endReason: reason,
  };

  if (!state.sessionStarted) {
    return { state: finishedState, eventDrafts: [] };
  }

  const summary = buildPasatSessionSummary(state.results);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'PASAT_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason,
        totalTrials: summary.totalTrials,
        correctTrials: summary.correctTrials,
        accuracy: summary.accuracy,
        fastestIsiMs: summary.fastestIsiMs,
        avgResponseTimeMs: summary.avgResponseTimeMs,
        score: summary.accuracy,
        durationMs,
        playContext: config.playContext,
      },
    ],
    completionDraft: {
      reason,
      accuracy: summary.accuracy,
      correctTrials: summary.correctTrials,
      totalTrials: summary.totalTrials,
      fastestIsiMs: summary.fastestIsiMs,
      avgResponseTimeMs: summary.avgResponseTimeMs,
      durationMs,
    },
  };
}

// =============================================================================
// State Machine Transition
// =============================================================================

export function transitionPasatSessionMachine(
  state: PasatSessionMachineState,
  action: PasatSessionMachineAction,
  config: PasatSessionMachineConfig,
): PasatSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_SESSION': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.trialPhase !== 'idle') return { state, eventDrafts: [] };

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: action.timestamp,
          trialPhase: 'showing_first',
          currentNumber: action.firstNumber,
          previousNumber: null,
          currentIsiMs: config.defaultIsiMs,
          userId: state.userId ?? action.userId,
        },
        eventDrafts: [
          {
            type: 'PASAT_SESSION_STARTED',
            userId: action.userId,
            config: {
              defaultIsiMs: config.defaultIsiMs,
              maxConsecutiveFailures: config.maxConsecutiveFailures,
            },
            device: action.device,
            context: action.context,
            playContext: config.playContext,
            gameMode: 'pasat',
          },
        ],
      };
    }

    case 'SHOW_NUMBER': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      // After showing first number, transition to awaiting response
      if (state.trialPhase === 'showing_first') {
        return {
          state: {
            ...state,
            trialPhase: 'awaiting_response',
            previousNumber: state.currentNumber,
            currentNumber: action.number,
            stimulusShownAtMs: action.timestamp,
          },
          eventDrafts: [],
        };
      }
      return { state, eventDrafts: [] };
    }

    case 'RESPOND': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'awaiting_response') {
        return { state, eventDrafts: [] };
      }
      if (state.previousNumber === null || state.currentNumber === null) {
        return { state, eventDrafts: [] };
      }

      const correctAnswer = state.previousNumber + state.currentNumber;
      const correct = action.answer === correctAnswer;
      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.stimulusShownAtMs ?? action.timestamp),
      );

      const result: PasatTrialResult = {
        previousNumber: state.previousNumber,
        currentNumber: state.currentNumber,
        correctAnswer,
        playerAnswer: action.answer,
        correct,
        responseTimeMs,
        isiMs: state.currentIsiMs,
      };

      const results = [...state.results, result];
      const newConsecutiveCorrect = correct ? state.consecutiveCorrect + 1 : 0;
      const newConsecutiveFailures = correct ? 0 : state.consecutiveFailures + 1;

      // Adjust ISI: speed up every ISI_SPEEDUP_STREAK consecutive correct
      let nextIsi = state.currentIsiMs;
      if (correct && newConsecutiveCorrect % ISI_SPEEDUP_STREAK === 0) {
        nextIsi = Math.max(config.minIsiMs, nextIsi - config.isiStepMs);
      }

      return {
        state: {
          ...state,
          results,
          trialPhase: 'feedback',
          consecutiveCorrect: newConsecutiveCorrect,
          consecutiveFailures: newConsecutiveFailures,
          currentIsiMs: nextIsi,
        },
        eventDrafts: [
          {
            type: 'PASAT_TRIAL_COMPLETED',
            trialIndex: state.trialIndex,
            previousNumber: state.previousNumber,
            currentNumber: state.currentNumber,
            correctAnswer,
            playerAnswer: action.answer,
            correct,
            responseTimeMs,
            isiMs: state.currentIsiMs,
          },
        ],
      };
    }

    case 'TIMEOUT': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'awaiting_response') {
        return { state, eventDrafts: [] };
      }
      if (state.previousNumber === null || state.currentNumber === null) {
        return { state, eventDrafts: [] };
      }

      const correctAnswer = state.previousNumber + state.currentNumber;
      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.stimulusShownAtMs ?? action.timestamp),
      );

      const result: PasatTrialResult = {
        previousNumber: state.previousNumber,
        currentNumber: state.currentNumber,
        correctAnswer,
        playerAnswer: null,
        correct: false,
        responseTimeMs,
        isiMs: state.currentIsiMs,
      };

      return {
        state: {
          ...state,
          results: [...state.results, result],
          trialPhase: 'feedback',
          consecutiveCorrect: 0,
          consecutiveFailures: state.consecutiveFailures + 1,
        },
        eventDrafts: [
          {
            type: 'PASAT_TRIAL_COMPLETED',
            trialIndex: state.trialIndex,
            previousNumber: state.previousNumber,
            currentNumber: state.currentNumber,
            correctAnswer,
            playerAnswer: -1,
            correct: false,
            responseTimeMs,
            isiMs: state.currentIsiMs,
          },
        ],
      };
    }

    case 'NEXT_TRIAL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'feedback') {
        return { state, eventDrafts: [] };
      }

      const nextTrialIndex = state.trialIndex + 1;

      if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
        return finalizePasatSession(state, config, 'completed', action.timestamp);
      }

      if (nextTrialIndex >= config.maxTrials) {
        return finalizePasatSession(state, config, 'completed', action.timestamp);
      }

      return {
        state: {
          ...state,
          trialIndex: nextTrialIndex,
          trialPhase: 'awaiting_response',
          previousNumber: state.currentNumber,
          currentNumber: action.number,
          stimulusShownAtMs: action.timestamp,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizePasatSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialPasatSessionState(),
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
