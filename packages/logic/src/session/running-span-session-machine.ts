/**
 * Running Span Session Machine - Pure State Machine
 *
 * Manages the Running Span task session state.
 * No side effects, no randomness - items provided externally.
 *
 * Flow per trial:
 * 1. BEGIN_TRIAL → streaming (sequence generated externally)
 * 2. SHOW_ITEM(letter) × N → items stream one by one
 * 3. END_STREAM → recalling (player doesn't know when stream ends)
 * 4. SUBMIT_RECALL(letters[]) → feedback
 * 5. NEXT_TRIAL or finished
 */

import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  RunningSpanSessionStartedEvent,
  RunningSpanTrialCompletedEvent,
  RunningSpanSessionEndedEvent,
} from '../engine/events';
import type { RunningSpanCompletionInput } from '../engine/session-completion-projector';

// =============================================================================
// Types
// =============================================================================

export type RunningSpanTrialPhase = 'idle' | 'streaming' | 'recalling' | 'feedback';
export type RunningSpanSessionPhase = 'playing' | 'finished';
export type RunningSpanEndReason = 'completed' | 'span-limit' | 'abandoned';

export interface RunningSpanTrialResult {
  readonly span: number;
  readonly streamLength: number;
  readonly targetLetters: readonly string[];
  readonly recalled: readonly string[];
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

export interface RunningSpanSessionSummary {
  readonly results: readonly RunningSpanTrialResult[];
  readonly maxSpanReached: number;
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly accuracy: number;
}

export interface RunningSpanSessionMachineConfig {
  readonly startSpan: number;
  readonly maxSpan: number;
  readonly maxConsecutiveFailures: number;
  readonly maxTrials: number;
  readonly playContext: SessionPlayContext;
}

export interface RunningSpanSessionMachineState {
  readonly sessionPhase: RunningSpanSessionPhase;
  readonly trialPhase: RunningSpanTrialPhase;
  readonly currentSpan: number;
  readonly trialIndex: number;
  readonly streamItems: readonly string[];
  readonly playerRecall: readonly string[];
  readonly consecutiveFailures: number;
  readonly maxSpanReached: number;
  readonly results: readonly RunningSpanTrialResult[];
  readonly sessionStarted: boolean;
  readonly startedAtMs: number | null;
  readonly endReason: RunningSpanEndReason | null;
  readonly recallStartMs: number | null;
  readonly userId: string | null;
}

// =============================================================================
// Actions
// =============================================================================

export interface BeginRunningSpanTrialAction {
  readonly type: 'BEGIN_TRIAL';
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface ShowRunningSpanItemAction {
  readonly type: 'SHOW_ITEM';
  readonly letter: string;
  readonly timestamp: number;
}

export interface EndRunningSpanStreamAction {
  readonly type: 'END_STREAM';
  readonly timestamp: number;
}

export interface SubmitRunningSpanRecallAction {
  readonly type: 'SUBMIT_RECALL';
  readonly recalled: readonly string[];
  readonly timestamp: number;
}

export interface NextRunningSpanTrialAction {
  readonly type: 'NEXT_TRIAL';
  readonly timestamp: number;
}

export interface AbandonRunningSpanSessionAction {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartRunningSpanSessionAction {
  readonly type: 'RESTART';
}

export type RunningSpanSessionMachineAction =
  | BeginRunningSpanTrialAction
  | ShowRunningSpanItemAction
  | EndRunningSpanStreamAction
  | SubmitRunningSpanRecallAction
  | NextRunningSpanTrialAction
  | AbandonRunningSpanSessionAction
  | RestartRunningSpanSessionAction;

// =============================================================================
// Event Drafts
// =============================================================================

type RunningSpanStartEventDraft = Omit<
  RunningSpanSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type RunningSpanTrialEventDraft = Omit<
  RunningSpanTrialCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type RunningSpanEndEventDraft = Omit<
  RunningSpanSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type RunningSpanSessionEventDraft =
  | RunningSpanStartEventDraft
  | RunningSpanTrialEventDraft
  | RunningSpanEndEventDraft;

export type RunningSpanCompletionDraft = Omit<
  RunningSpanCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface RunningSpanSessionMachineTransition {
  readonly state: RunningSpanSessionMachineState;
  readonly eventDrafts: readonly RunningSpanSessionEventDraft[];
  readonly completionDraft?: RunningSpanCompletionDraft;
}

// =============================================================================
// Helpers
// =============================================================================

export function createInitialRunningSpanSessionState(): RunningSpanSessionMachineState {
  return {
    sessionPhase: 'playing',
    trialPhase: 'idle',
    currentSpan: 0,
    trialIndex: 0,
    streamItems: [],
    playerRecall: [],
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

export function generateRunningSpanStream(
  span: number,
  minExtra: number,
  maxExtra: number,
  pool: readonly string[],
): string[] {
  const extraCount = minExtra + Math.floor(Math.random() * (maxExtra - minExtra + 1));
  const totalLength = span + extraCount;
  const items: string[] = [];
  for (let i = 0; i < totalLength; i++) {
    items.push(pool[Math.floor(Math.random() * pool.length)] as string);
  }
  return items;
}

export function buildRunningSpanSessionSummary(
  results: readonly RunningSpanTrialResult[],
): RunningSpanSessionSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const totalTrials = results.length;
  const maxSpanReached = results.reduce((max, r) => (r.correct && r.span > max ? r.span : max), 0);
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  return { results, maxSpanReached, correctTrials, totalTrials, accuracy };
}

// =============================================================================
// Session Finalization
// =============================================================================

function finalizeRunningSpanSession(
  state: RunningSpanSessionMachineState,
  config: RunningSpanSessionMachineConfig,
  reason: RunningSpanEndReason,
  timestamp: number,
): RunningSpanSessionMachineTransition {
  const finishedState: RunningSpanSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    endReason: reason,
  };

  if (!state.sessionStarted) {
    return { state: finishedState, eventDrafts: [] };
  }

  const summary = buildRunningSpanSessionSummary(state.results);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'RUNNING_SPAN_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason: reason === 'abandoned' ? 'abandoned' : 'completed',
        totalTrials: summary.totalTrials,
        correctTrials: summary.correctTrials,
        maxSpan: summary.maxSpanReached,
        accuracy: summary.accuracy,
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

export function transitionRunningSpanSessionMachine(
  state: RunningSpanSessionMachineState,
  action: RunningSpanSessionMachineAction,
  config: RunningSpanSessionMachineConfig,
): RunningSpanSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_TRIAL': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.trialPhase !== 'idle') return { state, eventDrafts: [] };

      const effectiveSpan = state.sessionStarted ? state.currentSpan : config.startSpan;
      const eventDrafts: RunningSpanSessionEventDraft[] = [];

      if (!state.sessionStarted) {
        eventDrafts.push({
          type: 'RUNNING_SPAN_SESSION_STARTED',
          userId: action.userId,
          config: {
            startSpan: config.startSpan,
            maxConsecutiveFailures: config.maxConsecutiveFailures,
          },
          device: action.device,
          context: action.context,
          playContext: config.playContext,
          gameMode: 'running-span',
        });
      }

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: state.startedAtMs ?? action.timestamp,
          trialPhase: 'streaming',
          currentSpan: effectiveSpan,
          streamItems: [],
          playerRecall: [],
          recallStartMs: null,
          userId: state.userId ?? action.userId,
        },
        eventDrafts,
      };
    }

