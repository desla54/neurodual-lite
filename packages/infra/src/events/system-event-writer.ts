import type { CommandBusPort, GameEvent, PersistencePort } from '@neurodual/logic';
import { pipelineLog } from '../logger';

const SYSTEM_EVENT_PERSIST_TIMEOUT_MS = 8000;

let injectedPersistence: PersistencePort | null = null;
let injectedCommandBus: CommandBusPort | null = null;

export function setSystemEventWriterPersistence(persistence: PersistencePort | null): void {
  injectedPersistence = persistence;
}

export function setSystemEventWriterCommandBus(commandBus: CommandBusPort | null): void {
  injectedCommandBus = commandBus;
}

async function persistSystemEventWithTimeout(
  commandBus: CommandBusPort,
  event: GameEvent,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const commandType = (() => {
      if (event.type === 'BADGE_UNLOCKED') return 'SESSION/UNLOCK_BADGE' as const;
      if (event.type === ('XP_BREAKDOWN_COMPUTED' as GameEvent['type'])) {
        return 'SESSION/COMPUTE_XP_BREAKDOWN' as const;
      }
      throw new Error(`[SystemEventWriter] No command mapping for system event type ${event.type}`);
    })();

    const persistPromise = commandBus.handle({
      type: commandType,
      data: {
        sessionId: String(event.sessionId ?? ''),
        event,
      },
      metadata: {
        commandId: `evt:${event.id}`,
        timestamp: new Date(),
      },
    });
    const outcome = await Promise.race<
      | { readonly kind: 'ok' }
      | { readonly kind: 'error'; readonly error: unknown }
      | { readonly kind: 'timeout' }
    >([
      persistPromise.then(
        () => ({ kind: 'ok' as const }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      ),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ kind: 'timeout' as const }),
          SYSTEM_EVENT_PERSIST_TIMEOUT_MS,
        );
      }),
    ]);

    if (outcome.kind === 'ok') return;

    if (outcome.kind === 'timeout') {
      pipelineLog.warn(
        `[Pipeline] system event persist timeout after ${SYSTEM_EVENT_PERSIST_TIMEOUT_MS}ms (event=${event.type}, session=${event.sessionId})`,
      );
      void persistPromise.catch((error: unknown) => {
        pipelineLog.warn(
          `[Pipeline] system event persist failed after timeout; queueing retry (event=${event.type}, session=${event.sessionId})`,
          error,
        );
      });
      return;
    }

    pipelineLog.warn(
      `[Pipeline] system event persist failed; queueing retry (event=${event.type}, session=${event.sessionId})`,
      outcome.error,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Single entry point for pipeline/system events persistence.
 * Keeps all writes on the canonical EventStore path.
 */
export async function appendSystemEvents(events: readonly GameEvent[]): Promise<void> {
  if (events.length === 0) return;
  const persistence = injectedPersistence;
  if (!persistence) throw new Error('[Pipeline] Persistence not injected for system event writes');
  const commandBus = injectedCommandBus;
  if (!commandBus) throw new Error('[Pipeline] Command bus not injected for system event writes');

  for (let i = 0; i < events.length; i++) {
    const event = events[i] as GameEvent;
    pipelineLog.debug(
      `[Pipeline] Writing system event ${i + 1}/${events.length}: ${event.type} (session=${event.sessionId})`,
    );
    await persistSystemEventWithTimeout(commandBus, event);
  }
}
