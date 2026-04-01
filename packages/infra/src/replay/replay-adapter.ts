// packages/infra/src/replay/replay-adapter.ts
/**
 * Replay Adapter
 *
 * Implementation of ReplayPort using Emmett Event Store.
 * Loads session events from emt_messages table with indexed stream_position.
 *
 * Migration (Phase 1): Replaced persistence.getSession() (events_all VIEW) with
 * eventStore.readStream() for O(log n) indexed reads.
 */

import {
  type ReplayPort,
  type ReplaySession,
  type ReplayTempoSession,
  type ReplayPlaceSession,
  type ReplayMemoSession,
  type ReplayDualPickSession,
  type ReplayTrackSession,
  type BlockConfig,
  type MemoSessionConfig,
  type PlaceSessionConfig,
  type DualPickSessionConfig,
  migrateAndValidateEventBatch,
  type RawVersionedEvent,
  type PersistencePort,
  type CommandBusPort,
} from '@neurodual/logic';
/** Inline replacement for removed Emmett StreamId type. */
type StreamId = { aggregateId: string; aggregateType: string };

/** Inline replacement for removed Emmett StoredEvent type. */
type EmmettStoredEvent = {
  eventId: string;
  streamPosition: bigint;
  globalPosition: bigint;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
};
import { ReplayLoadError } from './errors';

// =============================================================================
// Helper Types
// =============================================================================

interface SessionStartEvent {
  type: 'SESSION_STARTED';
  timestamp: number;
  config?: BlockConfig;
  nLevel?: number;
  gameMode?: string;
}

interface RecallSessionStartEvent {
  type: 'RECALL_SESSION_STARTED';
  timestamp: number;
  config: MemoSessionConfig;
}

interface FlowSessionStartEvent {
  type: 'FLOW_SESSION_STARTED';
  timestamp: number;
  config: {
    nLevel: number;
    activeModalities: readonly string[];
    trialsCount: number;
    stimulusDurationMs: number;
    placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  };
}

interface DualPickSessionStartEvent {
  type: 'DUAL_PICK_SESSION_STARTED';
  timestamp: number;
  config: DualPickSessionConfig;
}

interface MotSessionStartEvent {
  type: 'MOT_SESSION_STARTED';
  timestamp: number;
  config: {
    targetCount: number;
    totalObjects: number;
    highlightDurationMs: number;
    trackingDurationMs: number;
    speedPxPerSec: number;
    motionComplexity: 'smooth' | 'standard' | 'agile';
    crowdingThresholdPx: number;
    minSeparationPx: number;
  };
}

interface SessionEndEvent {
  type:
    | 'SESSION_ENDED'
    | 'RECALL_SESSION_ENDED'
    | 'FLOW_SESSION_ENDED'
    | 'DUAL_PICK_SESSION_ENDED'
    | 'MOT_SESSION_ENDED';
  timestamp: number;
}

/**
 * Result of reading a stream from an event store.
 */
interface ReadStreamResult {
  currentStreamVersion: bigint;
  streamExists: boolean;
  events: readonly EmmettStoredEvent[];
}

/**
 * Minimal event reader interface for replay.
 * Only requires the ability to read streams by ID.
 */
interface EventStreamReader {
  readStream(args: {
    streamId: StreamId;
    fromVersion?: bigint;
    maxCount?: bigint;
  }): Promise<ReadStreamResult>;
}

// =============================================================================
// Event Conversion
// =============================================================================

/**
 * Convert Emmett StoredEvent[] to RawVersionedEvent[] for migration/validation.
 * This maintains compatibility with the existing migration pipeline.
 */
function emmettEventsToRawVersionedEvents(
  storedEvents: readonly EmmettStoredEvent[],
  sessionId: string,
): RawVersionedEvent[] {
  return storedEvents.map((e) => ({
    id: e.eventId,
    sessionId,
    timestamp: e.createdAt.getTime(),
    type: e.type,
    schemaVersion: (e.data['schemaVersion'] as number) ?? 1,
    ...e.data,
  }));
}

// =============================================================================
// Core Implementation
// =============================================================================

/**
 * Internal implementation of ReplayPort using any event stream reader.
 */
