/**
 * GameSessionXState - XState-based implementation
 *
 * Drop-in replacement for GameSession using XState for state management.
 * Maintains the same public API for backward compatibility.
 *
 * Key differences from the State Pattern version:
 * - State transitions handled by XState machine
 * - TimerPort-driven timing (no setTimeout drift)
 * - AudioContext-based synchronization
 */

import { createActor, type ActorRefFrom } from 'xstate';
import type { ModalityId } from '../domain';
import { type GameConfig, generateId } from '../domain';
import type { ModeSpec } from '../specs/types';
import { TIMING_SESSION_PREP_MS } from '../specs/thresholds';
import type { GameEvent, SessionSummary } from '../engine';
import type { JourneyStrategyConfig } from '../types/journey';
import { SessionProjector } from '../engine';
import type { TrialGenerator } from '../coach/trial-generator';
import { PreGeneratedTrialGenerator } from '../coach/pre-generated-trial-generator';
import { SequenceTrialGenerator } from '../coach/sequence-trial-generator';
import { RunningStatsCalculator } from '../coach/running-stats';
import {
  createAdaptiveControllerAlgorithm,
  createMetaLearningAlgorithm,
  createJitterAdaptiveAlgorithm,
  type AdaptationMode,
} from '../sequence';
import type {
  AlgorithmStatePort,
  AudioPort,
  CursorPositionPort,
  CommandBusPort,
  DevLoggerPort,
  PlatformLifecycleSource,
  XPContextPort,
} from '../ports';
import { nullDevLogger } from '../ports';
import { SeededRandom } from '../domain';
import { createTimer, type TimerPort } from '../timing';
import { createJudge, type TrialJudge } from '../judge';
import {
  type GameIntention,
  type IntentHandler,
  type IntentResult,
  accepted,
  ignored,
  isSessionControlIntention,
  isTempoIntention,
  isArithmeticInputIntention,
  isCoachingIntention,
} from '../input';
import { gameSessionMachine, type GameSessionInput, createDefaultGamePlugins } from './machine';
import type {
  SessionSnapshot,
  SessionListener,
  AlgorithmId,
  FeedbackConfig,
  GameSessionDeps,
} from './game-session-types';

// =============================================================================
// GameSessionXState Class
// =============================================================================

export class GameSessionXState implements IntentHandler {
  private static readonly PERSIST_BATCH_MAX_EVENTS = 12;
  private static readonly PERSIST_BATCH_MAX_DELAY_MS = 32;
  private static readonly SLOW_PLATFORM_PERSIST_BATCH_MAX_EVENTS = 24;
  private static readonly SLOW_PLATFORM_PERSIST_BATCH_MAX_DELAY_MS = 5000;

  // Identity
  readonly sessionId: string;

  // Dependencies
  private readonly userId: string;
  private readonly config: GameConfig;
  private readonly audio: AudioPort;
  private readonly timer: TimerPort;
  private readonly judge: TrialJudge;
  private readonly devLogger: DevLoggerPort;
  private readonly spec: ModeSpec;
  private readonly journeyStageId?: number;
  private readonly journeyId?: string;
  private readonly journeyStartLevel?: number;
  private readonly journeyTargetLevel?: number;
  private readonly journeyGameMode?: string;
  private readonly journeyName?: string;
  private readonly journeyStrategyConfig?: JourneyStrategyConfig;
  private readonly initialStrikes: number;
  private readonly algorithmId: AlgorithmId;
  private readonly algorithmStatePort?: AlgorithmStatePort;
  // Legacy eventStore path removed in strict command-bus mode.
  private readonly commandBus?: CommandBusPort;
  private readonly feedbackConfig?: FeedbackConfig;
  private readonly xpContextPort?: XPContextPort;
  private readonly cursorPositionPort?: CursorPositionPort;
  private readonly trialsSeed: string;
  private readonly useAudioDrivenVisualSync: boolean;
  private readonly platformLifecycleSource?: PlatformLifecycleSource;

  // Services
  private generator: TrialGenerator;
  private statsCalculator: RunningStatsCalculator;

  // XState Actor
  private actor: ActorRefFrom<typeof gameSessionMachine>;
  private running = false;

  // Subscribers
  private listeners = new Set<SessionListener>();
  private cachedSnapshot: SessionSnapshot;
  // Track current stream version for Emmett event sourcing
  private currentStreamVersion = 0;

  // Energy level (set before start, consumed by adaptive algorithms)
  private _declaredEnergyLevel: 1 | 2 | 3 | null = null;

  // =============================================================================
  // Constructor
  // =============================================================================

  // Recovery mode flag
  private readonly isRecoveryMode: boolean;

