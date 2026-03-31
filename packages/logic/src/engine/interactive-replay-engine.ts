/**
 * Interactive Replay Engine
 *
 * Orchestrates interactive replay sessions where users can correct mistakes.
 * Auto-plays structure events and hits, skips false alarms, and allows
 * users to add corrections for misses.
 *
 * Supports all game modes: Tempo, Flow, Recall, DualPick, Track.
 *
 * @see docs/specs/domain-replay-interactif.md
 */

import type { ModalityId, Trial } from '../types/core';
import type { GameEvent, TrialPresentedEvent, UserResponseEvent } from './events';
import type { ReplayEventInput, SkipReason, ReplayEventActor } from '../types/replay-interactif';
import type { ReplaySessionType } from '../ports/replay-port';
import { identifySkippableEvents } from './replay-projector';

// =============================================================================
// Types
// =============================================================================

/** Structure events that are always auto-replayed (tempo) */
const TEMPO_STRUCTURE_EVENTS = new Set([
  'SESSION_STARTED',
  'SESSION_ENDED',
  'TRIAL_PRESENTED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
]);

/** Structure events that are always auto-replayed (flow) */
const FLOW_STRUCTURE_EVENTS = new Set([
  'FLOW_SESSION_STARTED',
  'FLOW_SESSION_ENDED',
  'FLOW_STIMULUS_SHOWN',
  'FLOW_PLACEMENT_STARTED',
  'FLOW_TURN_COMPLETED',
]);

/** Structure events that are always auto-replayed (recall) */
const RECALL_STRUCTURE_EVENTS = new Set([
  'RECALL_SESSION_STARTED',
  'RECALL_SESSION_ENDED',
  'RECALL_STIMULUS_SHOWN',
  'RECALL_STIMULUS_HIDDEN',
  'RECALL_WINDOW_OPENED',
  'RECALL_WINDOW_COMMITTED',
]);

/** Structure events that are always auto-replayed (dual-pick) */
const DUAL_PICK_STRUCTURE_EVENTS = new Set([
  'DUAL_PICK_SESSION_STARTED',
  'DUAL_PICK_SESSION_ENDED',
  'DUAL_PICK_STIMULUS_SHOWN',
  'DUAL_PICK_PLACEMENT_STARTED',
  'DUAL_PICK_TURN_COMPLETED',
]);

/** Structure events that are always auto-replayed (track) */
const TRACK_STRUCTURE_EVENTS = new Set([
  'MOT_SESSION_STARTED',
  'MOT_TRIAL_DEFINED',
  'MOT_TRIAL_COMPLETED',
  'MOT_SESSION_ENDED',
]);

/** Response events by mode */
const RESPONSE_EVENT_BY_MODE: Record<ReplaySessionType, string> = {
  tempo: 'USER_RESPONDED',
  flow: 'FLOW_DROP_ATTEMPTED',
  recall: 'RECALL_PICKED',
  'dual-pick': 'DUAL_PICK_DROP_ATTEMPTED',
  track: 'MOT_TRIAL_COMPLETED',
};

/** Get structure events for a given session type */
function getStructureEventsForMode(sessionType: ReplaySessionType): Set<string> {
  switch (sessionType) {
    case 'tempo':
      return TEMPO_STRUCTURE_EVENTS;
    case 'flow':
      return FLOW_STRUCTURE_EVENTS;
    case 'recall':
      return RECALL_STRUCTURE_EVENTS;
    case 'dual-pick':
      return DUAL_PICK_STRUCTURE_EVENTS;
    case 'track':
      return TRACK_STRUCTURE_EVENTS;
  }
}

/** Get session start event type for a given session type */
function getSessionStartEvent(sessionType: ReplaySessionType): string {
  switch (sessionType) {
    case 'tempo':
      return 'SESSION_STARTED';
    case 'flow':
      return 'FLOW_SESSION_STARTED';
    case 'recall':
      return 'RECALL_SESSION_STARTED';
    case 'dual-pick':
      return 'DUAL_PICK_SESSION_STARTED';
    case 'track':
      return 'MOT_SESSION_STARTED';
  }
}

/** Event emitted during interactive replay */
export interface InteractiveReplayEvent {
  /** Original event from parent run (if auto-played or skipped) */
  readonly originEvent: GameEvent | null;
  /** Actor who generated this event */
  readonly actor: ReplayEventActor;
  /** Whether this event is skipped */
  readonly skipped: boolean;
  /** Reason for skipping (if skipped) */
  readonly skipReason: SkipReason | null;
  /** Event type */
  readonly type: string;
  /** Event timestamp (relative to session start) */
  readonly timestamp: number;
  /** Event payload */
  readonly payload: Record<string, unknown>;
}

