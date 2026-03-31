import type {
  ReplayRecoveryCheckResult,
  ReplayRecoverySnapshot,
  RecoveredReplayState,
} from '../types/recovery';
import type { ReplayInteractifPort } from './replay-interactif-port';

export interface CreateReplayRecoverySnapshotParams {
  runId: string;
  sessionId: string;
  sessionType: ReplayRecoverySnapshot['sessionType'];
  parentRunId: string | null;
  currentTimeMs: number;
  currentTrialIndex: number;
  speed: 0.5 | 1 | 2;
}

export interface ReplayRecoveryPort {
  saveReplayRecoverySnapshot(snapshot: ReplayRecoverySnapshot): void;
  clearReplayRecoverySnapshot(): void;
  checkForRecoverableReplay(): ReplayRecoveryCheckResult;
  createReplayRecoverySnapshot(params: CreateReplayRecoverySnapshotParams): ReplayRecoverySnapshot;
  installReplayRecoveryHandlers(getSnapshot: () => ReplayRecoverySnapshot | null): () => void;
  buildRecoveredReplayState(adapter: ReplayInteractifPort): Promise<RecoveredReplayState | null>;
}