  constructor(userId: string, config: GameConfig, deps: GameSessionDeps) {
    // Use recovered sessionId if in recovery mode, otherwise generate new
    this.isRecoveryMode = deps.recoveryState !== undefined;
    this.sessionId = deps.recoveryState?.sessionId ?? generateId();
    this.userId = userId;
    this.config = config;
    this.audio = deps.audio;
    this.devLogger = deps.devLogger ?? nullDevLogger;
    this.spec = deps.spec;
    this.journeyStageId = deps.journeyStageId;
    this.journeyId = deps.journeyId;
    this.journeyStartLevel = deps.journeyStartLevel;
    this.journeyTargetLevel = deps.journeyTargetLevel;
    this.journeyGameMode = deps.journeyGameMode;
    this.journeyName = deps.journeyName;
    this.journeyStrategyConfig = deps.journeyStrategyConfig;
    this.initialStrikes = deps.initialStrikes ?? 0;
    this.algorithmId = deps.algorithmId ?? 'adaptive';
    this.algorithmStatePort = deps.algorithmStatePort;
    this.commandBus = deps.commandBus;
    this.feedbackConfig = deps.feedbackConfig;
    this.xpContextPort = deps.xpContextPort;
    this.cursorPositionPort = deps.cursorPositionPort;
    this.platformLifecycleSource = deps.platformLifecycleSource;
    // Audio-driven visual sync (for sync presets)
    this.useAudioDrivenVisualSync = deps.useAudioDrivenVisualSync ?? false;
    // CRITICAL: Use recovered seed to regenerate the same sequence, otherwise generate new
    this.trialsSeed = deps.recoveryState?.trialsSeed ?? generateId();

    // Create timer from spec (spec is now required)
    this.timer = createTimer(this.spec, deps.audio);

    // Create judge from spec
    this.judge = createJudge(this.spec);

    // Create generator and stats calculator
    this.generator = this.createGenerator(config, this.getEffectiveSequenceMode());
    // Use generator.getTotalTrials() to include warmup buffer trials
    this.statsCalculator = new RunningStatsCalculator(
      config.activeModalities,
      this.generator.getTotalTrials(),
    );

    // Create XState actor
    const input: GameSessionInput = {
      sessionId: this.sessionId,
      userId: this.userId,
      config: this.config,
      audio: this.audio,
      timer: this.timer,
      generator: this.generator,
      statsCalculator: this.statsCalculator,
      judge: this.judge,
      spec: this.spec,
      playMode: deps.playMode,
      initialStrikes: this.initialStrikes,
      journeyStageId: this.journeyStageId,
      journeyId: this.journeyId,
      journeyStartLevel: this.journeyStartLevel,
      journeyTargetLevel: this.journeyTargetLevel,
      journeyGameMode: this.journeyGameMode,
      journeyName: this.journeyName,
      journeyStrategyConfig: this.journeyStrategyConfig,
      trialsSeed: this.trialsSeed,
      algorithmStatePort: this.algorithmStatePort,
      feedbackConfig: this.feedbackConfig,
      xpContextPort: this.xpContextPort,
      cursorPositionPort: this.cursorPositionPort,
      platformInfoPort: deps.platformInfoPort,
      // Recovery mode: pass recovered state to machine
      recoveryState: deps.recoveryState
        ? {
            lastTrialIndex: deps.recoveryState.lastTrialIndex,
            trialHistory: deps.recoveryState.trialHistory,
            responses: deps.recoveryState.responses,
            startTimestamp: deps.recoveryState.startTimestamp,
            // CRITICAL: Include existing events for accurate session report
            existingEvents: deps.recoveryState.existingEvents,
          }
        : undefined,
      // Create plugins from spec and config
      plugins: createDefaultGamePlugins({
        spec: this.spec,
        activeModalities: this.config.activeModalities,
        feedbackConfig: this.feedbackConfig,
      }),
      // Audio-visual sync: callback to trigger visual display from audio callback
      // Captures `this.actor` by reference - safe because callback is only called after actor starts
      onVisualTrigger: () => {
        const firedAtMs = performance.now();
        deps.onVisualTriggerImmediate?.(firedAtMs);
        this.actor.send({ type: 'VISUAL_TRIGGER', firedAtMs });
      },
      onVisualHideTrigger: () => {
        const firedAtMs = performance.now();
        deps.onVisualHideImmediate?.(firedAtMs);
        this.actor.send({ type: 'VISUAL_HIDE_TRIGGER', firedAtMs });
      },
      onAudioSync: () => {
        const firedAtMs = performance.now();
        this.actor.send({ type: 'AUDIO_SYNC', firedAtMs });
      },
      // BETA: Audio-driven visual sync - hide visual when audio actually ends
      useAudioDrivenVisualSync: this.useAudioDrivenVisualSync,
      onAudioEnded: this.useAudioDrivenVisualSync
        ? () => {
            const firedAtMs = performance.now();
            deps.onAudioEndedImmediate?.(firedAtMs);
            this.actor.send({ type: 'AUDIO_ENDED', firedAtMs });
          }
        : undefined,
    };

    this.actor = createActor(gameSessionMachine, { input });

    // Subscribe to actor state changes
    this.actor.subscribe((state) => {
      const subscribeStart = performance.now();

      const snapshotStart = performance.now();
      const nextSnapshot = this.mapToSessionSnapshot(state);
      const snapshotDuration = performance.now() - snapshotStart;

      if (snapshotDuration > 50) {
        const stateValue =
          typeof state.value === 'string' ? state.value : JSON.stringify(state.value);
        console.warn(
          `[GameSessionXState] mapToSessionSnapshot took ${snapshotDuration.toFixed(0)}ms in state ${stateValue}`,
        );
      }

      const notifyStart = performance.now();
      if (!this.areSnapshotsEqual(this.cachedSnapshot, nextSnapshot)) {
        this.cachedSnapshot = nextSnapshot;
        this.notifyListeners();
      }
      const notifyDuration = performance.now() - notifyStart;

      if (notifyDuration > 50) {
        console.warn(
          `[GameSessionXState] notifyListeners took ${notifyDuration.toFixed(0)}ms (${this.listeners.size} listeners)`,
        );
      }

      // Keep persistence off the render/input-critical callstack.
      this.enqueueEventsForPersistence(state.context.sessionEvents);

      const totalDuration = performance.now() - subscribeStart;
      if (totalDuration > 100) {
        const stateValue =
          typeof state.value === 'string' ? state.value : JSON.stringify(state.value);
        console.warn(
          `[GameSessionXState] subscription callback took ${totalDuration.toFixed(0)}ms total in state ${stateValue}`,
        );
      }

      // Cache final events when session ends (defensive: ensures getEvents() returns complete data)
      if (state.value === 'finished' && !this.finalEvents) {
        this.finalEvents = [...state.context.sessionEvents];
        this.onFinished?.(state.context.finalSummary, this.finalEvents);
      }
    });

    // Initial snapshot - use actor's initial context (includes recovery state if present)
    // This ensures the UI shows correct trialIndex before start() is called
    this.cachedSnapshot = this.mapToSessionSnapshot(this.actor.getSnapshot());

    // Mark existing events (from recovery) as already persisted to avoid duplicates
    // These events were loaded from SQLite and should not be re-persisted
    if (deps.recoveryState?.existingEvents) {
      for (const event of deps.recoveryState.existingEvents) {
        this.persistedEventIds.add(event.id);
      }
      // Use stream version from recovery state if provided (authoritative from emt_streams)
      // Otherwise fall back to event count (may be inaccurate if projection is filtered)
      this.currentStreamVersion =
        deps.recoveryState.streamVersion ?? deps.recoveryState.existingEvents.length;
      this.lastObservedEventCount = deps.recoveryState.existingEvents.length;
    }
  }

