/**
 * Command Bus for Emmett-style event sourcing
 *
 * Routes commands to the Emmett event store with idempotence.
 */

import { SESSION_END_EVENT_TYPES_ARRAY } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type {
  StoredEvent,
  EmmettEventStore,
  StreamId,
  ExpectedStreamVersion,
  ReadStreamResult,
} from './powersync-emmett-event-store';
import {
  createEmmettEventStore,
  NO_CONCURRENCY_CHECK,
  STREAM_DOES_NOT_EXIST,
  streamIdToString,
} from './powersync-emmett-event-store';
import { getProcessedCommandFromPowerSync } from './processed-commands';
import { invalidateProcessorEngineCache } from './processor-engine';

// Re-export from persistence for type compatibility
export type { PowerSyncPersistencePort } from '../persistence/setup-persistence';

export type CommandId = string;

const PROCESSOR_INVALIDATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...SESSION_END_EVENT_TYPES_ARRAY,
  'SESSION_IMPORTED',
  'XP_BREAKDOWN_COMPUTED',
  'JOURNEY_TRANSITION_DECIDED',
  'CALIBRATION_BASELINE_SET',
  'CALIBRATION_RESET',
  'CALIBRATION_MODALITY_DETERMINED',
]);

/**
 * Avoid invalidating the processor engine for noisy in-session writes like
 * TRIAL_PRESENTED/USER_RESPONDED. Those events are only needed when the session
 * finalizes; invalidating on every batch makes the periodic catch-up replay
 * active sessions on the UI thread for no user-visible benefit.
 */
export function shouldInvalidateProcessorEngineForEvents(
  events: readonly { type?: unknown }[],
): boolean {
  return events.some((event) => {
    const type = typeof event.type === 'string' ? event.type : '';
    return PROCESSOR_INVALIDATION_EVENT_TYPES.has(type);
  });
}

export interface CommandMetadata {
  readonly commandId: CommandId;
  readonly timestamp: Date;
  readonly causationId?: string; // Commande parente (si applicable)
  readonly correlationId?: string; // Corrélation entre commandes
  readonly userId?: string; // Utilisateur (si applicable)
}

export type NeuroCommand<TType extends string, TData extends Record<string, unknown>> = Readonly<{
  type: TType;
  data: Readonly<TData>;
  metadata: CommandMetadata;
}>;

export type SessionStartCommand = NeuroCommand<
  'SESSION/START',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionEndCommand = NeuroCommand<
  'SESSION/END',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>;
    readonly workflow?: {
      readonly completionInput: unknown;
    };
  }
>;

export type SessionRecordTrialCommand = NeuroCommand<
  'SESSION/RECORD_TRIAL',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionRecordResponseCommand = NeuroCommand<
  'SESSION/RECORD_RESPONSE',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionRecordTelemetryCommand = NeuroCommand<
  'SESSION/RECORD_TELEMETRY',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionRecordEventsBatchCommand = NeuroCommand<
  'SESSION/RECORD_EVENTS_BATCH',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly events: readonly ({
      readonly id: string;
      readonly type: string;
      readonly timestamp: number;
    } & Record<string, unknown>)[];
  }
>;

export type SessionComputeXpBreakdownCommand = NeuroCommand<
  'SESSION/COMPUTE_XP_BREAKDOWN',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: 'XP_BREAKDOWN_COMPUTED' | string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionComputeJourneyContextCommand = NeuroCommand<
  'SESSION/COMPUTE_JOURNEY_CONTEXT',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: 'JOURNEY_TRANSITION_DECIDED' | string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

export type SessionUnlockBadgeCommand = NeuroCommand<
  'SESSION/UNLOCK_BADGE',
  {
    readonly sessionId: string;
    readonly expectedVersion?: number;
    readonly event: {
      readonly id: string;
      readonly type: 'BADGE_UNLOCKED' | string;
      readonly timestamp: number;
    } & Record<string, unknown>;
  }
>;

type SynergyLoopEventPayload = {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
} & Record<string, unknown>;

export type SynergyLoopConfigureCommand = NeuroCommand<
  'SYNERGY_LOOP/CONFIGURE',
  {
    readonly loopId?: string;
    readonly expectedVersion?: number;
    readonly event: SynergyLoopEventPayload;
  }
