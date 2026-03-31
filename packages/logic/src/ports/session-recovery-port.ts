import type {
  RecoveryCheckResult,
  RecoveredSessionState,
  SessionRecoverySnapshot,
} from '../types/recovery';
import type { PersistencePort } from './persistence-port';

export interface CreateRecoverySnapshotParams {
  sessionId: string;
  modeId: SessionRecoverySnapshot['modeId'];
  config: SessionRecoverySnapshot['config'];
  trialIndex: number;
  totalTrials: number;
  nLevel?: number;
  declaredEnergyLevel?: number;
  playMode?: SessionRecoverySnapshot['playMode'];
  journeyStageId?: number;
  journeyId?: string;
}

export interface SessionRecoveryPort {
  saveRecoverySnapshot(snapshot: SessionRecoverySnapshot): void;
  clearRecoverySnapshot(): void;
  checkForRecoverableSession(): RecoveryCheckResult;
  createRecoverySnapshot(params: CreateRecoverySnapshotParams): SessionRecoverySnapshot;
  installRecoveryHandlers(getSnapshot: () => SessionRecoverySnapshot | null): () => void;
  buildRecoveredState(persistence: PersistencePort): Promise<RecoveredSessionState | null>;
}
