/**
 * Shared event infrastructure for cognitive task training pages.
 *
 * Eliminates ~80 lines of duplicated boilerplate per page:
 * - EventEmitter interface
 * - getTemporalContext / getDeviceInfo / createEnvelope / persistEvent helpers
 */

import type { CommandBusPort, GameEvent, PlatformInfoPort } from '@neurodual/logic';

// =============================================================================
// EventEmitter
// =============================================================================

export interface CogTaskEventEmitter {
  sessionId: string;
  userId: string;
  seq: number;
  events: GameEvent[];
  commandBus: CommandBusPort | null;
}

interface TrialPersistQueue {
  events: Record<string, unknown>[];
  timerId: ReturnType<typeof setTimeout> | null;
  flushInFlight: Promise<void> | null;
}

// Keep writes sparse during fast tasks to reduce read-model churn on the main thread.
const TRIAL_PERSIST_BATCH_SIZE = 24;
const TRIAL_PERSIST_FLUSH_DELAY_MS = 10_000;
const trialPersistQueues = new Map<string, TrialPersistQueue>();

function isTrialLikeEventType(type: string): boolean {
  return (
    type.includes('TRIAL_') ||
    type.startsWith('FLOW_') ||
    type.startsWith('RECALL_') ||
    type.startsWith('DUAL_PICK_') ||
    type.startsWith('TRACE_') ||
    type.startsWith('OSPAN_SET')
  );
}

function getOrCreateTrialQueue(sessionId: string): TrialPersistQueue {
  const existing = trialPersistQueues.get(sessionId);
  if (existing) return existing;
  const created: TrialPersistQueue = {
    events: [],
    timerId: null,
    flushInFlight: null,
  };
  trialPersistQueues.set(sessionId, created);
  return created;
}

function clearTrialQueue(sessionId: string): void {
  const queue = trialPersistQueues.get(sessionId);
  if (!queue) return;
  if (queue.timerId) {
    clearTimeout(queue.timerId);
    queue.timerId = null;
  }
  queue.events.length = 0;
  trialPersistQueues.delete(sessionId);
}