>;

export type SynergyLoopStartCommand = NeuroCommand<
  'SYNERGY_LOOP/START',
  {
    readonly loopId?: string;
    readonly expectedVersion?: number;
    readonly event: SynergyLoopEventPayload;
  }
>;

export type SynergyLoopCompleteStepCommand = NeuroCommand<
  'SYNERGY_LOOP/COMPLETE_STEP',
  {
    readonly loopId?: string;
    readonly expectedVersion?: number;
    readonly event: SynergyLoopEventPayload;
  }
>;

export type SynergyLoopResetCommand = NeuroCommand<
  'SYNERGY_LOOP/RESET',
  {
    readonly loopId?: string;
    readonly expectedVersion?: number;
    readonly event: SynergyLoopEventPayload;
  }
>;

type CalibrationBaselineEventPayload = {
  readonly id: string;
  readonly type: 'CALIBRATION_BASELINE_SET' | string;
  readonly timestamp: number;
  readonly userId: string;
  readonly level: number;
} & Record<string, unknown>;

type CalibrationResetEventPayload = {
  readonly id: string;
  readonly type: 'CALIBRATION_RESET' | string;
  readonly timestamp: number;
  readonly userId: string;
} & Record<string, unknown>;

type CalibrationModalityDeterminedEventPayload = {
  readonly id: string;
  readonly type: 'CALIBRATION_MODALITY_DETERMINED' | string;
  readonly timestamp: number;
  readonly userId: string;
  readonly modality: string;
  readonly gameMode: string;
  readonly masteredLevel: number;
} & Record<string, unknown>;

export type CalibrationSetBaselineCommand = NeuroCommand<
  'CALIBRATION/SET_BASELINE',
  {
    readonly userId: string;
    readonly expectedVersion?: number;
    readonly event: CalibrationBaselineEventPayload;
  }
>;

export type CalibrationResetCommand = NeuroCommand<
  'CALIBRATION/RESET',
  {
    readonly userId: string;
    readonly expectedVersion?: number;
    readonly event: CalibrationResetEventPayload;
  }
>;

export type CalibrationModalityDeterminedCommand = NeuroCommand<
  'CALIBRATION/MODALITY_DETERMINED',
  {
    readonly userId: string;
    readonly expectedVersion?: number;
    readonly event: CalibrationModalityDeterminedEventPayload;
  }
>;

export interface CommandBus {
  /**
   * Inject a session-end workflow runner (derived effects).
   * Kept as a setter to avoid globalThis wiring and to allow breaking circular deps
   * (runner depends on the bus).
   */
  setSessionEndWorkflowRunner(runner: SessionEndWorkflowRunnerPort | null): void;

  handle<T extends NeuroCommand<string, Record<string, unknown>>>(
    cmd: T,
  ): Promise<{ readonly events: readonly StoredEvent[]; readonly fromCache: boolean }>;

  /**
   * Read events from a stream, returning the current stream version and events.
   * Used during recovery to initialize the stream version from the authoritative source.
   */
  readStream(args: {
    readonly streamId: StreamId;
    readonly fromVersion?: bigint;
    readonly maxCount?: bigint;
  }): Promise<ReadStreamResult>;
}

export type CommandHandler<T extends NeuroCommand<string, Record<string, unknown>>> = (args: {
  readonly cmd: T;
  readonly store: EmmettEventStore;
}) => Promise<{
  readonly streamId: StreamId;
  readonly expectedVersion: ExpectedStreamVersion;
  readonly events: readonly {
    readonly eventId: string;
    readonly type: string;
    readonly data: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
  }[];
}>;

export type PostCommitHook<T extends NeuroCommand<string, Record<string, unknown>>> = (args: {
  readonly cmd: T;
  readonly appended: readonly StoredEvent[];
  readonly bus: CommandBus;
}) => Promise<void>;

export interface SessionEndWorkflowRunnerPort {
  onSessionEnded: (args: {
    readonly sessionId: string;
    readonly endCommandId: string;
    readonly completionInput: unknown;
  }) => Promise<void>;
}

/**
 * Create a command bus with Emmett event store.
 *
 * Accepts either:
 * - AbstractPowerSyncDatabase directly
 * - InfraPersistencePort (has getPowerSyncDb() method)
 */