function createReplayAdapterImpl(
  eventReader: EventStreamReader,
  fallbackPersistence?: Pick<PersistencePort, 'getSession'>,
): ReplayPort {
  const cache = new Map<string, ReplaySession>();
  const CACHE_LIMIT = 24;

  const cacheGet = (sessionId: string): ReplaySession | null => cache.get(sessionId) ?? null;
  const cacheSet = (sessionId: string, session: ReplaySession): void => {
    if (cache.has(sessionId)) {
      cache.set(sessionId, session);
      return;
    }
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(sessionId, session);
  };

  return {
    async getSessionForReplay(sessionId: string): Promise<ReplaySession | null> {
      const cached = cacheGet(sessionId);
      if (cached) return cached;

      // Stream ID format for sessions: "session:{sessionId}"
      const streamId: StreamId = { aggregateType: 'session', aggregateId: sessionId };

      let storedEvents: readonly EmmettStoredEvent[];

      try {
        // Read from event store (indexed by stream_position)
        const result = await eventReader.readStream({ streamId });

        if (!result.streamExists || result.events.length === 0) {
          // Fallback to legacy persistence for sessions not yet migrated to Emmett
          if (fallbackPersistence) {
            const legacyEvents = await fallbackPersistence.getSession(sessionId);
            if (legacyEvents.length === 0) return null;

            // Convert legacy events to Emmett format for processing
            storedEvents = legacyEvents.map((e) => ({
              eventId: e.id,
              streamPosition: 0n,
              globalPosition: 0n,
              type: e.type,
              data: e.payload,
              metadata: {},
              createdAt: new Date(e.timestamp),
            }));
          } else {
            return null;
          }
        } else {
          storedEvents = result.events;
        }
      } catch (error) {
        // Log error but try fallback
        console.warn(`[ReplayAdapter] Error reading from Emmett for session ${sessionId}:`, error);
        if (fallbackPersistence) {
          try {
            const legacyEvents = await fallbackPersistence.getSession(sessionId);
            if (legacyEvents.length === 0) return null;
            storedEvents = legacyEvents.map((e) => ({
              eventId: e.id,
              streamPosition: 0n,
              globalPosition: 0n,
              type: e.type,
              data: e.payload,
              metadata: {},
              createdAt: new Date(e.timestamp),
            }));
          } catch (fallbackError) {
            throw new ReplayLoadError(
              `Failed to load session ${sessionId} from both Emmett and legacy persistence`,
              {
                sessionId,
                cause: fallbackError instanceof Error ? fallbackError : undefined,
              },
            );
          }
        } else {
          throw new ReplayLoadError(`Failed to load session ${sessionId}: no fallback available`, {
            sessionId,
            cause: error instanceof Error ? error : undefined,
          });
        }
      }

      if (storedEvents.length === 0) return null;

      // Convert stored events to raw events for validation
      const rawEvents: RawVersionedEvent[] = emmettEventsToRawVersionedEvents(
        storedEvents,
        sessionId,
      );

      // Migrate and validate events
      const validationResult = migrateAndValidateEventBatch(rawEvents, {
        strict: false,
        logErrors: true,
        targetVersion: 1,
      });

      // If all events failed validation, return null (no valid session)
      // This handles cases where events are malformed or from incompatible schema versions
      if (validationResult.events.length === 0) {
        return null;
      }

      const { events } = validationResult;

      // Find session start event to determine type
      const startEvent = events.find(
        (e) =>
          e.type === 'SESSION_STARTED' ||
          e.type === 'RECALL_SESSION_STARTED' ||
          e.type === 'FLOW_SESSION_STARTED' ||
          e.type === 'DUAL_PICK_SESSION_STARTED' ||
          e.type === 'MOT_SESSION_STARTED',
      );

      if (!startEvent) return null;

      // Find session end event for duration
      const endEvent = events.find(
        (e) =>
          e.type === 'SESSION_ENDED' ||
          e.type === 'RECALL_SESSION_ENDED' ||
          e.type === 'FLOW_SESSION_ENDED' ||
          e.type === 'DUAL_PICK_SESSION_ENDED' ||
          e.type === 'MOT_SESSION_ENDED',
      ) as SessionEndEvent | undefined;

      const lastEvent = events[events.length - 1];
      const totalDurationMs = endEvent
        ? endEvent.timestamp - startEvent.timestamp
        : lastEvent
          ? lastEvent.timestamp - startEvent.timestamp
          : 0;

      const createdAt = new Date(startEvent.timestamp);

      // Check if trajectory data is available (for Flow/Recall/DualPick sessions)
      const hasTrajectoryData = events.some(
        (e) =>
          (e.type === 'FLOW_DROP_ATTEMPTED' && 'trajectory' in e && e.trajectory != null) ||
          (e.type === 'RECALL_PICKED' && 'trajectory' in e && e.trajectory != null) ||
          (e.type === 'DUAL_PICK_DROP_ATTEMPTED' && 'trajectory' in e && e.trajectory != null),
      );

      // Build session based on type
      if (startEvent.type === 'FLOW_SESSION_STARTED') {
        const flowStart = startEvent as unknown as FlowSessionStartEvent;
        const config: PlaceSessionConfig = {
          nLevel: flowStart.config.nLevel,
          activeModalities: flowStart.config.activeModalities as readonly ('position' | 'audio')[],
          trialsCount: flowStart.config.trialsCount,
          stimulusDurationMs: flowStart.config.stimulusDurationMs,
          placementOrderMode: flowStart.config.placementOrderMode,
        };

        const replaySession = {
          sessionId,
          sessionType: 'flow',
          nLevel: config.nLevel,
          createdAt,
          events,
          totalDurationMs,
          activeModalities: [...config.activeModalities],
          hasTrajectoryData,
          config,
        } satisfies ReplayPlaceSession;
        cacheSet(sessionId, replaySession);
        return replaySession;
      }

      if (startEvent.type === 'RECALL_SESSION_STARTED') {
        const recallStart = startEvent as unknown as RecallSessionStartEvent;
        const replaySession = {
          sessionId,
          sessionType: 'recall',
          nLevel: recallStart.config.nLevel,
          createdAt,
          events,
          totalDurationMs,
          activeModalities: [...recallStart.config.activeModalities],
          hasTrajectoryData,
          config: recallStart.config,
        } satisfies ReplayMemoSession;
        cacheSet(sessionId, replaySession);
        return replaySession;
      }

      if (startEvent.type === 'DUAL_PICK_SESSION_STARTED') {
        const dlStart = startEvent as unknown as DualPickSessionStartEvent;
        const replaySession = {
          sessionId,
          sessionType: 'dual-pick',
          nLevel: dlStart.config.nLevel,
          createdAt,
          events,
          totalDurationMs,
          activeModalities: [...dlStart.config.activeModalities],
          hasTrajectoryData,
          config: dlStart.config,
        } satisfies ReplayDualPickSession;
        cacheSet(sessionId, replaySession);
        return replaySession;
      }

      if (startEvent.type === 'MOT_SESSION_STARTED') {
        const motStart = startEvent as unknown as MotSessionStartEvent;
        const replaySession = {
          sessionId,
          sessionType: 'track',
          nLevel: motStart.config.targetCount,
          createdAt,
          events,
          totalDurationMs,
          activeModalities: ['position'],
          hasTrajectoryData: true,
          config: motStart.config,
        } satisfies ReplayTrackSession;
        cacheSet(sessionId, replaySession);
        return replaySession;
      }

      // Default: Tempo session
      const tempoStart = startEvent as unknown as SessionStartEvent;
      const config: BlockConfig =
        tempoStart.config ??
        ({
          nLevel: tempoStart.nLevel ?? 2,
          trialsCount: 20,
          intervalSeconds: 2.5,
          stimulusDurationSeconds: 0.5,
          activeModalities: ['position', 'audio'],
          targetProbability: 0.3,
          lureProbability: 0,
          generator: 'BrainWorkshop',
        } as BlockConfig);

      const replaySession = {
        sessionId,
        sessionType: 'tempo',
        nLevel: config.nLevel,
        createdAt,
        events,
        totalDurationMs,
        activeModalities: [...config.activeModalities],
        hasTrajectoryData: false, // Tempo doesn't have trajectory data
        config,
      } satisfies ReplayTempoSession;
      cacheSet(sessionId, replaySession);
      return replaySession;
    },

    async hasReplayData(sessionId: string): Promise<boolean> {
      if (cache.has(sessionId)) return true;

      // Stream ID format for sessions: "session:{sessionId}"
      const streamId: StreamId = { aggregateType: 'session', aggregateId: sessionId };

      try {
        const result = await eventReader.readStream({
          streamId,
          maxCount: 1n, // Only need first event to check existence
        });

        if (result.streamExists && result.events.length > 0) {
          const firstEvent = result.events[0];
          // Already checked length > 0, but use optional chaining for type safety
          return (
            firstEvent?.type === 'SESSION_STARTED' ||
            firstEvent?.type === 'RECALL_SESSION_STARTED' ||
            firstEvent?.type === 'FLOW_SESSION_STARTED' ||
            firstEvent?.type === 'DUAL_PICK_SESSION_STARTED' ||
            firstEvent?.type === 'MOT_SESSION_STARTED'
          );
        }
      } catch {
        // Ignore errors, try fallback
      }

      // Fallback to legacy persistence for sessions not yet in Emmett
      if (fallbackPersistence) {
        try {
          const legacyEvents = await fallbackPersistence.getSession(sessionId);
          return legacyEvents.some(
            (e) =>
              e.type === 'SESSION_STARTED' ||
              e.type === 'RECALL_SESSION_STARTED' ||
              e.type === 'FLOW_SESSION_STARTED' ||
              e.type === 'DUAL_PICK_SESSION_STARTED' ||
              e.type === 'MOT_SESSION_STARTED',
          );
        } catch {
          return false;
        }
      }

      return false;
    },
  };
}