/** Score delta between runs */
export interface RunScoreDelta {
  readonly dPrime: number;
  readonly deltaVsParent: number;
  readonly deltaVsOriginal: number;
  readonly falseAlarmsSkipped: number;
  readonly missesCorrections: number;
  readonly newFalseAlarms: number;
}

/** Trial state during replay */
interface TrialState {
  readonly trial: Trial;
  readonly trialIndex: number;
  readonly startMs: number;
  readonly stimulusEndMs: number;
  /** Responses from parent run (hits to auto-play) */
  readonly parentResponses: Set<ModalityId>;
  /** False alarms from parent (to skip) */
  readonly parentFalseAlarms: Set<ModalityId>;
  /** User responses in this run */
  readonly userResponses: Set<ModalityId>;
}

// =============================================================================
// Engine
// =============================================================================

/**
 * Interactive Replay Engine
 *
 * Manages the playback of a session with interactive corrections.
 */
export class InteractiveReplayEngine {
  /** Original parent events */
  private readonly parentEvents: readonly GameEvent[];

  /** Map of event IDs that should be skipped */
  private readonly skippableEventIds: Map<string, SkipReason>;

  /** Events emitted during this run */
  private readonly emittedEvents: InteractiveReplayEvent[] = [];

  /** Current time in ms (relative to session start) */
  private currentTimeMs = 0;

  /** Session start timestamp */
  private readonly sessionStartMs: number;

  /** Map of trial index → trial state */
  private readonly trialStates = new Map<number, TrialState>();

  /** Current trial index */
  private currentTrialIndex = 0;

  /** Index of next parent event to process */
  private parentEventIndex = 0;

  /** Session type for mode-specific handling */
  private readonly sessionType: ReplaySessionType;

  /** Structure event types for this mode */
  private readonly structureEventTypes: Set<string>;

  /** Response event type for this mode */
  private readonly responseEventType: string;

  constructor(
    parentEvents: readonly GameEvent[],
    _activeModalities: readonly ModalityId[],
    sessionType: ReplaySessionType = 'tempo',
  ) {
    this.parentEvents = parentEvents;
    this.sessionType = sessionType;
    this.structureEventTypes = getStructureEventsForMode(sessionType);
    this.responseEventType = RESPONSE_EVENT_BY_MODE[sessionType];

    // Identify events to skip (mode-aware)
    this.skippableEventIds = identifySkippableEvents(parentEvents, sessionType);

    // Find session start timestamp
    const startEventType = getSessionStartEvent(sessionType);
    const startEvent = parentEvents.find((e) => e.type === startEventType);
    this.sessionStartMs = startEvent?.timestamp ?? 0;

    // Build trial states
    this.buildTrialStates();
  }

  /**
   * Build trial states from parent events.
   */
  private buildTrialStates(): void {
    // Find all TRIAL_PRESENTED events
    const trialEvents = this.parentEvents.filter(
      (e) => e.type === 'TRIAL_PRESENTED',
    ) as TrialPresentedEvent[];

    // Find all USER_RESPONDED events grouped by trial
    const responsesByTrial = new Map<number, UserResponseEvent[]>();
    for (const event of this.parentEvents) {
      if (event.type === 'USER_RESPONDED') {
        const responseEvent = event as UserResponseEvent;
        if (!responsesByTrial.has(responseEvent.trialIndex)) {
          responsesByTrial.set(responseEvent.trialIndex, []);
        }
        responsesByTrial.get(responseEvent.trialIndex)?.push(responseEvent);
      }
    }

    // Build state for each trial
    for (const trialEvent of trialEvents) {
      const trialIndex = trialEvent.trial.index;
      const startMs = trialEvent.timestamp - this.sessionStartMs;
      const stimulusEndMs = startMs + trialEvent.stimulusDurationMs;

      // Categorize parent responses
      const parentResponses = new Set<ModalityId>();
      const parentFalseAlarms = new Set<ModalityId>();

      const responses = responsesByTrial.get(trialIndex) ?? [];
      for (const response of responses) {
        if (this.skippableEventIds.has(response.id)) {
          // This is a false alarm to skip
          parentFalseAlarms.add(response.modality);
        } else {
          // This is a hit to auto-play
          parentResponses.add(response.modality);
        }
      }

      this.trialStates.set(trialIndex, {
        trial: trialEvent.trial,
        trialIndex,
        startMs,
        stimulusEndMs,
        parentResponses,
        parentFalseAlarms,
        userResponses: new Set(),
      });
    }
  }

