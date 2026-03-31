/**
 * useSessionDecider — React hook that wraps a SessionDecider + EventEnvelopeFactory.
 *
 * Provides: state, dispatch, sessionId, events[], reset.
 * On dispatch: decide → materialize drafts → persist via commandBus → update React state.
 *
 * Event type → command type mapping (mirrors session-event-utils.ts):
 *   *_STARTED → SESSION/START
 *   *_ENDED   → SESSION/END
 *   else      → SESSION/RECORD_EVENTS_BATCH
 */

import { useCallback, useRef, useState } from 'react';
import type {
  SessionDecider,
  SessionEventDraft,
  SessionCompletionDraft,
  DeciderTransition,
  ClockPort,
  RandomPort,
  CommandBusPort,
} from '@neurodual/logic';
import {
  createEnvelopeFactory,
  type EventEnvelopeFactory,
  type MaterializedEvent,
} from '@neurodual/logic';

// =============================================================================
// Options
// =============================================================================

export interface UseSessionDeciderOptions<
  TState,
  TAction,
  TConfig,
  TEventDraft extends SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft,
> {
  readonly decider: SessionDecider<TState, TAction, TConfig, TEventDraft, TCompletionDraft>;
  readonly config: TConfig;
  readonly userId: string;
  readonly sessionId: string;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly commandBus: CommandBusPort;
  readonly onCompletion?: (
    completionDraft: TCompletionDraft,
    events: readonly MaterializedEvent<TEventDraft>[],
  ) => void;
}

// =============================================================================
// Result
// =============================================================================

export interface UseSessionDeciderResult<TState, TAction, TEventDraft extends SessionEventDraft> {
  readonly state: TState;
  readonly dispatch: (action: TAction) => DeciderTransition<TState, TEventDraft>;
  readonly sessionId: string;
  readonly events: readonly MaterializedEvent<TEventDraft>[];
  readonly reset: () => void;
}

// =============================================================================
// Command type mapping
// =============================================================================

function eventTypeToCommandType(eventType: string): string {
  if (eventType.endsWith('_STARTED')) return 'SESSION/START';
  if (eventType.endsWith('_ENDED')) return 'SESSION/END';
  return 'SESSION/RECORD_EVENTS_BATCH';
}

function makeCommandId(eventType: string, sessionId: string, eventId: string): string {
  if (eventType.endsWith('_STARTED')) return `start:${sessionId}`;
  if (eventType.endsWith('_ENDED')) return `end:${sessionId}`;
  return `evt:${eventId}`;
}

// =============================================================================
// Hook
// =============================================================================

export function useSessionDecider<
  TState,
  TAction,
  TConfig,
  TEventDraft extends SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft,
>(
  options: UseSessionDeciderOptions<TState, TAction, TConfig, TEventDraft, TCompletionDraft>,
): UseSessionDeciderResult<TState, TAction, TEventDraft> {
  const { decider, config, userId, sessionId, clock, random, commandBus, onCompletion } = options;

  const [state, setState] = useState<TState>(() => decider.initialState());
  const eventsRef = useRef<MaterializedEvent<TEventDraft>[]>([]);
  const [events, setEvents] = useState<readonly MaterializedEvent<TEventDraft>[]>([]);

  const factoryRef = useRef<EventEnvelopeFactory>(
    createEnvelopeFactory({ sessionId, userId, clock, random }),
  );

  const dispatch = useCallback(
    (action: TAction): DeciderTransition<TState, TEventDraft> => {
      const transition = decider.decide(state, action, config);

      // Materialize drafts
      const materialized = transition.eventDrafts.map((draft) =>
        factoryRef.current.materialize(draft),
      );

      // Accumulate events
      if (materialized.length > 0) {
        eventsRef.current = [...eventsRef.current, ...materialized];
        setEvents(eventsRef.current);
      }

      // Persist via commandBus
      for (const event of materialized) {
        const commandType = eventTypeToCommandType(event.type);
        const commandId = makeCommandId(event.type, sessionId, event.eventId);

        commandBus
          .handle({
            type: commandType,
            data: {
              sessionId,
              event,
            },
            metadata: {
              commandId,
              timestamp: new Date(),
              correlationId: sessionId,
            },
          })
          .catch((err: unknown) => {
            console.error(`[useSessionDecider] Failed to persist ${event.type}:`, err);
          });
      }

      // Update React state
      setState(transition.state);

      // Completion callback
      if (transition.completionDraft && onCompletion) {
        onCompletion(transition.completionDraft, eventsRef.current);
      }

      return transition as DeciderTransition<TState, TEventDraft>;
    },
    [state, decider, config, sessionId, commandBus, onCompletion],
  );

  const reset = useCallback(() => {
    setState(decider.initialState());
    eventsRef.current = [];
    setEvents([]);
    factoryRef.current = createEnvelopeFactory({ sessionId, userId, clock, random });
  }, [decider, sessionId, userId, clock, random]);

  return { state, dispatch, sessionId, events, reset };
}
