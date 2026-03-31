/**
 * SWM Session Machine - Pure State Machine
 *
 * Spatial Working Memory search task.
 * No side effects, no randomness — token positions provided externally.
 *
 * Flow per round:
 * 1. N boxes displayed, some with tokens hidden
 * 2. Player opens boxes one at a time to find the token
 * 3. When found, token goes to "found" pool, next round starts
 * 4. Previously-found boxes can never hold tokens again
 * 5. Errors: within-search (reopening box in current round) or between-search (opening a found-token box)
 * 6. Span increases on success, session ends after consecutive failures or max trials
 */

import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  SwmSessionStartedEvent,
  SwmRoundCompletedEvent,
  SwmSessionEndedEvent,
} from '../engine/events';
import type { SwmCompletionInput } from '../engine/session-completion-projector';

// =============================================================================
// Types
// =============================================================================

export type SwmRoundPhase = 'idle' | 'searching' | 'feedback';
export type SwmSessionPhase = 'playing' | 'finished';
export type SwmEndReason = 'completed' | 'abandoned';

export interface SwmRoundResult {
  readonly span: number;
  readonly tokensToFind: number;
  readonly withinSearchErrors: number;
  readonly betweenSearchErrors: number;
  readonly totalErrors: number;
  readonly searchesUsed: number;
  readonly correct: boolean;
  readonly roundTimeMs: number;
}

export interface SwmSessionSummary {
  readonly results: readonly SwmRoundResult[];
  readonly correctRounds: number;
  readonly totalRounds: number;
  readonly accuracy: number;
  readonly maxSpanReached: number;
  readonly totalWithinErrors: number;
  readonly totalBetweenErrors: number;
  readonly totalErrors: number;
  readonly avgRoundTimeMs: number;
}

export interface SwmSessionMachineConfig {
  readonly startBoxes: number;
  readonly maxBoxes: number;
  readonly maxConsecutiveFailures: number;
  readonly maxTrials: number;
  readonly playContext: SessionPlayContext;
}

export interface SwmSessionMachineState {
  readonly sessionPhase: SwmSessionPhase;
  readonly roundPhase: SwmRoundPhase;
  readonly roundIndex: number;
  readonly currentSpan: number;
  readonly consecutiveCorrect: number;
  readonly consecutiveFailures: number;
  readonly results: readonly SwmRoundResult[];
  readonly sessionStarted: boolean;
  readonly startedAtMs: number | null;
  readonly endReason: SwmEndReason | null;
  // Current round state
  readonly tokenPosition: number | null;
  readonly foundPositions: readonly number[];
  readonly openedThisRound: readonly number[];
  readonly withinSearchErrors: number;
  readonly betweenSearchErrors: number;
  readonly searchesUsed: number;
  readonly roundStartedAtMs: number | null;
  readonly userId: string | null;
}

// =============================================================================
// Actions
// =============================================================================

export interface BeginSwmRoundAction {
  readonly type: 'BEGIN_ROUND';
  readonly tokenPosition: number;
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface OpenBoxAction {
  readonly type: 'OPEN_BOX';
  readonly position: number;
  readonly timestamp: number;
}

export interface NextRoundAction {
  readonly type: 'NEXT_ROUND';
  readonly tokenPosition: number;
  readonly timestamp: number;
}

export interface AbandonSwmAction {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartSwmAction {
  readonly type: 'RESTART';
}

export type SwmSessionMachineAction =
  | BeginSwmRoundAction
  | OpenBoxAction
  | NextRoundAction
  | AbandonSwmAction
  | RestartSwmAction;

// =============================================================================
// Event Drafts
// =============================================================================

type SwmStartEventDraft = Omit<
  SwmSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type SwmRoundEventDraft = Omit<
  SwmRoundCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type SwmEndEventDraft = Omit<
  SwmSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type SwmSessionEventDraft = SwmStartEventDraft | SwmRoundEventDraft | SwmEndEventDraft;

export type SwmCompletionDraft = Omit<
  SwmCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface SwmSessionMachineTransition {
  readonly state: SwmSessionMachineState;
  readonly eventDrafts: readonly SwmSessionEventDraft[];
  readonly completionDraft?: SwmCompletionDraft;
}

// =============================================================================
// Helpers
// =============================================================================

export function createInitialSwmSessionState(): SwmSessionMachineState {
  return {
    sessionPhase: 'playing',
    roundPhase: 'idle',
    roundIndex: 0,
    currentSpan: 0,
    consecutiveCorrect: 0,
    consecutiveFailures: 0,
    results: [],
    sessionStarted: false,
    startedAtMs: null,
    endReason: null,
    tokenPosition: null,
    foundPositions: [],
    openedThisRound: [],
    withinSearchErrors: 0,
    betweenSearchErrors: 0,
    searchesUsed: 0,
    roundStartedAtMs: null,
    userId: null,
  };
}

/** Generate a random token position excluding already-found positions */
export function generateSwmTokenPosition(
  numBoxes: number,
  foundPositions: readonly number[],
): number {
  const available: number[] = [];
  for (let i = 0; i < numBoxes; i++) {
    if (!foundPositions.includes(i)) {
      available.push(i);
    }
  }
  if (available.length === 0) return 0;
  return available[Math.floor(Math.random() * available.length)] as number;
}

export function buildSwmSessionSummary(results: readonly SwmRoundResult[]): SwmSessionSummary {
  const correctRounds = results.filter((r) => r.correct).length;
  const totalRounds = results.length;
  const accuracy = totalRounds > 0 ? Math.round((correctRounds / totalRounds) * 100) : 0;
  const maxSpanReached =
    results.length > 0 ? Math.max(...results.filter((r) => r.correct).map((r) => r.span), 0) : 0;
  const totalWithinErrors = results.reduce((s, r) => s + r.withinSearchErrors, 0);
  const totalBetweenErrors = results.reduce((s, r) => s + r.betweenSearchErrors, 0);
  const totalErrors = totalWithinErrors + totalBetweenErrors;
  const roundTimes = results.map((r) => r.roundTimeMs).filter((t) => t > 0);
  const avgRoundTimeMs =
    roundTimes.length > 0
      ? Math.round(roundTimes.reduce((a, b) => a + b, 0) / roundTimes.length)
      : 0;

  return {
    results,
    correctRounds,
    totalRounds,
    accuracy,
    maxSpanReached,
    totalWithinErrors,
    totalBetweenErrors,
    totalErrors,
    avgRoundTimeMs,
  };
}

// =============================================================================
// Session Finalization
// =============================================================================

function finalizeSwmSession(
  state: SwmSessionMachineState,
  config: SwmSessionMachineConfig,
  reason: SwmEndReason,
  timestamp: number,
): SwmSessionMachineTransition {
  const finishedState: SwmSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    endReason: reason,
  };

