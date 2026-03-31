/**
 * TraceSessionXState - XState-based wrapper class
 *
 * Encapsulates the XState machine for robust lifecycle management.
 * Follows the same pattern as GameSessionXState for consistency.
 *
 * Key features:
 * - Stable session reference (no recreation on re-renders)
 * - Typed event dispatch methods
 * - Subscription pattern for state changes
 * - Flash off logic moved from React useEffect
 * - Proper cleanup on stop()
 */

import { createActor, type ActorRefFrom } from 'xstate';
import { generateId } from '../domain';
import type { AudioPort } from '../ports';
import type { GameEvent } from '../engine/events';
import type { CommandBusPort } from '../ports/command-bus-port';
import {
  traceSessionMachine,
  type TraceSessionInput,
  type TraceSessionEvent,
  type TraceSessionContext,
  type TracePhase,
  getEnabledModalities,
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedColor,
  getExpectedImage,
  getExpectedDigit,
  getExpectedEmotion,
  getExpectedWord,
  getExpectedTone,
  getExpectedSpatialDirection,
  getNBackActiveModalities,
} from './machine';
import type {
  TraceTrial,
  TraceSessionSummary,
  TraceModality,
  TraceWritingResult,
  TraceRunningStats,
  TraceModalityResult,
} from '../types/trace';

// =============================================================================
// Types
// =============================================================================

export type TraceSessionPhase = TracePhase;

export interface TraceSessionSnapshot {
  phase: TraceSessionPhase;
  trialIndex: number;
  totalTrials: number;
  stimulus: TraceTrial | null;
  feedbackPosition: number | null;
  feedbackType: 'correct' | 'incorrect' | null;
  feedbackFromUserAction: boolean;
  stats: TraceRunningStats;
  nLevel: number;
  rhythmMode: 'self-paced' | 'timed';
  isWarmup: boolean;
  expectedPosition: number | null;
  expectedSound: string | null;
  expectedColor: string | null;
  expectedImage: string | null;
  expectedDigit: string | null;
  expectedEmotion: string | null;
  expectedWord: string | null;
  expectedTone: string | null;
  expectedSpatialDirection: string | null;
  isPaused: boolean;
  isWriting: boolean;
  writingResult: TraceWritingResult | null;
  summary: TraceSessionSummary | null;
  dynamicRules: boolean;
  activeModalities: readonly TraceModality[] | null;
  nBackActiveModalities: readonly string[] | null;
  enabledModalities: readonly TraceModality[];
  lastModalityResults: Readonly<Record<TraceModality, TraceModalityResult>> | null;
  ruleVisible: boolean;
  /** Flash off state for same-position repeat visual feedback */
  flashOff: boolean;
  /** Whether sequential trace mode is active */
  isSequentialTrace: boolean;
  /** Current sequential swipe step (0 = first) */
  sequentialStepIndex: number;
  /** Total sequential swipe steps = nLevel */
  sequentialStepCount: number;
  /** Per-step results for feedback display */
  sequentialStepResults: ReadonlyArray<{
    readonly fromPosition: number;
    readonly toPosition: number;
    readonly expectedFromPosition: number;
    readonly expectedToPosition: number;
    /** Expected positions in gesture space (after dyslat mirror transform) */
    readonly expectedFromGesture: number;
    readonly expectedToGesture: number;
    /** Per-endpoint correctness (case-by-case feedback) */
    readonly fromCorrect: boolean;
    readonly toCorrect: boolean;
    readonly isCorrect: boolean;
  }>;
  /** Current sequential writing step (0 = oldest T-N) */
  writingStepIndex: number;
}

export type TraceSessionListener = (snapshot: TraceSessionSnapshot) => void;

export interface TraceSessionDeps {
  audio: AudioPort;
}

// =============================================================================
// TraceSessionXState Class
// =============================================================================

export class TraceSessionXState {
  // Identity
  readonly sessionId: string;

  // Dependencies
  private readonly audio: AudioPort;
  private readonly commandBus?: CommandBusPort;

