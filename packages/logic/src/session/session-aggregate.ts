/**
 * Session Aggregate - Evolve Functions
 *
 * Fonctions pour reconstruire l'état d'un agrégat session à partir de ses événements.
 * Utilisé par EmmettEventStore.aggregateStream pour la réparation et la lecture.
 */

// Import AppendEvent type - minimal definition since this is in the logic layer
export interface AppendEvent {
  eventId: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * État agrégé d'une session.
 * Représente l'état courant après application de tous les événements.
 */
export interface SessionAggregateState {
  sessionId: string;
  status: 'idle' | 'active' | 'completed' | 'aborted';
  startTime?: Date;
  endTime?: Date;
  startEventId?: string;
  endEventId?: string;
  eventCount: number;
}

/**
 * État initial d'un agrégat session.
 */
export const initialSessionAggregateState = (): SessionAggregateState => ({
  sessionId: '',
  status: 'idle',
  eventCount: 0,
});

/**
 * Fonction evolve pour les événements de session.
 * Applique chaque événement à l'état pour produire le nouvel état.
 */
export function evolveSessionAggregate(
  state: SessionAggregateState,
  event: AppendEvent,
): SessionAggregateState {
  const eventType = event.type;

  // Session started
  if (eventType.endsWith('_STARTED') || eventType === 'SESSION_STARTED') {
    return {
      ...state,
      sessionId: (event.data as { sessionId?: string }).sessionId ?? state.sessionId,
      status: 'active',
      startTime: event.data['timestamp'] ? new Date(event.data['timestamp'] as number) : new Date(),
      startEventId: event.eventId,
      eventCount: state.eventCount + 1,
    };
  }

  // Session ended
  if (eventType.endsWith('_ENDED') || eventType === 'SESSION_ENDED') {
    return {
      ...state,
      status: 'completed',
      endTime: event.data['timestamp'] ? new Date(event.data['timestamp'] as number) : new Date(),
      endEventId: event.eventId,
      eventCount: state.eventCount + 1,
    };
  }

  // Trial events - increment count but don't change status
  if (
    eventType.startsWith('TRIAL_') ||
    eventType.startsWith('FLOW_') ||
    eventType.startsWith('RECALL_') ||
    eventType.startsWith('DUAL_PICK_') ||
    eventType.startsWith('TRACE_')
  ) {
    return {
      ...state,
      eventCount: state.eventCount + 1,
    };
  }

  // Response events
  if (eventType.includes('RESPON') || eventType.includes('RESPONSE')) {
    return {
      ...state,
      eventCount: state.eventCount + 1,
    };
  }

  // Other events - just increment count
  return {
    ...state,
    eventCount: state.eventCount + 1,
  };
}

/**
 * Reconstruit l'état d'une session à partir d'une liste d'événements.
 * Version simplifiée d'aggregateStream pour usage direct.
 */
export function rebuildSessionState(events: readonly AppendEvent[]): SessionAggregateState {
  let state = initialSessionAggregateState();
  for (const event of events) {
    state = evolveSessionAggregate(state, event);
  }
  return state;
}
