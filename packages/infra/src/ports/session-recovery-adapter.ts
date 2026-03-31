import type { SessionRecoveryPort } from '@neurodual/logic';
import {
  buildRecoveredState,
  checkForRecoverableSession,
  clearRecoverySnapshot,
  createRecoverySnapshot,
  installRecoveryHandlers,
  saveRecoverySnapshot,
} from '../lifecycle/session-recovery';

export const sessionRecoveryAdapter: SessionRecoveryPort = {
  saveRecoverySnapshot,
  clearRecoverySnapshot,
  checkForRecoverableSession,
  createRecoverySnapshot,
  installRecoveryHandlers,
  buildRecoveredState,
};