  /**
   * Advance time and emit events.
   *
   * @param deltaMs - Time to advance in milliseconds
   * @returns Events emitted during this tick
   */
  tick(deltaMs: number): InteractiveReplayEvent[] {
    const newTimeMs = this.currentTimeMs + deltaMs;
    const emitted: InteractiveReplayEvent[] = [];

    // Process parent events in [currentTimeMs, newTimeMs]
    while (this.parentEventIndex < this.parentEvents.length) {
      const event = this.parentEvents[this.parentEventIndex];
      if (!event) break;

      const eventTime = event.timestamp - this.sessionStartMs;

      // Stop if we've passed the new time
      // Use > (not >=) to process events at exactly newTimeMs
      // This ensures engine.currentTrialIndex stays in sync with timeline segments
      if (eventTime > newTimeMs) break;

      // Skip events before current time (shouldn't happen normally)
      if (eventTime < this.currentTimeMs) {
        this.parentEventIndex++;
        continue;
      }

      // Handle the event based on type
      const emittedEvent = this.processParentEvent(event, eventTime);
      if (emittedEvent) {
        emitted.push(emittedEvent);
        this.emittedEvents.push(emittedEvent);
      }

      this.parentEventIndex++;

      // Update current trial index for TRIAL_PRESENTED
      if (event.type === 'TRIAL_PRESENTED') {
        const trialEvent = event as TrialPresentedEvent;
        this.currentTrialIndex = trialEvent.trial.index;
      }
    }

    this.currentTimeMs = newTimeMs;
    return emitted;
  }

  /**
   * Process a parent event and decide how to handle it.
   */
  private processParentEvent(event: GameEvent, eventTime: number): InteractiveReplayEvent | null {
    // Structure events are always auto-replayed
    if (this.structureEventTypes.has(event.type)) {
      return {
        originEvent: event,
        actor: 'auto',
        skipped: false,
        skipReason: null,
        type: event.type,
        timestamp: eventTime,
        payload: this.extractPayload(event),
      };
    }

    // Response events may be skipped or auto-played
    if (event.type === this.responseEventType) {
      const skipReason = this.skippableEventIds.get(event.id);

      if (skipReason) {
        // Skip silently (don't add to emitted events visually)
        return {
          originEvent: event,
          actor: 'auto',
          skipped: true,
          skipReason,
          type: event.type,
          timestamp: eventTime,
          payload: this.extractPayload(event),
        };
      }

      // Auto-play hits
      return {
        originEvent: event,
        actor: 'auto',
        skipped: false,
        skipReason: null,
        type: event.type,
        timestamp: eventTime,
        payload: this.extractPayload(event),
      };
    }

    // Other events (FOCUS_LOST, etc.) are auto-replayed
    return {
      originEvent: event,
      actor: 'auto',
      skipped: false,
      skipReason: null,
      type: event.type,
      timestamp: eventTime,
      payload: this.extractPayload(event),
    };
  }

  /**
   * Extract payload from an event for storage.
   */
  private extractPayload(event: GameEvent): Record<string, unknown> {
    const {
      type: _type,
      id: _id,
      timestamp: _ts,
      sessionId: _sid,
      ...payload
    } = event as unknown as Record<string, unknown>;
    return payload;
  }

  /**
   * Handle a user response (correction attempt).
   *
   * @param modality - The modality the user responded to
   * @returns The created event if valid, null if invalid
   */
  handleUserResponse(modality: ModalityId): InteractiveReplayEvent | null {
    const trialState = this.trialStates.get(this.currentTrialIndex);
    if (!trialState) return null;

    // Check if user already responded for this modality in this run
    if (trialState.userResponses.has(modality)) {
      return null; // Duplicate response
    }

    // Check if this was already auto-played (hit from parent)
    if (trialState.parentResponses.has(modality)) {
      return null; // Already played
    }

    // Record user response
    trialState.userResponses.add(modality);

    // Create user event
    const event: InteractiveReplayEvent = {
      originEvent: null,
      actor: 'user',
      skipped: false,
      skipReason: null,
      type: 'USER_RESPONDED',
      timestamp: this.currentTimeMs,
      payload: {
        trialIndex: this.currentTrialIndex,
        modality,
        reactionTimeMs: 0, // User-initiated, no reaction time
        pressDurationMs: 0,
        responsePhase: 'during_stimulus',
      },
    };

    this.emittedEvents.push(event);
    return event;
  }