async function flushTrialQueue(emitter: CogTaskEventEmitter): Promise<void> {
  const bus = emitter.commandBus;
  if (!bus) return;

  const queue = trialPersistQueues.get(emitter.sessionId);
  if (!queue) return;

  if (queue.timerId) {
    clearTimeout(queue.timerId);
    queue.timerId = null;
  }

  if (queue.flushInFlight) {
    await queue.flushInFlight;
    return;
  }

  const flushPromise = (async () => {
    while (queue.events.length > 0) {
      const batch = queue.events.splice(0, TRIAL_PERSIST_BATCH_SIZE);
      const first = batch[0];
      const last = batch[batch.length - 1];
      const firstId = String(first?.['id'] ?? '');
      const lastId = String(last?.['id'] ?? '');
      const commandId =
        batch.length === 1
          ? `evt:${firstId}`
          : `evtb:${emitter.sessionId}:${firstId}:${lastId}:${batch.length}`;

      await (bus.handle({
        type: 'SESSION/RECORD_EVENTS_BATCH',
        data: { sessionId: emitter.sessionId, events: batch },
        metadata: { commandId, timestamp: new Date() },
      }) as Promise<void>);

      // Yield between batches so UI frames can run if flush has a lot to persist.
      if (queue.events.length > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 0);
        });
      }
    }
  })();

  queue.flushInFlight = flushPromise;
  try {
    await flushPromise;
  } finally {
    queue.flushInFlight = null;
    if (queue.events.length === 0 && queue.timerId === null) {
      trialPersistQueues.delete(emitter.sessionId);
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

export function getTemporalContext() {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 6
      ? 'night'
      : hour < 12
        ? 'morning'
        : hour < 18
          ? 'afternoon'
          : hour < 22
            ? 'evening'
            : 'night';
  return {
    timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
    localHour: hour,
    dayOfWeek: now.getDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function getDeviceInfo(platformInfo: PlatformInfoPort) {
  const info = platformInfo.getPlatformInfo();
  return {
    platform: info.platform,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    userAgent: info.userAgent,
    touchCapable: info.touchCapable,
  };
}

export function createEnvelope(emitter: CogTaskEventEmitter) {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    id,
    timestamp: now,
    sessionId: emitter.sessionId,
    eventId: id,
    seq: emitter.seq++,
    schemaVersion: 1 as const,
    occurredAtMs: now,
    monotonicMs: performance.now(),
  };
}

export function persistEvent(
  emitter: CogTaskEventEmitter,
  event: Record<string, unknown>,
): Promise<void> {
  const bus = emitter.commandBus;
  const id = String(event['id'] ?? '');
  if (!bus || id.length === 0) return Promise.resolve();
  const type = String(event['type'] ?? '');
  if (isTrialLikeEventType(type)) {
    const queue = getOrCreateTrialQueue(emitter.sessionId);
    queue.events.push(event);

    if (queue.events.length >= TRIAL_PERSIST_BATCH_SIZE) {
      return flushTrialQueue(emitter);
    }

    if (queue.timerId === null) {
      queue.timerId = setTimeout(() => {
        const latestEmitter = emitter;
        void flushTrialQueue(latestEmitter);
      }, TRIAL_PERSIST_FLUSH_DELAY_MS);
    }
    return Promise.resolve();
  }

  const commandType = type.endsWith('_STARTED')
    ? 'SESSION/START'
    : type.endsWith('_ENDED')
      ? 'SESSION/END'
      : 'SESSION/RECORD_TRIAL';
  const commandId = type.endsWith('_ENDED')
    ? `end:${emitter.sessionId}`
    : type.endsWith('_STARTED')
      ? `start:${emitter.sessionId}`
      : `evt:${id}`;
  const writeSingleEvent = () =>
    bus.handle({
      type: commandType,
      data: { sessionId: emitter.sessionId, event },
      metadata: { commandId, timestamp: new Date() },
    }) as Promise<void>;

  if (!type.endsWith('_ENDED')) {
    return writeSingleEvent();
  }

  return flushTrialQueue(emitter)
    .catch(() => {
      // Best-effort flush: keep end event write resilient even if trial flush failed.
    })
    .then(writeSingleEvent)
    .finally(() => {
      clearTrialQueue(emitter.sessionId);
    });
}

// =============================================================================
// Builders — canonical COGNITIVE_TASK event constructors
// =============================================================================

/**
 * Build a COGNITIVE_TASK_SESSION_STARTED event.
 * Pushes to emitter.events and persists via CommandBus.
 */
export function buildStartEvent(
  emitter: CogTaskEventEmitter,
  taskType: string,
  platformInfo: PlatformInfoPort,
  config: Record<string, unknown>,
  playContext: 'journey' | 'free' = 'free',
): GameEvent {
  const evt = {
    ...createEnvelope(emitter),
    type: 'COGNITIVE_TASK_SESSION_STARTED',
    taskType,
    userId: emitter.userId,
    device: getDeviceInfo(platformInfo),
    context: getTemporalContext(),
    config,
    playContext,
  } as unknown as GameEvent;
  emitter.events.push(evt);
  void persistEvent(emitter, evt as unknown as Record<string, unknown>);
  return evt;
}

/**
 * Build a COGNITIVE_TASK_TRIAL_COMPLETED event.
 * All task-specific fields go into `condition` and `trialData`.
 */
export function buildTrialEvent(
  emitter: CogTaskEventEmitter,
  taskType: string,
  trialIndex: number,
  correct: boolean,
  responseTimeMs: number,
  condition?: string,
  trialData?: Record<string, unknown>,
): GameEvent {
  const evt = {
    ...createEnvelope(emitter),
    type: 'COGNITIVE_TASK_TRIAL_COMPLETED',
    taskType,
    trialIndex,
    correct,
    responseTimeMs: Math.round(responseTimeMs),
    ...(condition !== undefined && { condition }),
    ...(trialData !== undefined && { trialData }),
  } as unknown as GameEvent;
  emitter.events.push(evt);
  void persistEvent(emitter, evt as unknown as Record<string, unknown>);
  return evt;
}

/**
 * Build a COGNITIVE_TASK_SESSION_ENDED event.
 * `accuracy` must be 0..1 (NOT 0..100).
 * Task-specific metrics go into `metrics`.
 */
export function buildEndEvent(
  emitter: CogTaskEventEmitter,
  taskType: string,
  opts: {
    reason: 'completed' | 'abandoned';
    totalTrials: number;
    correctTrials: number;
    /** 0..1 ratio */
    accuracy: number;
    durationMs: number;
    playContext?: 'journey' | 'free';
    meanRtMs?: number;
    metrics?: Record<string, unknown>;
  },
): GameEvent {
  const evt = {
    ...createEnvelope(emitter),
    type: 'COGNITIVE_TASK_SESSION_ENDED',
    taskType,
    reason: opts.reason,
    totalTrials: opts.totalTrials,
    correctTrials: opts.correctTrials,
    accuracy: opts.accuracy,
    durationMs: opts.durationMs,
    playContext: opts.playContext ?? 'free',
    ...(opts.meanRtMs !== undefined && { meanRtMs: Math.round(opts.meanRtMs) }),
    ...(opts.metrics !== undefined && { metrics: opts.metrics }),
  } as unknown as GameEvent;
  emitter.events.push(evt);
  void persistEvent(emitter, evt as unknown as Record<string, unknown>);
  return evt;
}
