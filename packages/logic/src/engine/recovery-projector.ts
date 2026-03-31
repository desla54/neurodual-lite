/**
 * RecoveryProjector - Extract recoverable session state from events
 *
 * Pure function that projects events into a RecoverableState object.
 * Used when resuming an interrupted session after page refresh.
 *
 * Supports multiple session types:
 * - Tempo (N-Back): SESSION_STARTED, TRIAL_PRESENTED, USER_RESPONDED
 * - Trace: TRACE_SESSION_STARTED, TRACE_STIMULUS_SHOWN, TRACE_RESPONDED
 * - Flow: FLOW_SESSION_STARTED, FLOW_STIMULUS_SHOWN
 * - DualPick: DUAL_PICK_SESSION_STARTED, DUAL_PICK_STIMULUS_SHOWN
 * - Memo: RECALL_SESSION_STARTED, RECALL_STIMULUS_SHOWN
 *
 * Returns null if:
 * - Session already ended (SESSION_ENDED event present)
 * - No session start event found
 */

import type { BlockConfig, Trial } from '../types';
import type {
  DualPickSessionStartedEvent,
  DualPickStimulusShownEvent,
  GameEvent,
  MemoSessionStartedEvent,
  MemoStimulusShownEvent,
  PlaceSessionStartedEvent,
  PlaceStimulusShownEvent,
  SessionStartedEvent,
  TraceSessionStartedEvent,
  TraceStimulusShownEvent,
  TrialPresentedEvent,
  UserResponseEvent,
} from './events';
import type { ModeSpec } from '../specs/types';

// =============================================================================
// Types
// =============================================================================

export interface RecoverableState {
  readonly sessionId: string;
  readonly userId: string;
  readonly config: BlockConfig;
  readonly spec: ModeSpec | null;
  readonly gameMode: string | null;
  readonly journeyStageId: number | null;
  readonly journeyId: string | null;
  readonly trialsSeed: string | null;
  readonly lastTrialIndex: number;
  readonly trialHistory: readonly Trial[];
  readonly responses: readonly UserResponseEvent[];
  readonly startTimestamp: number;
}

// =============================================================================
// Projector
// =============================================================================

export class RecoveryProjector {
  /**
   * Project events into recoverable state.
   * Returns null if session is not recoverable.
   */
  static project(events: readonly GameEvent[]): RecoverableState | null {
    if (events.length === 0) {
      console.log('[RecoveryProjector] No events provided');
      return null;
    }

    const eventTypes = events.map((e) => e.type);
    console.log('[RecoveryProjector] Analyzing events:', {
      count: events.length,
      types: [...new Set(eventTypes)],
    });

    // Check for SESSION_ENDED - not recoverable
    const hasEnded = events.some(
      (e) =>
        e.type === 'SESSION_ENDED' ||
        e.type === 'RECALL_SESSION_ENDED' ||
        e.type === 'FLOW_SESSION_ENDED' ||
        e.type === 'DUAL_PICK_SESSION_ENDED' ||
        e.type === 'TRACE_SESSION_ENDED',
    );
    if (hasEnded) {
      console.log('[RecoveryProjector] Session already ended, not recoverable');
      return null;
    }

    // Try Trace session first
    const traceStartEvent = events.find((e) => e.type === 'TRACE_SESSION_STARTED') as
      | TraceSessionStartedEvent
      | undefined;
    if (traceStartEvent) {
      console.log('[RecoveryProjector] Found TRACE_SESSION_STARTED');
      return RecoveryProjector.projectTraceSession(events, traceStartEvent);
    }

    // Try Flow session
    const flowStartEvent = events.find((e) => e.type === 'FLOW_SESSION_STARTED') as
      | PlaceSessionStartedEvent
      | undefined;
    if (flowStartEvent) {
      console.log('[RecoveryProjector] Found FLOW_SESSION_STARTED');
      return RecoveryProjector.projectPlaceSession(events, flowStartEvent);
    }

    // Try DualPick session
    const dualPickStartEvent = events.find((e) => e.type === 'DUAL_PICK_SESSION_STARTED') as
      | DualPickSessionStartedEvent
      | undefined;
    if (dualPickStartEvent) {
      console.log('[RecoveryProjector] Found DUAL_PICK_SESSION_STARTED');
      return RecoveryProjector.projectDualPickSession(events, dualPickStartEvent);
    }

    // Try Memo session
    const memoStartEvent = events.find((e) => e.type === 'RECALL_SESSION_STARTED') as
      | MemoSessionStartedEvent
      | undefined;
    if (memoStartEvent) {
      console.log('[RecoveryProjector] Found RECALL_SESSION_STARTED (Memo)');
      return RecoveryProjector.projectMemoSession(events, memoStartEvent);
    }

    // Try Tempo (N-Back) session
    const tempoStartEvent = events.find((e) => e.type === 'SESSION_STARTED') as
      | SessionStartedEvent
      | undefined;
    if (tempoStartEvent) {
      console.log('[RecoveryProjector] Found SESSION_STARTED (Tempo)');
      return RecoveryProjector.projectTempoSession(events, tempoStartEvent);
    }

    // No recognizable session start event
    console.warn(
      '[RecoveryProjector] No recognized session start event found. Event types:',
      eventTypes,
    );
    return null;
  }