  /**
   * Convert emitted events to ReplayEventInput for persistence.
   */
  toReplayEventInputs(runId: string): ReplayEventInput[] {
    return this.emittedEvents.map((e) => ({
      runId,
      type: e.type,
      // Round timestamp to integer for BIGINT column compatibility
      timestamp: Math.round(e.timestamp),
      payload: e.payload,
      actor: e.actor,
      originEventId: e.originEvent?.id ?? null,
      skipped: e.skipped,
      skipReason: e.skipReason,
    }));
  }

  /**
   * Compute score for the current run.
   * Uses only non-skipped events.
   */
  computeScore(): RunScoreDelta {
    // Count various categories
    let falseAlarmsSkipped = 0;
    let missesCorrections = 0;
    let newFalseAlarms = 0;

    for (const [, trialState] of this.trialStates) {
      // False alarms skipped = parent false alarms
      falseAlarmsSkipped += trialState.parentFalseAlarms.size;

      // Check each user response
      for (const modality of trialState.userResponses) {
        const isTarget = this.isTrialTarget(trialState.trial, modality);
        if (isTarget) {
          // User corrected a miss
          missesCorrections++;
        } else {
          // User created a new false alarm
          newFalseAlarms++;
        }
      }
    }

    // TODO: Compute actual d' from events
    // For now, return placeholder values
    return {
      dPrime: 0,
      deltaVsParent: 0,
      deltaVsOriginal: 0,
      falseAlarmsSkipped,
      missesCorrections,
      newFalseAlarms,
    };
  }

  /**
   * Check if a trial is a target for a modality.
   */
  private isTrialTarget(trial: Trial, modality: ModalityId): boolean {
    switch (modality) {
      case 'position':
        return trial.isPositionTarget;
      case 'audio':
        return trial.isSoundTarget;
      case 'color':
        return trial.isColorTarget;
      default:
        return false;
    }
  }

  /**
   * Get current time in milliseconds.
   */
  getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  /**
   * Get current trial index.
   */
  getCurrentTrialIndex(): number {
    return this.currentTrialIndex;
  }

  /**
   * Get all emitted events.
   */
  getEmittedEvents(): readonly InteractiveReplayEvent[] {
    return this.emittedEvents;
  }

  /**
   * Check if a modality has been responded to for the current trial.
   * Includes both auto-played hits and user responses.
   */
  hasRespondedForModality(modality: ModalityId): boolean {
    const trialState = this.trialStates.get(this.currentTrialIndex);
    if (!trialState) return false;

    return trialState.parentResponses.has(modality) || trialState.userResponses.has(modality);
  }

  /**
   * Check if a modality was a false alarm in the parent run.
   */
  wasParentFalseAlarm(modality: ModalityId): boolean {
    const trialState = this.trialStates.get(this.currentTrialIndex);
    if (!trialState) return false;

    return trialState.parentFalseAlarms.has(modality);
  }

  /**
   * Get trial state for a specific trial index.
   */
  getTrialState(trialIndex: number): TrialState | undefined {
    return this.trialStates.get(trialIndex);
  }

  /**
   * Get the session type this engine is handling.
   */
  getSessionType(): ReplaySessionType {
    return this.sessionType;
  }

  /**
   * Check if replay is finished.
   */
  isFinished(): boolean {
    return this.parentEventIndex >= this.parentEvents.length;
  }

  /**
   * Seek to a specific time position.
   * Fast-forwards through parent events without emitting them.
   * Used for recovery to restore engine state.
   *
   * @param targetTimeMs - Target time in milliseconds (relative to session start)
   */
  seekTo(targetTimeMs: number): void {
    // Process all parent events up to targetTimeMs
    while (this.parentEventIndex < this.parentEvents.length) {
      const event = this.parentEvents[this.parentEventIndex];
      if (!event) break;

      const eventTime = event.timestamp - this.sessionStartMs;

      // Stop if we've passed the target time
      if (eventTime > targetTimeMs) break;

      // Update current trial index for TRIAL_PRESENTED
      if (event.type === 'TRIAL_PRESENTED') {
        const trialEvent = event as TrialPresentedEvent;
        this.currentTrialIndex = trialEvent.trial.index;
      }

      this.parentEventIndex++;
    }

    this.currentTimeMs = targetTimeMs;
  }