export function createCommandBus(
  dbOrPort: AbstractPowerSyncDatabase | { getPowerSyncDb(): Promise<AbstractPowerSyncDatabase> },
  options?: {
    /**
     * Optional runner for derived side-effects (journey context, badges, XP breakdown).
     * Injected explicitly (avoid globalThis wiring).
     */
    sessionEndWorkflowRunner?: SessionEndWorkflowRunnerPort | null;
  },
): CommandBus {
  let store: EmmettEventStore | null = null;
  let dbInstance: AbstractPowerSyncDatabase | null = null;
  let dbPromise: Promise<AbstractPowerSyncDatabase> | null = null;
  let sessionEndWorkflowRunner: SessionEndWorkflowRunnerPort | null =
    options?.sessionEndWorkflowRunner ?? null;

  const nowMs = (): number => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };

  const schedulePostCommit = (fn: () => void): void => {
    const ric = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => void;
      }
    ).requestIdleCallback;
    if (typeof ric === 'function') {
      ric(fn, { timeout: 2000 });
      return;
    }
    setTimeout(fn, 0);
  };

  let postCommitChain = Promise.resolve();
  let postCommitQueueDepth = 0;
  let postCommitMaxQueueDepth = 0;

  const enqueuePostCommitTask = (label: string, task: () => Promise<void>): void => {
    const enqueuedAt = nowMs();
    postCommitQueueDepth += 1;
    postCommitMaxQueueDepth = Math.max(postCommitMaxQueueDepth, postCommitQueueDepth);

    const run = async (): Promise<void> => {
      await new Promise<void>((resolve) => schedulePostCommit(resolve));
      const startedAt = nowMs();
      const waitMs = startedAt - enqueuedAt;
      try {
        await task();
      } catch (error) {
        console.error(`[CommandBus] Post-commit task failed (${label})`, error);
      } finally {
        const runMs = nowMs() - startedAt;
        postCommitQueueDepth = Math.max(0, postCommitQueueDepth - 1);
        if (runMs > 60 || waitMs > 250) {
          console.debug(
            `[CommandBus] Post-commit task ${label} wait=${Math.round(waitMs)}ms run=${Math.round(
              runMs,
            )}ms depth=${postCommitQueueDepth} max=${postCommitMaxQueueDepth}`,
          );
        }
      }
    };

    postCommitChain = postCommitChain.then(run, run);
  };

  const getDb = async (): Promise<AbstractPowerSyncDatabase> => {
    if (dbInstance) return dbInstance;
    if (dbPromise) return dbPromise;

    if (typeof (dbOrPort as { getPowerSyncDb?: unknown }).getPowerSyncDb === 'function') {
      dbPromise = (dbOrPort as { getPowerSyncDb(): Promise<AbstractPowerSyncDatabase> })
        .getPowerSyncDb()
        .then((db) => {
          // Validate the db has required methods
          if (typeof db.execute !== 'function') {
            throw new Error('[CommandBus] PowerSync db is missing required methods (execute)');
          }
          dbInstance = db;
          store = createEmmettEventStore(db);
          return db;
        });
      return dbPromise;
    }

    // Direct db passed in (AbstractPowerSyncDatabase)
    const directDb = dbOrPort as AbstractPowerSyncDatabase;
    dbInstance = directDb;
    store = createEmmettEventStore(directDb);
    return dbInstance;
  };

  const getStore = async (): Promise<EmmettEventStore> => {
    if (store) return store;
    await getDb();
    if (!store) {
      throw new Error('[CommandBus] Emmett event store not initialized');
    }
    return store;
  };

  const inFlightByStream = new Map<string, Promise<void>>();

  // Bounded set of recently processed commandIds (FIFO eviction).
  // Skips the SELECT processed_commands SQL for new (non-duplicate) commands.
  // After restart, set is empty → PK conflict on processed_commands is the
  // safety net (transaction rolls back, no corruption).
  const processedCommandIds = new Set<string>();
  const PROCESSED_COMMANDS_SET_MAX = 500;

  const trackProcessedCommandId = (id: string): void => {
    if (processedCommandIds.has(id)) return;
    if (processedCommandIds.size >= PROCESSED_COMMANDS_SET_MAX) {
      const oldest = processedCommandIds.values().next().value;
      if (oldest !== undefined) {
        processedCommandIds.delete(oldest);
      }
    }
    processedCommandIds.add(id);
  };

  const enqueueByStream = <T>(streamId: StreamId, fn: () => Promise<T>): Promise<T> => {
    const key = streamIdToString(streamId);
    const prev = inFlightByStream.get(key) ?? Promise.resolve();

    // Ensure per-stream sequential writes even when callers don't await.
    // This prevents out-of-order appends (e.g. trial before start) and avoids
    // contention on emt_streams for fast event bursts.
    const result = prev.then(fn, fn);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    inFlightByStream.set(key, settled);
    void settled.finally(() => {
      if (inFlightByStream.get(key) === settled) {
        inFlightByStream.delete(key);
      }
    });
    return result;
  };

  const handlers = new Map<string, CommandHandler<NeuroCommand<string, Record<string, unknown>>>>();
  const postCommit = new Map<
    string,
    PostCommitHook<NeuroCommand<string, Record<string, unknown>>>
  >();

  const toExpectedStreamVersion = (value: unknown): ExpectedStreamVersion => {
    if (value === undefined || value === null) return NO_CONCURRENCY_CHECK;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
        return NO_CONCURRENCY_CHECK;
      }
      return BigInt(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return NO_CONCURRENCY_CHECK;
      try {
        return BigInt(trimmed);
      } catch {
        return NO_CONCURRENCY_CHECK;
      }
    }
    return NO_CONCURRENCY_CHECK;
  };

  const toSynergyLoopId = (value: unknown): string => {
    if (typeof value !== 'string') return 'default';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'default';
  };

  const buildSynergySingleEventDecision = (
    loopId: unknown,
    expectedVersion: unknown,
    event: SynergyLoopEventPayload,
  ) => ({
    streamId: {
      aggregateId: toSynergyLoopId(loopId),
      aggregateType: 'synergy-loop',
    },
    expectedVersion: toExpectedStreamVersion(expectedVersion),
    events: [
      {
        eventId: String(event.id),
        type: String(event.type),
        data: { ...event },
      },
    ],
  });

  const buildCalibrationBaselineDecision = (
    userId: unknown,
    expectedVersion: unknown,
    event: CalibrationBaselineEventPayload,
  ) => ({
    streamId: {
      aggregateId: typeof userId === 'string' ? userId : String(event.userId),
      aggregateType: 'cognitive-profile',
    },
    expectedVersion: toExpectedStreamVersion(expectedVersion),
    events: [
      {
        eventId: String(event.id),
        type: String(event.type),
        data: { ...event },
      },
    ],
  });

  const buildCalibrationResetDecision = (
    userId: unknown,
    expectedVersion: unknown,
    event: CalibrationResetEventPayload,
  ) => ({
    streamId: {
      aggregateId: typeof userId === 'string' ? userId : String(event.userId),
      aggregateType: 'cognitive-profile',
    },
    expectedVersion: toExpectedStreamVersion(expectedVersion),
    events: [
      {
        eventId: String(event.id),
        type: String(event.type),
        data: { ...event },
      },
    ],
  });

  const buildCalibrationModalityDeterminedDecision = (
    userId: unknown,
    expectedVersion: unknown,
    event: CalibrationModalityDeterminedEventPayload,
  ) => ({
    streamId: {
      aggregateId: typeof userId === 'string' ? userId : String(event.userId),
      aggregateType: 'cognitive-profile',
    },
    expectedVersion: toExpectedStreamVersion(expectedVersion),
    events: [
      {
        eventId: String(event.id),
        type: String(event.type),
        data: { ...event },
      },
    ],
  });

  const readEventsForProcessedCommand = async (
    store: EmmettEventStore,
    row: {
      readonly aggregate_id: string;
      readonly aggregate_type: string;
      readonly from_stream_position: string;
      readonly to_stream_position: string;
    },
  ): Promise<readonly StoredEvent[]> => {
    const fromPos = BigInt(row.from_stream_position);
    const toPos = BigInt(row.to_stream_position);

    if (toPos < fromPos) return [];
    const maxCount = toPos - fromPos + 1n;

    const result = await store.readStream({
      streamId: { aggregateId: row.aggregate_id, aggregateType: row.aggregate_type },
      fromVersion: fromPos,
      maxCount,
    });
    return result.events;
  };

  const register = <T extends NeuroCommand<string, Record<string, unknown>>>(
    type: T['type'],
    handler: CommandHandler<T>,
  ) => {
    handlers.set(
      type,
      handler as unknown as CommandHandler<NeuroCommand<string, Record<string, unknown>>>,
    );
  };

  const registerPostCommit = <T extends NeuroCommand<string, Record<string, unknown>>>(
    type: T['type'],
    hook: PostCommitHook<T>,
  ) => {
    postCommit.set(
      type,
      hook as unknown as PostCommitHook<NeuroCommand<string, Record<string, unknown>>>,
    );
  };

  register<SessionStartCommand>('SESSION/START', async ({ cmd }) => {
    const data = cmd.data;
    if (!String(data.event.type).endsWith('_STARTED')) {
      throw new Error(
        `[CommandBus] SESSION/START expects *_STARTED (got ${String(data.event.type)})`,
      );
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: STREAM_DOES_NOT_EXIST,
      events: [
        {
          eventId: String(data.event.id),
          type: String(data.event.type),
          data: { ...data.event },
        },
      ],
    };
  });

  register<SessionEndCommand>('SESSION/END', async ({ cmd }) => {
    const data = cmd.data;
    if (!String(data.event.type).endsWith('_ENDED')) {
      throw new Error(`[CommandBus] SESSION/END expects *_ENDED (got ${String(data.event.type)})`);
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: String(data.event.type),
          data: { ...data.event },
        },
      ],
    };
  });

  registerPostCommit<SessionEndCommand>('SESSION/END', async ({ cmd }) => {
    const sessionId = cmd.data.sessionId;

    // Run the session-end workflow (stats, history, etc.)
    const runner = sessionEndWorkflowRunner;

    if (runner) {
      // Workflow can be in cmd.data.workflow (legacy) or cmd.data.event.workflow (current)
      const completionInput =
        cmd.data.workflow?.completionInput ??
        (cmd.data.event as { workflow?: { completionInput?: unknown } } | undefined)?.workflow
          ?.completionInput;
      if (completionInput) {
        await runner.onSessionEnded({
          sessionId,
          endCommandId: cmd.metadata.commandId,
          completionInput,
        });
      }
    }
  });

  register<SessionRecordTrialCommand>('SESSION/RECORD_TRIAL', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (
      !(
        t.includes('TRIAL_') ||
        t.startsWith('FLOW_') ||
        t.startsWith('RECALL_') ||
        t.startsWith('DUAL_PICK_') ||
        t.startsWith('TRACE_')
      )
    ) {
      throw new Error(`[CommandBus] SESSION/RECORD_TRIAL expects TRIAL_* (got ${t})`);
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: t,
          data: { ...data.event },
        },
      ],
    };
  });

  register<SessionRecordResponseCommand>('SESSION/RECORD_RESPONSE', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (!t.includes('RESPON') && !t.includes('RESPONSE')) {
      throw new Error(`[CommandBus] SESSION/RECORD_RESPONSE expects *_RESPON* (got ${t})`);
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: t,
          data: { ...data.event },
        },
      ],
    };
  });

  register<SessionRecordTelemetryCommand>('SESSION/RECORD_TELEMETRY', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: t,
          data: { ...data.event },
        },
      ],
    };
  });

  register<SessionRecordEventsBatchCommand>('SESSION/RECORD_EVENTS_BATCH', async ({ cmd }) => {
    const data = cmd.data;
    if (!Array.isArray(data.events) || data.events.length === 0) {
      throw new Error('[CommandBus] SESSION/RECORD_EVENTS_BATCH expects a non-empty events array');
    }

    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: data.events.map((event) => ({
        eventId: String(event.id),
        type: String(event.type),
        data: { ...event },
      })),
    };
  });

  register<SessionComputeXpBreakdownCommand>('SESSION/COMPUTE_XP_BREAKDOWN', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'XP_BREAKDOWN_COMPUTED') {
      throw new Error(
        `[CommandBus] SESSION/COMPUTE_XP_BREAKDOWN expects XP_BREAKDOWN_COMPUTED (got ${t})`,
      );
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: t,
          data: { ...data.event },
        },
      ],
    };
  });

  // JOURNEY_TRANSITION_DECIDED is no longer written.
  // Keep handler registered to drain replayed commands from old sessions.
  register<SessionComputeJourneyContextCommand>(
    'SESSION/COMPUTE_JOURNEY_CONTEXT',
    async ({ cmd }) => {
      console.warn(
        `[CommandBus] SESSION/COMPUTE_JOURNEY_CONTEXT is deprecated (session=${cmd.data?.sessionId ?? '?'}). This command should no longer be dispatched.`,
      );
      return {
        streamId: { aggregateId: '', aggregateType: 'session' },
        expectedVersion: NO_CONCURRENCY_CHECK,
        events: [],
      };
    },
  );

  register<SessionUnlockBadgeCommand>('SESSION/UNLOCK_BADGE', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'BADGE_UNLOCKED') {
      throw new Error(`[CommandBus] SESSION/UNLOCK_BADGE expects BADGE_UNLOCKED (got ${t})`);
    }
    return {
      streamId: { aggregateId: data.sessionId, aggregateType: 'session' },
      expectedVersion: toExpectedStreamVersion(data.expectedVersion),
      events: [
        {
          eventId: String(data.event.id),
          type: t,
          data: { ...data.event },
        },
      ],
    };
  });

  register<SynergyLoopConfigureCommand>('SYNERGY_LOOP/CONFIGURE', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'SYNERGY_CONFIG_UPDATED') {
      throw new Error(
        `[CommandBus] SYNERGY_LOOP/CONFIGURE expects SYNERGY_CONFIG_UPDATED (got ${t})`,
      );
    }
    return buildSynergySingleEventDecision(data.loopId, data.expectedVersion, data.event);
  });

  register<SynergyLoopStartCommand>('SYNERGY_LOOP/START', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'SYNERGY_LOOP_STARTED') {
      throw new Error(`[CommandBus] SYNERGY_LOOP/START expects SYNERGY_LOOP_STARTED (got ${t})`);
    }
    return buildSynergySingleEventDecision(data.loopId, data.expectedVersion, data.event);
  });

  register<SynergyLoopCompleteStepCommand>('SYNERGY_LOOP/COMPLETE_STEP', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'SYNERGY_STEP_COMPLETED') {
      throw new Error(
        `[CommandBus] SYNERGY_LOOP/COMPLETE_STEP expects SYNERGY_STEP_COMPLETED (got ${t})`,
      );
    }
    return buildSynergySingleEventDecision(data.loopId, data.expectedVersion, data.event);
  });

  register<SynergyLoopResetCommand>('SYNERGY_LOOP/RESET', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'SYNERGY_LOOP_RESET') {
      throw new Error(`[CommandBus] SYNERGY_LOOP/RESET expects SYNERGY_LOOP_RESET (got ${t})`);
    }
    return buildSynergySingleEventDecision(data.loopId, data.expectedVersion, data.event);
  });

  register<CalibrationSetBaselineCommand>('CALIBRATION/SET_BASELINE', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'CALIBRATION_BASELINE_SET') {
      throw new Error(
        `[CommandBus] CALIBRATION/SET_BASELINE expects CALIBRATION_BASELINE_SET (got ${t})`,
      );
    }
    if (typeof data.userId !== 'string' || data.userId.trim().length === 0) {
      throw new Error('[CommandBus] CALIBRATION/SET_BASELINE requires a non-empty userId');
    }
    return buildCalibrationBaselineDecision(data.userId, data.expectedVersion, data.event);
  });

  register<CalibrationResetCommand>('CALIBRATION/RESET', async ({ cmd }) => {
    const data = cmd.data;
    const t = String(data.event.type);
    if (t !== 'CALIBRATION_RESET') {
      throw new Error(`[CommandBus] CALIBRATION/RESET expects CALIBRATION_RESET (got ${t})`);
    }
    if (typeof data.userId !== 'string' || data.userId.trim().length === 0) {
      throw new Error('[CommandBus] CALIBRATION/RESET requires a non-empty userId');
    }
    return buildCalibrationResetDecision(data.userId, data.expectedVersion, data.event);
  });

  register<CalibrationModalityDeterminedCommand>(
    'CALIBRATION/MODALITY_DETERMINED',
    async ({ cmd }) => {
      const data = cmd.data;
      const t = String(data.event.type);
      if (t !== 'CALIBRATION_MODALITY_DETERMINED') {
        throw new Error(
          `[CommandBus] CALIBRATION/MODALITY_DETERMINED expects CALIBRATION_MODALITY_DETERMINED (got ${t})`,
        );
      }
      if (typeof data.userId !== 'string' || data.userId.trim().length === 0) {
        throw new Error('[CommandBus] CALIBRATION/MODALITY_DETERMINED requires a non-empty userId');
      }
      return buildCalibrationModalityDeterminedDecision(
        data.userId,
        data.expectedVersion,
        data.event,
      );
    },
  );

  const bus: CommandBus = {
    setSessionEndWorkflowRunner(runner) {
      sessionEndWorkflowRunner = runner;
    },

    async handle(cmd) {
      const t0 = nowMs();
      const commandId = cmd.metadata.commandId;
      const correlationId = cmd.metadata.correlationId ?? commandId;
      const db = await getDb();
      const currentStore = await getStore();

      const handler = handlers.get(cmd.type);
      if (!handler) {
        throw new Error(`[CommandBus] No handler registered for ${cmd.type}`);
      }

      const decided = await handler({ cmd, store: currentStore });

      return enqueueByStream(decided.streamId, async () => {
        // Idempotence check: only hit SQL if the commandId was seen in this session.
        // Normal gameplay (99.9%): commands are unique → not in set → skip SQL.
        // Retry (ensureEventsPersisted): commandId IS in set → SQL check → fromCache.
        // After restart: set empty → skip SQL → PK conflict on processed_commands
        // rolls back safely if a duplicate slips through.
        if (processedCommandIds.has(commandId)) {
          const cached2 = await getProcessedCommandFromPowerSync(db, commandId);
          if (cached2) {
            const events = await readEventsForProcessedCommand(currentStore, cached2);
            return { events, fromCache: true };
          }
        }

        // Add causation metadata to all events generated by this command
        const eventsWithCausation = decided.events.map((event) => ({
          ...event,
          metadata: {
            ...event.metadata,
            causationId: commandId,
            correlationId,
          },
        }));

        const appended = await currentStore.appendToStream({
          streamId: decided.streamId,
          expectedVersion: decided.expectedVersion,
          events: eventsWithCausation,
          // Atomic idempotence: write processed_commands within the event append transaction.
          // If the app crashes between event append and command recording, the command
          // would be re-executed on restart, causing duplicate events. By writing both
          // in the same transaction, we ensure atomicity - both succeed or both fail.
          onCommit: async ({ events: appendedEvents, tx }) => {
            const fromPosition = appendedEvents[0]?.streamPosition ?? 0n;
            const toPosition = appendedEvents.at(-1)?.streamPosition ?? 0n;

            await tx.execute(
              `INSERT INTO processed_commands
               (id, command_id, aggregate_id, aggregate_type, processed_at, from_stream_position, to_stream_position)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                commandId, // Use command_id as id (globally unique)
                commandId,
                decided.streamId.aggregateId,
                decided.streamId.aggregateType,
                new Date().toISOString(),
                String(fromPosition),
                String(toPosition),
              ],
            );
          },
        });

        trackProcessedCommandId(commandId);

        const writeMs = nowMs() - t0;
        if (writeMs > 5) {
          console.debug(
            `[CommandBus] handle ${cmd.type} write=${writeMs.toFixed(1)}ms cached=${processedCommandIds.size}`,
          );
        }

        // Invalidate only for projection-relevant events. Reprocessing every
        // in-session trial batch on the next periodic catch-up causes avoidable
        // UI-thread work, especially on Safari IndexedDB fallback.
        if (shouldInvalidateProcessorEngineForEvents(appended.events)) {
          // We do NOT call ensureUpToDate() here to avoid the race condition
          // that caused double-incrementing user_stats_projection.
          invalidateProcessorEngineCache();
        }

        const hook = postCommit.get(cmd.type);

        if (hook) {
          enqueuePostCommitTask(`hook:${cmd.type}`, () =>
            hook({ cmd, appended: appended.events, bus }),
          );
        }

        return { events: appended.events, fromCache: false };
      });
    },

    async readStream(args) {
      const currentStore = await getStore();
      return currentStore.readStream(args);
    },
  };
  return bus;
}
