import type { SessionCompletionWithXPResult } from '../engine/session-completion-projector';
import type { JourneyMeta } from '../types/journey';
import type { HistoryPort } from './history-port';

// Stub types - journey-port deleted
type AttemptResult = { readonly success: boolean };
type JourneyPort = Record<string, unknown>;
import type { PersistencePort } from './persistence-port';
import type { ProgressionPort } from './progression-port';
import type { PersistedPipelineState, SessionEndPipelinePort } from './session-end-pipeline-port';

export interface PipelineRecoveryStoragePort {
  save(state: PersistedPipelineState): Promise<void>;
  load(): Promise<PersistedPipelineState | null>;
  clear(): Promise<void>;
}

export interface CreateSessionPipelineOptions {
  historyAdapter: HistoryPort;
  progressionAdapter: ProgressionPort;
  journeyAdapter?: JourneyPort;

  persistence?: PersistencePort | null;
  getActiveUserIdForPersistence?: () => string;

  recoveryStorage: PipelineRecoveryStoragePort;

  syncToCloud?: (sessionId: string) => Promise<void>;
  recordJourneyAttempt?: (
    stageId: number,
    result: SessionCompletionWithXPResult,
    journeyMeta: JourneyMeta,
  ) => Promise<AttemptResult | null>;
  checkAndGrantRewards?: (level: number) => Promise<void>;
  maxRetries?: number;
}

export interface SessionPipelineFactoryPort {
  create(options: CreateSessionPipelineOptions): SessionEndPipelinePort;
}