  /**
   * Project Tempo (N-Back) session events.
   */
  private static projectTempoSession(
    events: readonly GameEvent[],
    startEvent: SessionStartedEvent,
  ): RecoverableState {
    // Extract trials
    const trialEvents = events.filter((e) => e.type === 'TRIAL_PRESENTED') as TrialPresentedEvent[];
    const trials = trialEvents.map((e) => e.trial);
    const lastTrial = trials[trials.length - 1];
    const lastTrialIndex = lastTrial !== undefined ? lastTrial.index : -1;

    // Extract responses
    const responses = events.filter((e) => e.type === 'USER_RESPONDED') as UserResponseEvent[];

    return {
      sessionId: startEvent.sessionId,
      userId: startEvent.userId,
      config: startEvent.config,
      spec: startEvent.spec ?? null,
      gameMode: startEvent.gameMode ?? null,
      journeyStageId: startEvent.journeyStageId ?? null,
      journeyId: startEvent.journeyId ?? null,
      trialsSeed: startEvent.trialsSeed ?? null,
      lastTrialIndex,
      trialHistory: trials,
      responses,
      startTimestamp: startEvent.timestamp,
    };
  }

  /**
   * Project Trace session events.
   */
  private static projectTraceSession(
    events: readonly GameEvent[],
    startEvent: TraceSessionStartedEvent,
  ): RecoverableState {
    // Extract stimulus events to find last trial index
    const stimulusEvents = events.filter(
      (e) => e.type === 'TRACE_STIMULUS_SHOWN',
    ) as TraceStimulusShownEvent[];
    const lastStimulus = stimulusEvents[stimulusEvents.length - 1];
    const lastTrialIndex = lastStimulus !== undefined ? lastStimulus.trialIndex : -1;

    // Convert TraceSessionConfigEvent to BlockConfig for compatibility
    const config: BlockConfig = {
      nLevel: startEvent.config.nLevel,
      trialsCount: startEvent.config.trialsCount,
      generator: 'DualnbackClassic', // Trace uses similar generation
      activeModalities: ['position', 'audio'], // Trace is always dual
      targetProbability: 0.33,
      lureProbability: 0.1,
      intervalSeconds: startEvent.config.responseWindowMs / 1000,
      stimulusDurationSeconds: startEvent.config.stimulusDurationMs / 1000,
    };

    return {
      sessionId: startEvent.sessionId,
      userId: startEvent.userId,
      config,
      spec: startEvent.spec ?? null,
      gameMode: startEvent.gameMode ?? null,
      journeyStageId: startEvent.journeyStageId ?? null,
      journeyId: startEvent.journeyId ?? null,
      trialsSeed: null, // Trace doesn't use seed
      lastTrialIndex,
      trialHistory: [], // Trace regenerates trials, only need lastTrialIndex
      responses: [], // Trace responses have different format
      startTimestamp: startEvent.timestamp,
    };
  }