  // XState Actor
  private actor: ActorRefFrom<typeof traceSessionMachine>;
  private running = false;

  // Subscribers
  private listeners = new Set<TraceSessionListener>();
  private cachedSnapshot: TraceSessionSnapshot;

  // Final events cache (for idempotent onFinished callback)
  private finalEvents: readonly GameEvent[] | null = null;

  // Public callback — called exactly once when the machine reaches 'finished'
  onFinished?: (summary: TraceSessionSummary | null, events: readonly GameEvent[]) => void;

  // Flash state tracking (moved from React useState)
  private flashOffState = false;
  private flashOffTimer: ReturnType<typeof setTimeout> | null = null;
  private prevPosition: number | null = null;

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(input: TraceSessionInput, deps: TraceSessionDeps) {
    this.sessionId = input.sessionId ?? generateId();
    this.audio = deps.audio;
    this.commandBus = (input as unknown as { commandBus?: CommandBusPort }).commandBus;

    // Create XState actor
    this.actor = createActor(traceSessionMachine, {
      input: {
        ...input,
        sessionId: this.sessionId,
      },
    });

    // Subscribe to actor state changes
    this.actor.subscribe((state) => {
      // Handle flash off logic (same position repeat)
      this.updateFlashOffState(state.context);

      // Map to snapshot
      this.cachedSnapshot = this.mapToSnapshot(state);

      // Notify listeners
      this.notifyListeners();

      // Persist events
      this.persistNewEvents(state.context);

      // Fire onFinished callback exactly once
      if (state.value === 'finished' && !this.finalEvents) {
        const events = [...state.context.sessionEvents];
        this.finalEvents = events;
        this.onFinished?.(state.context.summary, events);
      }
    });

    // Initial snapshot
    this.cachedSnapshot = this.mapToSnapshot(this.actor.getSnapshot());
  }

  // =============================================================================
  // Public API
  // =============================================================================

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start the actor
    this.actor.start();