  private static isSlowPersistPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent ?? '';
    const isSafari = /Safari/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS)/i.test(ua);
    const isMobile = /Mobile|iPhone|iPad|iPod/i.test(ua);
    return isSafari && isMobile;
  }

  private static getPersistBatchMaxEvents(): number {
    return GameSessionXState.isSlowPersistPlatform()
      ? GameSessionXState.SLOW_PLATFORM_PERSIST_BATCH_MAX_EVENTS
      : GameSessionXState.PERSIST_BATCH_MAX_EVENTS;
  }

  private static getPersistBatchMaxDelayMs(): number {
    return GameSessionXState.isSlowPersistPlatform()
      ? GameSessionXState.SLOW_PLATFORM_PERSIST_BATCH_MAX_DELAY_MS
      : GameSessionXState.PERSIST_BATCH_MAX_DELAY_MS;
  }

  private persistedEventIds = new Set<string>();
  private persistingEventIds = new Set<string>();
  private persistenceChain: Promise<void> = Promise.resolve();
  private pendingPersistenceCount = 0;
  private pendingBatchedEvents: GameEvent[] = [];
  private batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastObservedEventCount = 0;
  private finalEvents: GameEvent[] | null = null; // Cached after actor.stop()

  /** Called exactly once when the session reaches the 'finished' state. */
  onFinished?: (summary: SessionSummary | null, events: readonly GameEvent[]) => void;

  private areSnapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
    return (
      a.phase === b.phase &&
      a.trial === b.trial &&
      a.trialIndex === b.trialIndex &&
      a.totalTrials === b.totalTrials &&
      a.isi === b.isi &&
      a.prepDelayMs === b.prepDelayMs &&
      a.message === b.message &&
      a.dPrime === b.dPrime &&
      a.summary === b.summary &&
      a.trialHistory === b.trialHistory &&
      a.nLevel === b.nLevel &&
      a.adaptiveZone === b.adaptiveZone &&
      a.xpBreakdown === b.xpBreakdown &&
      a.stimulusVisible === b.stimulusVisible &&
      a.stimulusDurationMs === b.stimulusDurationMs &&
      a.audioSyncCallbackAtMs === b.audioSyncCallbackAtMs &&
      a.audioEndedCallbackAtMs === b.audioEndedCallbackAtMs &&
      a.visualTriggerCallbackAtMs === b.visualTriggerCallbackAtMs &&
      a.visualHideCallbackAtMs === b.visualHideCallbackAtMs &&
      a.arithmeticInput?.raw === b.arithmeticInput?.raw &&
      a.arithmeticInput?.display === b.arithmeticInput?.display &&
      a.arithmeticInput?.negative === b.arithmeticInput?.negative &&
      a.arithmeticInput?.decimal === b.arithmeticInput?.decimal
    );
  }

  private isEventPersisted(event: GameEvent): boolean {
    return this.persistedEventIds.has(event.id);
  }

  private isEventPersisting(event: GameEvent): boolean {
    return this.persistingEventIds.has(event.id);
  }

  private markEventPersisted(event: GameEvent): void {
    this.persistedEventIds.add(event.id);
  }

  private enqueuePersistenceOperation(operation: () => Promise<void>): Promise<void> {
    this.pendingPersistenceCount += 1;
    const promise = this.persistenceChain.then(operation, operation);
    this.persistenceChain = promise.catch(() => {});
    return promise.finally(() => {
      this.pendingPersistenceCount = Math.max(0, this.pendingPersistenceCount - 1);
    });
  }

  private clearScheduledBatchFlush(): void {
    if (this.batchFlushTimer !== null) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }
  }

  private scheduleBatchedEventsFlush(): void {
    if (this.batchFlushTimer !== null || this.pendingBatchedEvents.length === 0) {
      return;
    }

    this.batchFlushTimer = setTimeout(() => {
      this.batchFlushTimer = null;
      this.flushPendingEventBatch();
    }, GameSessionXState.getPersistBatchMaxDelayMs());
  }

  private isImmediatePersistEvent(event: GameEvent): boolean {
    return (
      event.type === 'SESSION_STARTED' ||
      event.type === 'SESSION_RESUMED' ||
      event.type === 'SESSION_ENDED'
    );
  }

  private flushPendingEventBatch(): Promise<void> {
    this.clearScheduledBatchFlush();
    if (this.pendingBatchedEvents.length === 0) {
      return this.persistenceChain;
    }

    const batch = this.pendingBatchedEvents.splice(0, this.pendingBatchedEvents.length);
    const batchCommandId = `batch:${this.sessionId}:${batch[0]?.id ?? 'none'}:${batch.at(-1)?.id ?? 'none'}:${batch.length}`;
    const capturedVersion = this.currentStreamVersion;
    this.currentStreamVersion += batch.length;

    return this.enqueuePersistenceOperation(async () => {
      const commandBus = this.commandBus;
      if (!commandBus) {
        for (const event of batch) {
          this.persistingEventIds.delete(event.id);
        }
        return;
      }

      await commandBus
        .handle({
          type: 'SESSION/RECORD_EVENTS_BATCH',
          data: {
            sessionId: this.sessionId,
            expectedVersion: capturedVersion,
            events: batch,
          },
          metadata: { commandId: batchCommandId, timestamp: new Date() },
        })
        .then(() => {
          for (const event of batch) {
            this.markEventPersisted(event);
          }
        })
        .catch((err) => {
          console.error('[GameSessionXState] Command bus batch persist failed:', err);
          this.pendingBatchedEvents.unshift(...batch);
          this.scheduleBatchedEventsFlush();
        })
        .finally(() => {
          for (const event of batch) {
            this.persistingEventIds.delete(event.id);
          }
        });
    });
  }

  /**
   * Ensures all SESSION_ENDED events are fully persisted before returning.
   * Call this before navigating away from the session page.
   */
  async ensureEventsPersisted(): Promise<void> {
    void this.flushPendingEventBatch();

    // Wait for any pending async persistence to complete
    if (this.pendingPersistenceCount > 0) {
      console.log(
        `[GameSessionXState] Waiting for ${this.pendingPersistenceCount} pending persistence operations...`,
      );
      await this.persistenceChain;
      console.log('[GameSessionXState] All events persisted');
    }

    // Double-check: persist any events that might have been missed
    // Use cached finalEvents if actor was stopped, otherwise get from actor
    const events = this.finalEvents ?? this.actor.getSnapshot().context.sessionEvents;
    for (const event of events) {
      if (!this.isEventPersisted(event)) {
        console.warn(
          `[GameSessionXState] Found unpersisted event during ensureEventsPersisted: ${event.type}`,
        );
        if (this.commandBus) {
          // Use same routing as persistEvent (strict command-based).
          this.persistEvent(event);
        } else {
          throw new Error(
            `[GameSessionXState] commandBus is required for ensureEventsPersisted (missing for ${event.type})`,
          );
        }
      }
    }

    void this.flushPendingEventBatch();
    if (this.pendingPersistenceCount > 0) {
      await this.persistenceChain;
    }
  }

  /**
   * Persist event with proper handling for critical events.
   * SESSION_STARTED and SESSION_ENDED events are persisted with await to prevent data loss.
   * SESSION_STARTED is critical for recovery: without it, the session cannot be resumed.
   */
  private persistEvent(event: GameEvent): void {
    // Skip events that were already persisted (recovery mode)
    if (this.persistedEventIds.has(event.id) || this.isEventPersisting(event)) {
      console.debug(
        `[GameSessionXState] Skipping already-persisted event: ${event.type} (id=${event.id})`,
      );
      return;
    }

    if (this.commandBus) {
      const commandBus = this.commandBus;
      // Strict mode: route all writes through the command bus.
      // Command idempotence:
      // - For SESSION_ENDED: use a stable action-level commandId so derived workflow effects can be deduped.
      // - For other events: keep event-id based idempotence.
      const cmdId =
        event.type === 'SESSION_ENDED'
          ? `end:${this.sessionId}`
          : event.type === 'SESSION_STARTED'
            ? `start:${this.sessionId}`
            : `evt:${event.id}`;

      // Skip persistence for internal control flow events (not domain events)
      const skippedEventTypes = new Set([
        'FOCUS_LOST',
        'FOCUS_REGAINED',
        'INPUT_MISFIRED',
        'AUDIO_PLAYBACK_COMPLETE',
        'AUDIO_PLAYBACK_ERROR',
      ]);
      if (skippedEventTypes.has(event.type)) {
        this.markEventPersisted(event); // Mark as "persisted" so we don't try again
        return;
      }

      if (!this.isImmediatePersistEvent(event)) {
        this.persistingEventIds.add(event.id);
        this.pendingBatchedEvents.push(event);
        if (this.pendingBatchedEvents.length >= GameSessionXState.getPersistBatchMaxEvents()) {
          void this.flushPendingEventBatch();
        } else {
          this.scheduleBatchedEventsFlush();
        }
        return;
      }

      void this.flushPendingEventBatch();

      const commandType =
        event.type === 'SESSION_STARTED'
          ? 'SESSION/START'
          : event.type === 'SESSION_ENDED'
            ? 'SESSION/END'
            : event.type.startsWith('TRIAL_')
              ? 'SESSION/RECORD_TRIAL'
              : event.type.includes('RESPON')
                ? 'SESSION/RECORD_RESPONSE'
                : 'SESSION/RECORD_TELEMETRY';
      this.persistingEventIds.add(event.id);
      // Increment stream version eagerly so subsequent events get the correct expected version.
      // enqueueByStream in the command bus serializes writes per stream, so this is safe.
      const capturedVersion = this.currentStreamVersion;
      this.currentStreamVersion += 1;
      void this.enqueuePersistenceOperation(async () => {
        await commandBus
          .handle({
            type: commandType,
            data: {
              sessionId: this.sessionId,
              expectedVersion: capturedVersion,
              event,
              workflow:
                event.type === 'SESSION_ENDED'
                  ? {
                      completionInput: {
                        mode: 'tempo',
                        sessionId: this.sessionId,
                        events: this.actor.getSnapshot().context.sessionEvents,
                        summary: this.actor.getSnapshot().context.finalSummary,
                        activeModalities: this.config.activeModalities,
                        confidenceScore: undefined,
                      },
                    }
                  : undefined,
            },
            metadata: { commandId: cmdId, timestamp: new Date() },
          })
          .then(() => {
            this.markEventPersisted(event);
          })
          .catch((err) => {
            console.error('[GameSessionXState] Command bus persist failed:', err);
          })
          .finally(() => {
            this.persistingEventIds.delete(event.id);
          });
      });
      return;
    }

    // Strict mode expects commandBus, but the UI can start sessions before persistence is ready.
    // In that case we keep the in-memory session running and rely on ensureEventsPersisted once
    // the command bus is available.
    if (event.type.endsWith('_STARTED') || event.type.endsWith('_ENDED')) {
      console.warn(
        `[GameSessionXState] commandBus missing; running in-memory only for ${event.type} (session=${this.sessionId})`,
      );
    }
  }

  // =============================================================================
  // Generator Creation
  // =============================================================================

  private createGenerator(config: GameConfig, sequenceMode?: AdaptationMode): TrialGenerator {
    const rng = new SeededRandom(this.trialsSeed);

    if (config.generator === 'Sequence' && sequenceMode) {
      const algorithm = this.createSequenceAlgorithm(sequenceMode, config);
      return new SequenceTrialGenerator({
        blockConfig: config,
        algorithm,
        totalTrials: config.trialsCount,
        gameMode: sequenceMode,
      });
    }

    // Pass spec.extensions to the generator for BrainWorkshop and other modes
    // that need mode-specific config (variableNBack, crabBackMode, multiStimulus, etc.)
    const configWithExtensions = {
      ...config.toDTO(),
      extensions: this.spec.extensions,
    };

    return new PreGeneratedTrialGenerator(configWithExtensions, rng);
  }

  private createSequenceAlgorithm(mode: AdaptationMode, config: GameConfig) {
    const dualnbackClassicExtensions = this.spec.extensions as
      | {
          readonly adaptiveTargetDPrime?: unknown;
          readonly fixedStimulusDurationMs?: unknown;
        }
      | undefined;

    const fixedStimulusDurationMs =
      this.spec.metadata.id === 'dualnback-classic'
        ? typeof dualnbackClassicExtensions?.fixedStimulusDurationMs === 'number' &&
          Number.isFinite(dualnbackClassicExtensions.fixedStimulusDurationMs) &&
          dualnbackClassicExtensions.fixedStimulusDurationMs > 0
          ? dualnbackClassicExtensions.fixedStimulusDurationMs
          : this.spec.timing.stimulusDurationMs
        : undefined;

    const targetDPrime =
      this.spec.metadata.id === 'dualnback-classic' &&
      typeof dualnbackClassicExtensions?.adaptiveTargetDPrime === 'number' &&
      Number.isFinite(dualnbackClassicExtensions.adaptiveTargetDPrime)
        ? dualnbackClassicExtensions.adaptiveTargetDPrime
        : this.spec.scoring.passThreshold;

    const baseConfig = {
      targetDPrime,
      initialNLevel: config.nLevel,
      mode,
      initialTargetProbability: this.spec.generation.targetProbability,
      initialStimulusDurationMs: this.spec.timing.stimulusDurationMs,
      fixedStimulusDurationMs,
    };

    switch (this.algorithmId) {
      case 'meta-learning':
        return createMetaLearningAlgorithm(baseConfig);
      case 'jitter-adaptive':
        return createJitterAdaptiveAlgorithm(baseConfig);
      default:
        return createAdaptiveControllerAlgorithm(baseConfig);
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================

  declareEnergyLevel(level: 1 | 2 | 3): void {
    this._declaredEnergyLevel = level;
  }

  getDeclaredEnergyLevel(): 1 | 2 | 3 | null {
    return this._declaredEnergyLevel;
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Start the actor
    this.actor.start();

    // Load algorithm state (skip in recovery mode - state already restored)
    if (!this.isRecoveryMode) {
      await this.loadAlgorithmState();
    }

    // Setup focus tracking
    this.setupFocusTracking();

    // Send START or RECOVER event depending on mode
    if (this.isRecoveryMode) {
      this.actor.send({ type: 'RECOVER' });
    } else {
      this.actor.send({ type: 'START' });
    }

    // Wait for SESSION_STARTED to be persisted before allowing gameplay to continue
    // This is critical for recovery: without SESSION_STARTED in SQLite, recovery will fail
    if (this.pendingPersistenceCount > 0) {
      await this.persistenceChain;
    }
  }

  respond(
    modalityId: ModalityId,
    inputMethod?: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot',
    capturedAtMs?: number,
    buttonPosition?: { x: number; y: number },
    telemetryId?: string,
    dispatchCompletedAtMs?: number,
  ): void {
    if (!this.running) return;
    this.actor.send({
      type: 'RESPOND',
      modalityId,
      inputMethod,
      capturedAtMs,
      telemetryId,
      dispatchCompletedAtMs,
      buttonPosition,
    });
  }

  release(modalityId: ModalityId, pressDurationMs: number): void {
    if (!this.running) return;
    this.actor.send({ type: 'RELEASE', modalityId, pressDurationMs });
  }

  reportMisfiredInput(key: string): void {
    // Emit event directly (not part of XState machine)
    // Note: INPUT_MISFIRED only valid during stimulus/waiting/idle phases
    const currentPhase = this.getPhase();
    const misfiredPhase: 'stimulus' | 'waiting' | 'idle' =
      currentPhase === 'stimulus' || currentPhase === 'waiting' ? currentPhase : 'idle';

    const event: GameEvent = {
      type: 'INPUT_MISFIRED',
      schemaVersion: 1,
      id: generateId(),
      sessionId: this.sessionId,
      timestamp: Date.now(),
      key,
      trialIndex: this.actor.getSnapshot().context.currentTrial?.index ?? 0,
      phase: misfiredPhase,
    };
    // Persist through the same strict path as all other events.
    this.persistEvent(event);
  }

  /**
   * Report a health event (freeze or long task) for psychometric data quality tracking.
   * Called by the UI when the freeze watchdog or long task observer detects an issue.
   */
  reportHealthEvent(eventKind: 'freeze' | 'longTask'): void {
    if (!this.running) return;
    // Avoid noisy warnings when the actor already reached a final/stopped state
    // (e.g. freeze watchdog fires just after session end).
    const snapshot = this.actor.getSnapshot() as unknown as { status?: string } | null;
    if (snapshot?.status && snapshot.status !== 'active') return;
    this.actor.send({ type: 'HEALTH_EVENT', eventKind });
  }

  /**
   * Stop the session synchronously. Use for cleanup on unmount.
   * Note: Does not wait for SESSION_ENDED to be persisted.
   * For guaranteed persistence, use stopAsync() or call ensureEventsPersisted() after.
   */
  stop(): void {
    const stopStart = performance.now();
    const shouldLog =
      typeof globalThis !== 'undefined' &&
      (globalThis as unknown as { __NEURODUAL_DEBUG_SESSION_TIMING__?: boolean })
        .__NEURODUAL_DEBUG_SESSION_TIMING__ === true;
    if (shouldLog) {
      console.log('[GameSessionXState] stop() called', {
        running: this.running,
        sessionId: this.sessionId,
      });
    }

    const audioStopStart = performance.now();
    this.audio.stopAll();
    const audioStopDuration = performance.now() - audioStopStart;
    if (audioStopDuration > 50) {
      console.warn(`[GameSessionXState] audio.stopAll took ${audioStopDuration.toFixed(0)}ms`);
    }

    this.cleanupFocusTracking();

    if (!this.running) {
      if (shouldLog) {
        console.log('[GameSessionXState] stop() early return - not running');
      }
      return;
    }
    this.running = false;
    this.clearScheduledBatchFlush();

    const preStopSnapshot = this.actor.getSnapshot() as unknown as { status?: string } | null;
    if (preStopSnapshot?.status === 'active' || preStopSnapshot?.status === undefined) {
      const sendStopStart = performance.now();
      this.actor.send({ type: 'STOP' });
      const sendStopDuration = performance.now() - sendStopStart;
      if (sendStopDuration > 50) {
        console.warn(`[GameSessionXState] actor.send(STOP) took ${sendStopDuration.toFixed(0)}ms`);
      }
    }

    // Save algorithm state
    this.saveAlgorithmState();

    // Get snapshot BEFORE stopping actor (for logging)
    const projectStart = performance.now();
    const snapshot = this.actor.getSnapshot();
    const eventCount = snapshot.context.sessionEvents.length;
    const summary = SessionProjector.project(snapshot.context.sessionEvents);
    const projectDuration = performance.now() - projectStart;
    if (projectDuration > 50) {
      console.warn(
        `[GameSessionXState] SessionProjector.project took ${projectDuration.toFixed(0)}ms for ${eventCount} events`,
      );
    }

    this.devLogger.logSession({
      sessionId: this.sessionId,
      events: snapshot.context.sessionEvents,
      summary,
    });

    // Cache final events BEFORE stopping actor (for ensureEventsPersisted)
    this.finalEvents = [...snapshot.context.sessionEvents];

    // Stop the XState actor to clean up resources (AFTER getting snapshot)
    const actorStopStart = performance.now();
    this.actor.stop();
    const actorStopDuration = performance.now() - actorStopStart;
    if (actorStopDuration > 50) {
      console.warn(`[GameSessionXState] actor.stop() took ${actorStopDuration.toFixed(0)}ms`);
    }

    const totalDuration = performance.now() - stopStart;
    console.log(`[GameSessionXState] stop() completed in ${totalDuration.toFixed(0)}ms`);
  }

  /**
   * Stop the session and wait for all events to be persisted.
   * Use this when you need to guarantee SESSION_ENDED is written before navigation.
   */
  async stopAsync(): Promise<void> {
    this.stop();
    await this.ensureEventsPersisted();
  }

  pause(): void {
    if (!this.running) return;
    this.actor.send({ type: 'PAUSE' });
  }

  resume(): void {
    if (!this.running) return;
    this.actor.send({ type: 'RESUME' });
  }

  isPaused(): boolean {
    return this.actor.getSnapshot().value === 'paused';
  }

  // =============================================================================
  // IntentHandler Implementation
  // =============================================================================

  handleIntent(intention: GameIntention): IntentResult {
    if (isSessionControlIntention(intention)) {
      switch (intention.type) {
        case 'START':
          if (this.running) return ignored('Session already running');
          this.start();
          return accepted();

        case 'STOP':
          if (!this.running) return ignored('Session not running');
          this.stop();
          return accepted();

        case 'PAUSE':
          if (!this.running) return ignored('Session not running');
          if (this.isPaused()) return ignored('Session already paused');
          this.pause();
          return accepted();

        case 'RESUME':
          if (!this.isPaused()) return ignored('Session not paused');
          this.resume();
          return accepted();
      }
    }

    if (isTempoIntention(intention)) {
      switch (intention.type) {
        case 'CLAIM_MATCH': {
          if (!this.running) return ignored('Session not running');
          const inputMethod =
            intention.inputMethod === 'keyboard' ||
            intention.inputMethod === 'mouse' ||
            intention.inputMethod === 'touch' ||
            intention.inputMethod === 'gamepad' ||
            intention.inputMethod === 'bot'
              ? intention.inputMethod
              : 'keyboard';
          this.respond(
            intention.modality,
            inputMethod,
            intention.capturedAtMs,
            intention.buttonPosition,
            intention.telemetryId,
            intention.dispatchCompletedAtMs,
          );
          return accepted();
        }

        case 'RELEASE_CLAIM':
          if (!this.running) return ignored('Session not running');
          this.release(intention.modality, intention.pressDurationMs);
          return accepted();

        case 'REPORT_INPUT_PIPELINE_LATENCY':
          if (!this.running) return ignored('Session not running');
          {
            const inputMethod =
              intention.inputMethod === 'keyboard' ||
              intention.inputMethod === 'mouse' ||
              intention.inputMethod === 'touch' ||
              intention.inputMethod === 'gamepad'
                ? intention.inputMethod
                : 'keyboard';

            this.actor.send({
              type: 'REPORT_INPUT_PIPELINE_LATENCY',
              telemetryId: intention.telemetryId,
              trialIndex: intention.trialIndex,
              modalityId: intention.modality,
              inputMethod,
              phase: intention.phase,
              capturedAtMs: intention.capturedAtMs,
              dispatchCompletedAtMs: intention.dispatchCompletedAtMs,
              commitAtMs: intention.commitAtMs,
              paintAtMs: intention.paintAtMs,
            });
          }
          return accepted();
      }
    }

    if (isArithmeticInputIntention(intention)) {
      if (!this.running) return ignored('Session not running');
      const inputMethod =
        intention.inputMethod === 'keyboard' ||
        intention.inputMethod === 'mouse' ||
        intention.inputMethod === 'touch' ||
        intention.inputMethod === 'gamepad'
          ? intention.inputMethod
          : undefined;

      switch (intention.key.kind) {
        case 'digit':
          this.actor.send({
            type: 'ARITHMETIC_INPUT',
            key: 'digit',
            digit: intention.key.digit,
            inputMethod,
          });
          return accepted();
        case 'minus':
          this.actor.send({ type: 'ARITHMETIC_INPUT', key: 'minus', inputMethod });
          return accepted();
        case 'decimal':
          this.actor.send({ type: 'ARITHMETIC_INPUT', key: 'decimal', inputMethod });
          return accepted();
        case 'reset':
          this.actor.send({ type: 'ARITHMETIC_INPUT', key: 'reset', inputMethod });
          return accepted();
      }
    }

    if (isCoachingIntention(intention)) {
      switch (intention.type) {
        case 'MISFIRED_INPUT':
          if (!this.running) return ignored('Session not running');
          this.reportMisfiredInput(intention.key);
          return accepted();

        case 'DECLARE_ENERGY':
          this.declareEnergyLevel(intention.level);
          return accepted();
      }
    }

    // Handle ADVANCE for self-paced mode (borrowed from Flow intentions)
    if (intention.type === 'ADVANCE') {
      if (!this.running) return ignored('Session not running');
      this.actor.send({ type: 'ADVANCE' });
      return accepted();
    }

    return ignored(`GameSessionXState does not handle ${intention.type} intentions`);
  }

  canHandleIntent(intention: GameIntention): boolean {
    const phase = this.getPhase();

    if (isSessionControlIntention(intention)) {
      switch (intention.type) {
        case 'START':
          return !this.running;
        case 'STOP':
          return this.running;
        case 'PAUSE':
          return this.running && phase !== 'paused';
        case 'RESUME':
          return phase === 'paused';
      }
    }

    if (isTempoIntention(intention)) {
      return this.running && (phase === 'stimulus' || phase === 'waiting');
    }

    if (isArithmeticInputIntention(intention)) {
      return this.running && (phase === 'stimulus' || phase === 'waiting');
    }

    if (isCoachingIntention(intention)) {
      switch (intention.type) {
        case 'MISFIRED_INPUT':
          return this.running;
        case 'DECLARE_ENERGY':
          return true;
      }
    }

    // ADVANCE is valid during stimulus or waiting phases (self-paced mode)
    if (intention.type === 'ADVANCE') {
      return this.running && (phase === 'stimulus' || phase === 'waiting');
    }

    return false;
  }

  getValidIntentions(): readonly GameIntention['type'][] {
    const valid: GameIntention['type'][] = ['DECLARE_ENERGY'];
    const phase = this.getPhase();

    if (!this.running) {
      valid.push('START');
    } else {
      valid.push('STOP', 'MISFIRED_INPUT');

      if (phase === 'paused') {
        valid.push('RESUME');
      } else if (phase !== 'idle' && phase !== 'finished') {
        valid.push('PAUSE');
      }

      if (phase === 'stimulus' || phase === 'waiting') {
        valid.push(
          'CLAIM_MATCH',
          'RELEASE_CLAIM',
          'REPORT_INPUT_PIPELINE_LATENCY',
          'ARITHMETIC_INPUT',
          'ADVANCE',
        );
      }
    }

    return valid;
  }

  // =============================================================================
  // Subscription
  // =============================================================================

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SessionSnapshot {
    return this.cachedSnapshot;
  }

  getEvents(): readonly GameEvent[] {
    // Use cached finalEvents if available (after session ends)
    // This prevents race conditions where actor snapshot might be stale
    if (this.finalEvents) {
      return this.finalEvents;
    }
    return this.actor.getSnapshot().context.sessionEvents;
  }

  // =============================================================================
  // Progression Evaluation
  // =============================================================================

  // =============================================================================
  // Private Methods
  // =============================================================================

  private getPhase(
    stateValue?: ReturnType<typeof this.actor.getSnapshot>['value'],
  ):
    | 'idle'
    | 'starting'
    | 'countdown'
    | 'stimulus'
    | 'waiting'
    | 'paused'
    | 'finished'
    | 'resuming'
    | 'recovering' {
    const value = stateValue ?? this.actor.getSnapshot().value;

    if (typeof value === 'string') {
      // Internal machine has a transient 'computing' state (final calculations).
      // Public SessionPhase does not expose it; map it to 'finished' so the UI can
      // immediately show end-of-session feedback while calculations complete.
      if (value === 'computing') {
        return 'finished';
      }
      return value as
        | 'idle'
        | 'starting'
        | 'countdown'
        | 'paused'
        | 'finished'
        | 'resuming'
        | 'recovering';
    }

    if (typeof value === 'object' && 'active' in value) {
      const activeValue = value.active;
      if (activeValue === 'stimulus' || activeValue === 'stimulusResume') {
        return 'stimulus';
      }
      if (activeValue === 'waiting' || activeValue === 'waitingResume') {
        return 'waiting';
      }
    }

    return 'idle';
  }

  private mapToSessionSnapshot(state: ReturnType<typeof this.actor.getSnapshot>): SessionSnapshot {
    const { context } = state;
    const phase = this.getPhase(state.value);

    // Map internal phases to public SessionPhase
    // - 'resuming' → 'paused' (resuming from pause, show paused UI)
    // - 'recovering' → 'starting' (recovering session, show starting UI)
    let publicPhase: SessionSnapshot['phase'];
    if (phase === 'resuming') {
      publicPhase = 'paused';
    } else if (phase === 'recovering') {
      publicPhase = 'starting';
    } else {
      publicPhase = phase;
    }

    const rawArithmetic = context.arithmeticInput.chars.join('');
    const displayArithmetic =
      rawArithmetic === '' || rawArithmetic === '.'
        ? '0'
        : `${context.arithmeticInput.negative ? '-' : ''}${rawArithmetic}`;

    return {
      phase: publicPhase,
      trial: context.currentTrial,
      trialIndex: context.trialIndex,
      // Use generator.getTotalTrials() for accurate count (includes warmup buffer)
      totalTrials: context.generator.getTotalTrials(),
      isi: context.isi,
      prepDelayMs: context.spec.timing.prepDelayMs ?? TIMING_SESSION_PREP_MS,
      message: null,
      dPrime: context.statsCalculator.calculate().currentDPrime,
      summary: context.finalSummary,
      trialHistory: context.trialHistory,
      nLevel: context.config.nLevel,
      adaptiveZone: context.generator.getZoneNumber(),
      xpBreakdown: context.xpBreakdown,
      arithmeticInput: context.config.activeModalities.includes('arithmetic')
        ? {
            raw: rawArithmetic,
            display: displayArithmetic,
            negative: context.arithmeticInput.negative,
            decimal: context.arithmeticInput.decimal,
          }
        : null,
      // Audio-visual sync: true when audio callback has triggered visual display
      stimulusVisible: context.stimulusVisible,
      stimulusDurationMs: context.stimulusDuration,
      audioSyncCallbackAtMs: context.audioSyncCallbackAtMs,
      audioEndedCallbackAtMs: context.audioEndedCallbackAtMs,
      visualTriggerCallbackAtMs: context.visualTriggerCallbackAtMs,
      visualHideCallbackAtMs: context.visualHideCallbackAtMs,
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.cachedSnapshot);
    }
  }

  private enqueueEventsForPersistence(events: readonly GameEvent[]): void {
    // Persist only the delta since the previous snapshot.
    // Re-scanning the full event log on every machine update becomes expensive on
    // low-end devices once a session accumulates hundreds of events.
    const persistStart = performance.now();
    let persistedCount = 0;

    if (events.length < this.lastObservedEventCount) {
      this.lastObservedEventCount = 0;
    }

    const newEvents = events.slice(this.lastObservedEventCount);
    this.lastObservedEventCount = events.length;

    for (const event of newEvents) {
      if (this.isEventPersisted(event) || this.isEventPersisting(event)) {
        continue;
      }
      this.persistEvent(event);
      persistedCount++;
    }

    if (persistedCount > 0) {
      const persistDuration = performance.now() - persistStart;
      if (persistDuration > 50 || persistedCount > 1) {
        console.warn(
          `[GameSessionXState] persisted ${persistedCount} events in ${persistDuration.toFixed(0)}ms`,
        );
      }
    }
  }

  // =============================================================================
  // Focus Tracking
  // =============================================================================

  private focusTrackingCleanup: (() => void) | null = null;

  private setupFocusTracking(): void {
    if (this.focusTrackingCleanup) {
      this.focusTrackingCleanup();
    }

    const source = this.platformLifecycleSource;
    if (!source) return;

    const unsub = source.subscribe((event) => {
      if (event === 'BACKGROUNDED') {
        this.actor.send({ type: 'FOCUS_LOST' });
        return;
      }
      if (event === 'FOREGROUNDED') {
        const ctx = this.actor.getSnapshot().context;
        if (ctx.focusLostTime !== null) {
          const lostDurationMs = (ctx.audio.getCurrentTime() - ctx.focusLostTime) * 1000;
          this.actor.send({ type: 'FOCUS_REGAINED', lostDurationMs });
        }
      }
    });

    // Seed initial state (best-effort)
    if (source.isBackgrounded()) {
      this.actor.send({ type: 'FOCUS_LOST' });
    }

    this.focusTrackingCleanup = unsub;
  }

  private cleanupFocusTracking(): void {
    if (this.focusTrackingCleanup) {
      this.focusTrackingCleanup();
      this.focusTrackingCleanup = null;
    }
  }

  // =============================================================================
  // Algorithm State Persistence
  // =============================================================================

  private async loadAlgorithmState(): Promise<void> {
    if (!this.algorithmStatePort) return;
    if (!(this.generator instanceof SequenceTrialGenerator)) return;

    const algorithmType = this.generator.getAlgorithmType();
    if (algorithmType !== 'adaptive-controller' && algorithmType !== 'meta-learning') return;

    try {
      const stored = await this.algorithmStatePort.loadState(
        this.userId,
        algorithmType as 'adaptive-controller' | 'meta-learning',
      );
      if (stored) {
        this.generator.restoreAlgorithmState(stored.state);
      }
    } catch (err) {
      console.warn('[GameSessionXState] Failed to load algorithm state:', err);
    }
  }

  private saveAlgorithmState(): void {
    if (!this.algorithmStatePort) return;
    if (!(this.generator instanceof SequenceTrialGenerator)) return;

    const algorithmType = this.generator.getAlgorithmType();
    if (algorithmType !== 'adaptive-controller' && algorithmType !== 'meta-learning') return;

    const state = this.generator.serializeAlgorithmState();
    if (!state) return;

    this.algorithmStatePort
      .saveState(this.userId, algorithmType as 'adaptive-controller' | 'meta-learning', state)
      .catch((err) => {
        console.warn('[GameSessionXState] Failed to save algorithm state:', err);
      });
  }

  // =============================================================================
  // Spec-Based Getters
  // =============================================================================

  private getEffectiveSequenceMode(): AdaptationMode | undefined {
    return this.spec.generation.sequenceMode as AdaptationMode | undefined;
  }

  // =============================================================================
  // Public Getters (for compatibility)
  // =============================================================================

  getConfig(): GameConfig {
    return this.config;
  }

  getTrialsSeed(): string {
    return this.trialsSeed;
  }

  getSpec(): ModeSpec {
    return this.spec;
  }

  getGameMode(): string {
    return this.spec.metadata.id;
  }

  getJourneyStageId(): number | undefined {
    return this.journeyStageId;
  }

  getJourneyId(): string | undefined {
    return this.journeyId;
  }

  getInitialStrikes(): number {
    return this.initialStrikes;
  }
}