  /**
   * Project Flow session events.
   */
  private static projectPlaceSession(
    events: readonly GameEvent[],
    startEvent: PlaceSessionStartedEvent,
  ): RecoverableState {
    // Extract stimulus events to find last trial index
    const stimulusEvents = events.filter(
      (e) => e.type === 'FLOW_STIMULUS_SHOWN',
    ) as PlaceStimulusShownEvent[];
    const lastStimulus = stimulusEvents[stimulusEvents.length - 1];
    const lastTrialIndex = lastStimulus !== undefined ? lastStimulus.trialIndex : -1;

    // Convert PlaceSessionConfigEvent to BlockConfig for compatibility
    const config: BlockConfig = {
      nLevel: startEvent.config.nLevel,
      trialsCount: startEvent.config.trialsCount,
      generator: 'DualnbackClassic',
      activeModalities: startEvent.config.activeModalities as ('position' | 'audio')[],
      targetProbability: 0.33,
      lureProbability: 0.1,
      intervalSeconds: 0,
      stimulusDurationSeconds: startEvent.config.stimulusDurationMs / 1000,
    };

    return {
      sessionId: startEvent.sessionId,
      userId: startEvent.userId,
      config,
      spec: null, // Flow doesn't have spec in event
      gameMode: 'dual-place',
      journeyStageId: startEvent.journeyStageId ?? null,
      journeyId: startEvent.journeyId ?? null,
      trialsSeed: null,
      lastTrialIndex,
      trialHistory: [], // Flow regenerates trials
      responses: [], // Flow responses have different format
      startTimestamp: startEvent.timestamp,
    };
  }

  /**
   * Project DualPick session events.
   */
  private static projectDualPickSession(
    events: readonly GameEvent[],
    startEvent: DualPickSessionStartedEvent,
  ): RecoverableState {
    // Extract stimulus events to find last trial index
    const stimulusEvents = events.filter(
      (e) => e.type === 'DUAL_PICK_STIMULUS_SHOWN',
    ) as DualPickStimulusShownEvent[];
    const lastStimulus = stimulusEvents[stimulusEvents.length - 1];
    const lastTrialIndex = lastStimulus !== undefined ? lastStimulus.trialIndex : -1;

    // Convert DualPickSessionConfigEvent to BlockConfig for compatibility
    const config: BlockConfig = {
      nLevel: startEvent.config.nLevel,
      trialsCount: startEvent.config.trialsCount,
      generator: 'DualnbackClassic',
      activeModalities: startEvent.config.activeModalities as ('position' | 'audio')[],
      targetProbability: 0.33,
      lureProbability: 0.1,
      intervalSeconds: 0,
      stimulusDurationSeconds: startEvent.config.stimulusDurationMs / 1000,
    };

    return {
      sessionId: startEvent.sessionId,
      userId: startEvent.userId,
      config,
      spec: null, // DualPick doesn't have spec in event
      gameMode: 'dual-pick',
      journeyStageId: startEvent.journeyStageId ?? null,
      journeyId: startEvent.journeyId ?? null,
      trialsSeed: null,
      lastTrialIndex,
      trialHistory: [], // DualPick regenerates trials
      responses: [], // DualPick responses have different format
      startTimestamp: startEvent.timestamp,
    };
  }

  /**
   * Project Memo session events.
   */
  private static projectMemoSession(
    events: readonly GameEvent[],
    startEvent: MemoSessionStartedEvent,
  ): RecoverableState {
    // Extract stimulus events to find last trial index
    const stimulusEvents = events.filter(
      (e) => e.type === 'RECALL_STIMULUS_SHOWN',
    ) as MemoStimulusShownEvent[];
    const lastStimulus = stimulusEvents[stimulusEvents.length - 1];
    const lastTrialIndex = lastStimulus !== undefined ? lastStimulus.trialIndex : -1;

    // Convert MemoSessionConfig to BlockConfig for compatibility
    const config: BlockConfig = {
      nLevel: startEvent.config.nLevel,
      trialsCount: startEvent.trialsCount,
      generator: 'DualnbackClassic',
      activeModalities: startEvent.config.activeModalities as ('position' | 'audio')[],
      targetProbability: startEvent.config.targetProbability,
      lureProbability: startEvent.config.lureProbability,
      intervalSeconds: 0,
      stimulusDurationSeconds: startEvent.config.stimulusDurationSeconds,
    };

    return {
      sessionId: startEvent.sessionId,
      userId: startEvent.userId,
      config,
      spec: startEvent.spec ?? null,
      gameMode: startEvent.gameMode ?? 'dual-memo',
      journeyStageId: startEvent.journeyStageId ?? null,
      journeyId: startEvent.journeyId ?? null,
      trialsSeed: startEvent.trialsSeed ?? null,
      lastTrialIndex,
      trialHistory: [], // Memo can regenerate with seed
      responses: [], // Memo responses have different format
      startTimestamp: startEvent.timestamp,
    };
  }
}