  if (!state.sessionStarted) {
    return { state: finishedState, eventDrafts: [] };
  }

  const summary = buildSwmSessionSummary(state.results);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'SWM_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason,
        totalRounds: summary.totalRounds,
        correctRounds: summary.correctRounds,
        accuracy: summary.accuracy,
        maxSpanReached: summary.maxSpanReached,
        totalWithinErrors: summary.totalWithinErrors,
        totalBetweenErrors: summary.totalBetweenErrors,
        totalErrors: summary.totalErrors,
        score: summary.accuracy,
        durationMs,
        playContext: config.playContext,
      },
    ],
    completionDraft: {
      reason,
      accuracy: summary.accuracy,
      correctRounds: summary.correctRounds,
      totalRounds: summary.totalRounds,
      maxSpanReached: summary.maxSpanReached,
      totalWithinErrors: summary.totalWithinErrors,
      totalBetweenErrors: summary.totalBetweenErrors,
      totalErrors: summary.totalErrors,
      durationMs,
    },
  };
}

// =============================================================================
// State Machine Transition
// =============================================================================

/** Max errors per round before the round counts as failed */
const MAX_ERRORS_PER_ROUND = 4;

export function transitionSwmSessionMachine(
  state: SwmSessionMachineState,
  action: SwmSessionMachineAction,
  config: SwmSessionMachineConfig,
): SwmSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_ROUND': {
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      if (state.roundPhase !== 'idle') return { state, eventDrafts: [] };

      const span = state.sessionStarted ? state.currentSpan : config.startBoxes;

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: state.startedAtMs ?? action.timestamp,
          roundPhase: 'searching',
          currentSpan: span,
          tokenPosition: action.tokenPosition,
          openedThisRound: [],
          withinSearchErrors: 0,
          betweenSearchErrors: 0,
          searchesUsed: 0,
          roundStartedAtMs: action.timestamp,
          userId: state.userId ?? action.userId,
        },
        eventDrafts: state.sessionStarted
          ? []
          : [
              {
                type: 'SWM_SESSION_STARTED',
                userId: action.userId,
                config: {
                  startBoxes: config.startBoxes,
                  maxBoxes: config.maxBoxes,
                  maxConsecutiveFailures: config.maxConsecutiveFailures,
                },
                device: action.device,
                context: action.context,
                playContext: config.playContext,
                gameMode: 'swm',
              },
            ],
      };
    }

    case 'OPEN_BOX': {
      if (state.sessionPhase === 'finished' || state.roundPhase !== 'searching') {
        return { state, eventDrafts: [] };
      }

      const pos = action.position;
      let withinErr = state.withinSearchErrors;
      let betweenErr = state.betweenSearchErrors;

      // Check between-search error: box where token was already found
      if (state.foundPositions.includes(pos)) {
        betweenErr++;
      }
      // Check within-search error: box already opened this round (not found)
      else if (state.openedThisRound.includes(pos)) {
        withinErr++;
      }

      const newOpened = state.openedThisRound.includes(pos)
        ? state.openedThisRound
        : [...state.openedThisRound, pos];
      const searches = state.searchesUsed + 1;

      // Found the token!
      if (pos === state.tokenPosition) {
        const roundTimeMs = Math.max(
          0,
          action.timestamp - (state.roundStartedAtMs ?? action.timestamp),
        );
        const totalErrors = withinErr + betweenErr;
        const correct = totalErrors === 0;

        const result: SwmRoundResult = {
          span: state.currentSpan,
          tokensToFind: 1,
          withinSearchErrors: withinErr,
          betweenSearchErrors: betweenErr,
          totalErrors,
          searchesUsed: searches,
          correct,
          roundTimeMs,
        };

        const newFound = [...state.foundPositions, pos];
        const results = [...state.results, result];
        const newConsecutiveCorrect = correct ? state.consecutiveCorrect + 1 : 0;
        const newConsecutiveFailures = correct ? 0 : state.consecutiveFailures + 1;

        return {
          state: {
            ...state,
            roundPhase: 'feedback',
            results,
            foundPositions: newFound,
            openedThisRound: newOpened,
            withinSearchErrors: withinErr,
            betweenSearchErrors: betweenErr,
            searchesUsed: searches,
            consecutiveCorrect: newConsecutiveCorrect,
            consecutiveFailures: newConsecutiveFailures,
          },
          eventDrafts: [
            {
              type: 'SWM_ROUND_COMPLETED',
              roundIndex: state.roundIndex,
              span: state.currentSpan,
              tokenPosition: state.tokenPosition as number,
              withinSearchErrors: withinErr,
              betweenSearchErrors: betweenErr,
              totalErrors,
              searchesUsed: searches,
              correct,
              roundTimeMs,
            },
          ],
        };
      }

      // Too many errors — auto-fail the round
      if (withinErr + betweenErr >= MAX_ERRORS_PER_ROUND) {
        const roundTimeMs = Math.max(
          0,
          action.timestamp - (state.roundStartedAtMs ?? action.timestamp),
        );
        const totalErrors = withinErr + betweenErr;

        const result: SwmRoundResult = {
          span: state.currentSpan,
          tokensToFind: 1,
          withinSearchErrors: withinErr,
          betweenSearchErrors: betweenErr,
          totalErrors,
          searchesUsed: searches,
          correct: false,
          roundTimeMs,
        };

        const results = [...state.results, result];

        return {
          state: {
            ...state,
            roundPhase: 'feedback',
            results,
            openedThisRound: newOpened,
            withinSearchErrors: withinErr,
            betweenSearchErrors: betweenErr,
            searchesUsed: searches,
            consecutiveCorrect: 0,
            consecutiveFailures: state.consecutiveFailures + 1,
          },
          eventDrafts: [
            {
              type: 'SWM_ROUND_COMPLETED',
              roundIndex: state.roundIndex,
              span: state.currentSpan,
              tokenPosition: state.tokenPosition as number,
              withinSearchErrors: withinErr,
              betweenSearchErrors: betweenErr,
              totalErrors,
              searchesUsed: searches,
              correct: false,
              roundTimeMs,
            },
          ],
        };
      }

      // Continue searching
      return {
        state: {
          ...state,
          openedThisRound: newOpened,
          withinSearchErrors: withinErr,
          betweenSearchErrors: betweenErr,
          searchesUsed: searches,
        },
        eventDrafts: [],
      };
    }

    case 'NEXT_ROUND': {
      if (state.sessionPhase === 'finished' || state.roundPhase !== 'feedback') {
        return { state, eventDrafts: [] };
      }

      const nextRoundIndex = state.roundIndex + 1;

      if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
        return finalizeSwmSession(state, config, 'completed', action.timestamp);
      }

      if (nextRoundIndex >= config.maxTrials) {
        return finalizeSwmSession(state, config, 'completed', action.timestamp);
      }

      // Increase span every 2 correct rounds, reset found positions for new span
      let nextSpan = state.currentSpan;
      let nextFound = state.foundPositions;
      if (state.consecutiveCorrect > 0 && state.consecutiveCorrect % 2 === 0) {
        nextSpan = Math.min(config.maxBoxes, state.currentSpan + 1);
        nextFound = []; // Reset found positions for new difficulty level
      }

      // If all boxes have been found at current span, reset
      if (nextFound.length >= nextSpan) {
        nextFound = [];
      }

      return {
        state: {
          ...state,
          roundIndex: nextRoundIndex,
          roundPhase: 'searching',
          currentSpan: nextSpan,
          foundPositions: nextFound,
          tokenPosition: action.tokenPosition,
          openedThisRound: [],
          withinSearchErrors: 0,
          betweenSearchErrors: 0,
          searchesUsed: 0,
          roundStartedAtMs: action.timestamp,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizeSwmSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialSwmSessionState(),
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
