import type { EventQuery } from '../engine/event-query';
import type { GameEvent } from '../engine/events';
import type { PersistencePort } from './persistence-port';

export interface EventReaderPort {
  getSessionEvents(sessionId: string): Promise<readonly GameEvent[]>;
  queryEvents(query?: EventQuery): Promise<readonly GameEvent[]>;
  getAllEvents(): Promise<readonly GameEvent[]>;
  getSessionProjectorEvents(sessionId: string): Promise<readonly unknown[]>;
}

export interface EventReaderFactoryPort {
  create(persistence: PersistencePort): EventReaderPort;
}
