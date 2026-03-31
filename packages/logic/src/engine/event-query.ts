import type { GameEventType } from './events';

export interface EventQuery {
  sessionId?: string;
  type?: GameEventType | GameEventType[];
  after?: number;
  before?: number;
}