    // Send START event
    this.actor.send({ type: 'START' });
  }

  stop(): void {
    // Clear flash timer
    if (this.flashOffTimer) {
      clearTimeout(this.flashOffTimer);
      this.flashOffTimer = null;
    }

    this.audio.stopAll();

    if (!this.running) return;
    this.running = false;

    this.actor.send({ type: 'STOP' });
    this.actor.stop();
  }

  pause(): void {
    if (!this.running) return;
    this.actor.send({ type: 'PAUSE' });
  }

  resume(): void {
    if (!this.running) return;
    this.actor.send({ type: 'RESUME' });
  }

  // =============================================================================
  // Response Events
  // =============================================================================

  swipe(
    fromPosition: number,
    toPosition: number,
    inputMethod?: 'mouse' | 'touch' | 'keyboard',
  ): void {
    if (!this.running) return;
    this.actor.send({ type: 'SWIPE', fromPosition, toPosition, inputMethod });
  }

  doubleTap(position: number, inputMethod?: 'mouse' | 'touch' | 'keyboard'): void {
    if (!this.running) return;
    this.actor.send({ type: 'DOUBLE_TAP', position, inputMethod });
  }

  centerTap(inputMethod?: 'mouse' | 'touch' | 'keyboard'): void {
    if (!this.running) return;
    this.actor.send({ type: 'CENTER_TAP', inputMethod });
  }

  skip(): void {
    if (!this.running) return;
    this.actor.send({ type: 'SKIP' });
  }

  submitWriting(result: TraceWritingResult): void {
    if (!this.running) return;
    this.actor.send({ type: 'WRITING_COMPLETE', result });
  }

  // =============================================================================
  // Generic send for any event
  // =============================================================================

  send(event: TraceSessionEvent): void {
    this.actor.send(event);
  }

  // =============================================================================
  // Subscription
  // =============================================================================

  subscribe(listener: TraceSessionListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current snapshot
    listener(this.cachedSnapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): TraceSessionSnapshot {
    return this.cachedSnapshot;
  }

  getEvents(): readonly GameEvent[] {
    return this.actor.getSnapshot().context.sessionEvents;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private mapToSnapshot(state: ReturnType<typeof this.actor.getSnapshot>): TraceSessionSnapshot {
    const { context, value } = state;

    // Extract phase from state value
    let phase: TraceSessionPhase;
    if (typeof value === 'string') {
      if (value === 'computing') {
        phase = 'computing';
      } else {
        phase = value as TraceSessionPhase;
      }
    } else if (typeof value === 'object' && 'active' in value) {
      const activeValue = value.active;
      if (typeof activeValue === 'string') {
        if (activeValue.endsWith('Resume')) {
          const basePhase = activeValue.replace('Resume', '');
          phase = basePhase as TraceSessionPhase;
        } else if (activeValue === 'writingStepFeedback') {
          // Sequential per-step feedback: treated as writingFeedback for UI purposes
          phase = 'writingFeedback';
        } else {
          phase = activeValue as TraceSessionPhase;
        }
      } else {
        phase = 'stimulus';
      }
    } else {
      phase = 'idle';
    }

    const enabledModalities = getEnabledModalities(context.spec.extensions);
    const activeModalities = context.currentTrial?.activeModalities ?? null;
    const lastResponse = context.responses[context.responses.length - 1];
    const lastModalityResults = lastResponse?.modalityResults ?? null;

    return {
      phase,
      trialIndex: context.trialIndex,
      totalTrials: context.trials.length,
      stimulus: context.currentTrial,
      feedbackPosition: context.feedbackPosition,
      feedbackType: context.feedbackType,
      feedbackFromUserAction: context.feedbackFromUserAction,
      stats: context.stats,
      nLevel: context.spec.defaults.nLevel,
      rhythmMode: context.spec.extensions.rhythmMode,
      isWarmup: isWarmupTrial(context),
      expectedPosition: getExpectedPosition(context),
      expectedSound: getExpectedSound(context),
      expectedColor: getExpectedColor(context),
      expectedImage: getExpectedImage(context),
      expectedDigit: getExpectedDigit(context),
      expectedEmotion: getExpectedEmotion(context),
      expectedWord: getExpectedWord(context),
      expectedTone: getExpectedTone(context),
      expectedSpatialDirection: getExpectedSpatialDirection(context),
      isPaused: phase === 'paused',
      isWriting: phase === 'writing' || phase === 'writingFeedback',
      writingResult: context.writingResult,
      summary: context.summary,
      dynamicRules: context.spec.extensions.dynamicRules,
      activeModalities,
      nBackActiveModalities: getNBackActiveModalities(context),
      enabledModalities,
      lastModalityResults,
      ruleVisible: context.ruleVisible,
      flashOff: this.flashOffState,
      isSequentialTrace:
        Boolean(context.spec.extensions.sequentialTrace) && !context.plugins.rhythm.isTimed(),
      sequentialStepIndex: context.sequentialStepIndex,
      sequentialStepCount: context.spec.defaults.nLevel,
      sequentialStepResults: context.sequentialStepResults,
      writingStepIndex: context.writingStepIndex,
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.cachedSnapshot);
    }
  }

  // =============================================================================
  // Flash Off Logic (moved from React useEffect)
  // =============================================================================

  private updateFlashOffState(context: TraceSessionContext): void {
    const currentPos = context.currentTrial?.position ?? null;
    const phase = this.getPhaseFromContext();

    // Clear any existing timer
    if (this.flashOffTimer) {
      clearTimeout(this.flashOffTimer);
      this.flashOffTimer = null;
    }

    // Check for same-position repeat during stimulus phase
    if (phase === 'stimulus' && currentPos !== null && this.prevPosition === currentPos) {
      // Same position - flash off then on
      this.flashOffState = true;
      this.flashOffTimer = setTimeout(() => {
        this.flashOffState = false;
        // Update cached snapshot and notify
        this.cachedSnapshot = { ...this.cachedSnapshot, flashOff: false };
        this.notifyListeners();
      }, 80); // TIMING_FLASH_OFF_MS
    } else {
      // Different position or not in stimulus - reset flash
      this.flashOffState = false;
    }

    this.prevPosition = currentPos;
  }

  private getPhaseFromContext(): TraceSessionPhase {
    const value = this.actor.getSnapshot().value;
    if (typeof value === 'string') {
      return value as TraceSessionPhase;
    }
    if (typeof value === 'object' && 'active' in value) {
      const activeValue = value.active;
      if (typeof activeValue === 'string') {
        if (activeValue.endsWith('Resume')) {
          return activeValue.replace('Resume', '') as TraceSessionPhase;
        }
        return activeValue as TraceSessionPhase;
      }
    }
    return 'idle';
  }

  // =============================================================================
  // Event Persistence
  // =============================================================================

  private persistedEventIds = new Set<string>();
  private pendingPersistence: Promise<void>[] = [];

  private persistNewEvents(context: TraceSessionContext): void {
    for (const event of context.sessionEvents) {
      if (!this.persistedEventIds.has(event.id)) {
        this.persistEvent(event);
        this.persistedEventIds.add(event.id);
      }
    }
  }

  /**
   * Persist event with proper handling for critical events.
   * TRACE_SESSION_STARTED/TRACE_SESSION_ENDED events use async persistence to prevent data loss.
   */
  private persistEvent(event: GameEvent): void {
    if (this.commandBus) {
      const cmdId =
        event.type === 'TRACE_SESSION_ENDED'
          ? `end:${this.sessionId}`
          : event.type === 'TRACE_SESSION_STARTED'
            ? `start:${this.sessionId}`
            : `evt:${event.id}`;
      const commandType =
        event.type === 'TRACE_SESSION_STARTED'
          ? 'SESSION/START'
          : event.type === 'TRACE_SESSION_ENDED'
            ? 'SESSION/END'
            : event.type.startsWith('TRACE_')
              ? 'SESSION/RECORD_TRIAL'
              : 'SESSION/RECORD_TELEMETRY';
      const promise = this.commandBus
        .handle({
          type: commandType,
          data: {
            sessionId: this.sessionId,
            event,
            workflow:
              event.type === 'TRACE_SESSION_ENDED'
                ? {
                    completionInput: {
                      mode: 'trace',
                      sessionId: this.sessionId,
                      events: this.actor.getSnapshot().context.sessionEvents,
                      summary: this.actor.getSnapshot().context.summary,
                      activeModalities:
                        this.actor.getSnapshot().context.currentTrial?.activeModalities ?? [],
                      confidenceScore: undefined,
                    },
                  }
                : undefined,
          },
          metadata: { commandId: cmdId, timestamp: new Date() },
        })
        .catch((err) => {
          console.error('[TraceSessionXState] Command bus persist failed:', err);
        }) as Promise<void>;

      if (event.type === 'TRACE_SESSION_ENDED' || event.type === 'TRACE_SESSION_STARTED') {
        this.pendingPersistence.push(promise);
      }
      return;
    }

    if (event.type.endsWith('_STARTED') || event.type.endsWith('_ENDED')) {
      console.warn(
        `[TraceSessionXState] commandBus missing; running in-memory only for ${event.type} (session=${this.sessionId})`,
      );
    }
  }

  /**
   * Ensures all critical events are fully persisted before returning.
   * Call this before navigating away from the session page.
   */
  async ensureEventsPersisted(): Promise<void> {
    if (this.pendingPersistence.length > 0) {
      console.log(
        `[TraceSessionXState] Waiting for ${this.pendingPersistence.length} pending persistence operations...`,
      );
      await Promise.all(this.pendingPersistence);
      this.pendingPersistence = [];
      console.log('[TraceSessionXState] All events persisted');
    }
  }

  /**
   * Stop the session and wait for all events to be persisted.
   * Use this when you need to guarantee TRACE_SESSION_ENDED is written before navigation.
   */
  async stopAsync(): Promise<void> {
    this.stop();
    await this.ensureEventsPersisted();
  }
}