  /**
   * Restore emitted events from recovery.
   * Used to restore user responses that were already made before interruption.
   *
   * @param events - Events to restore (from DB)
   */
  restoreEmittedEvents(events: readonly ReplayEventInput[]): void {
    // Convert ReplayEventInput to InteractiveReplayEvent
    for (const e of events) {
      // Find the origin event if originEventId is provided
      let originEvent: GameEvent | null = null;
      if (e.originEventId) {
        originEvent = this.parentEvents.find((pe) => pe.id === e.originEventId) ?? null;
      }

      const replayEvent: InteractiveReplayEvent = {
        originEvent,
        actor: e.actor,
        skipped: e.skipped,
        skipReason: e.skipReason,
        type: e.type,
        timestamp: e.timestamp,
        payload: e.payload,
      };

      this.emittedEvents.push(replayEvent);

      // Also restore user responses to trial states
      if (e.actor === 'user' && e.type === 'USER_RESPONDED') {
        const payload = e.payload as { trialIndex?: number; modality?: ModalityId };
        if (payload.trialIndex !== undefined && payload.modality) {
          const trialState = this.trialStates.get(payload.trialIndex);
          if (trialState) {
            trialState.userResponses.add(payload.modality);
          }
        }
      }
    }
  }

  /**
   * Get the last emitted event (for incremental persistence).
   */
  getLastEmittedEvent(): InteractiveReplayEvent | null {
    return this.emittedEvents[this.emittedEvents.length - 1] ?? null;
  }

  // ===========================================================================
  // Flow/DualPick Mode: Placement Corrections
  // ===========================================================================

  /**
   * Handle a Flow drop correction (tap proposal → tap slot).
   *
   * @param proposalId - ID of the proposal being placed
   * @param proposalType - Type of proposal ('position' | 'audio' | 'unified')
   * @param proposalValue - Value of the proposal (position number or sound letter)
   * @param targetSlot - Target slot index (0 = N, 1 = N-1, etc.)
   * @returns The created event if valid, null if invalid
   */
  handleFlowDrop(
    proposalId: string,
    proposalType: 'position' | 'audio' | 'unified',
    proposalValue: number | string,
    targetSlot: number,
  ): InteractiveReplayEvent | null {
    if (this.sessionType !== 'flow') return null;

    const event: InteractiveReplayEvent = {
      originEvent: null,
      actor: 'user',
      skipped: false,
      skipReason: null,
      type: 'FLOW_DROP_ATTEMPTED',
      timestamp: this.currentTimeMs,
      payload: {
        trialIndex: this.currentTrialIndex,
        proposalId,
        proposalType,
        proposalValue,
        targetSlot,
        isCorrection: true,
      },
    };

    this.emittedEvents.push(event);
    return event;
  }

  /**
   * Handle a Recall pick correction.
   *
   * @param slotIndex - Slot index (1 = N-1, 2 = N-2, etc.)
   * @param modality - 'position' or 'audio'
   * @param value - Position number or sound letter
   * @returns The created event if valid, null if invalid
   */
  handleRecallPick(
    slotIndex: number,
    modality: 'position' | 'audio',
    value: number | string,
  ): InteractiveReplayEvent | null {
    if (this.sessionType !== 'recall') return null;

    const event: InteractiveReplayEvent = {
      originEvent: null,
      actor: 'user',
      skipped: false,
      skipReason: null,
      type: 'RECALL_PICKED',
      timestamp: this.currentTimeMs,
      payload: {
        trialIndex: this.currentTrialIndex,
        slotIndex,
        modality,
        value,
        isCorrection: true,
      },
    };

    this.emittedEvents.push(event);
    return event;
  }

  /**
   * Handle a DualPick drop correction (tap label → tap slot).
   *
   * @param proposalId - ID of the label proposal
   * @param label - The label value (e.g., 'Match', 'Mismatch')
   * @param targetSlot - Target slot index
   * @returns The created event if valid, null if invalid
   */
  handleDualPickDrop(
    proposalId: string,
    label: string,
    targetSlot: number,
  ): InteractiveReplayEvent | null {
    if (this.sessionType !== 'dual-pick') return null;

    const event: InteractiveReplayEvent = {
      originEvent: null,
      actor: 'user',
      skipped: false,
      skipReason: null,
      type: 'DUAL_PICK_DROP_ATTEMPTED',
      timestamp: this.currentTimeMs,
      payload: {
        trialIndex: this.currentTrialIndex,
        proposalId,
        label,
        targetSlot,
        isCorrection: true,
      },
    };

    this.emittedEvents.push(event);
    return event;
  }
}