// =============================================================================
// Public Factory Functions
// =============================================================================

/**
 * Create a replay adapter using the Emmett Event Store.
 *
 * @param eventStore - Emmett event store for reading session streams
 * @param fallbackPersistence - Optional persistence for sessions not yet in Emmett
 */
export function createReplayAdapter(
  eventStore: EventStreamReader,
  fallbackPersistence?: Pick<PersistencePort, 'getSession'>,
): ReplayPort {
  return createReplayAdapterImpl(eventStore, fallbackPersistence);
}

/**
 * Wrap CommandBusPort.readStream to match EventStreamReader interface.
 * CommandBusPort returns `events: readonly unknown[]`, so we need to cast.
 */
function createEventStreamReaderFromCommandBus(commandBus: CommandBusPort): EventStreamReader {
  return {
    async readStream(args) {
      if (!commandBus.readStream) {
        throw new Error('[ReplayAdapter] CommandBus does not support readStream');
      }
      const result = await commandBus.readStream(args);
      // Cast unknown[] to EmmettStoredEvent[] - we trust the CommandBus implementation
      return {
        currentStreamVersion: result.currentStreamVersion,
        streamExists: result.streamExists,
        events: result.events as readonly EmmettStoredEvent[],
      };
    },
  };
}

/**
 * Create a replay adapter using the CommandBus.
 * This is the preferred factory for UI integration.
 *
 * @param commandBus - Command bus with readStream capability
 * @param fallbackPersistence - Optional persistence for sessions not yet in Emmett
 */
export function createReplayAdapterFromCommandBus(
  commandBus: CommandBusPort,
  fallbackPersistence?: Pick<PersistencePort, 'getSession'>,
): ReplayPort {
  if (!commandBus.readStream) {
    // CommandBus doesn't support readStream (noop adapters before persistence init)
    // Return null adapter - replay will be available once persistence is ready
    return {
      async getSessionForReplay(): Promise<ReplaySession | null> {
        return null;
      },
      async hasReplayData(): Promise<boolean> {
        return false;
      },
    };
  }

  const eventReader = createEventStreamReaderFromCommandBus(commandBus);
  return createReplayAdapterImpl(eventReader, fallbackPersistence);
}

// Re-export error types for convenience
export { ReplayLoadError, ReplayDataError, ReplayProjectionError, ReplayError } from './errors';