    case 'SHOW_ITEM': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'streaming') {
        return { state, eventDrafts: [] };
      }
      return {
        state: {
          ...state,
          streamItems: [...state.streamItems, action.letter],
        },
        eventDrafts: [],
      };
    }

    case 'END_STREAM': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'streaming') {
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

    case 'SUBMIT_RECALL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'recalling') {
        return { state, eventDrafts: [] };
      }

      const targetLetters = state.streamItems.slice(-state.currentSpan);
      const correct =
        action.recalled.length === targetLetters.length &&
        action.recalled.every((l, i) => l === targetLetters[i]);

      const responseTimeMs = Math.max(
        0,
        action.timestamp - (state.recallStartMs ?? action.timestamp),
      );

      const result: RunningSpanTrialResult = {
        span: state.currentSpan,
        streamLength: state.streamItems.length,
        targetLetters,
        recalled: action.recalled,
        correct,
        responseTimeMs,
      };

      const results = [...state.results, result];
      const newMaxSpan =
        correct && state.currentSpan > state.maxSpanReached
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
            type: 'RUNNING_SPAN_TRIAL_COMPLETED',
            trialIndex: state.trialIndex,
            span: state.currentSpan,
            streamLength: state.streamItems.length,
            targetLetters: [...targetLetters],
            recalled: [...action.recalled],
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

      if (newConsecutiveFailures >= config.maxConsecutiveFailures) {
        return finalizeRunningSpanSession(
          { ...state, consecutiveFailures: newConsecutiveFailures },
          config,
          'completed',
          action.timestamp,
        );
      }

      const nextSpan = wasCorrect ? state.currentSpan + 1 : state.currentSpan;

      if (nextSpan > config.maxSpan) {
        return finalizeRunningSpanSession(state, config, 'span-limit', action.timestamp);
      }

      if (nextTrialIndex >= config.maxTrials) {
        return finalizeRunningSpanSession(state, config, 'completed', action.timestamp);
      }

      return {
        state: {
          ...state,
          trialIndex: nextTrialIndex,
          trialPhase: 'idle',
          currentSpan: nextSpan,
          streamItems: [],
          playerRecall: [],
          consecutiveFailures: newConsecutiveFailures,
          recallStartMs: null,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizeRunningSpanSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialRunningSpanSessionState(),
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
