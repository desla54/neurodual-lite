import type { ReplayRecoveryPort } from '@neurodual/logic';
import {
  buildRecoveredReplayState,
  checkForRecoverableReplay,
  clearReplayRecoverySnapshot,
  createReplayRecoverySnapshot,
  installReplayRecoveryHandlers,
  saveReplayRecoverySnapshot,
} from '../lifecycle/replay-recovery';

export const replayRecoveryAdapter: ReplayRecoveryPort = {
  saveReplayRecoverySnapshot,
  clearReplayRecoverySnapshot,
  checkForRecoverableReplay,
  createReplayRecoverySnapshot,
  installReplayRecoveryHandlers,
  buildRecoveredReplayState,
};
