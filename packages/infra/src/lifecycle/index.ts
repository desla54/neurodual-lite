/**
 * Lifecycle Module
 *
 * Services for application lifecycle management:
 * - Disposal Registry (cleanup on logout/unmount)
 * - Session Recovery (page refresh resilience)
 */

export {
  registerDisposal,
  unregisterDisposal,
  disposeAll,
  getDisposalCount,
  type DisposalCallback,
} from './disposal-registry';

export {
  saveRecoverySnapshot,
  loadRecoverySnapshot,
  clearRecoverySnapshot,
  clearAllRecoveryData,
  checkForRecoverableSession,
  hasRecoverySnapshot,
  createRecoverySnapshot,
  installRecoveryHandlers,
  buildRecoveredState,
} from './session-recovery';

export {
  saveTutorialRecoverySnapshot,
  loadTutorialRecoverySnapshot,
  clearTutorialRecoverySnapshot,
  checkForRecoverableTutorial,
  createTutorialRecoverySnapshot,
} from './tutorial-recovery';

export {
  saveReplayRecoverySnapshot,
  loadReplayRecoverySnapshot,
  clearReplayRecoverySnapshot,
  checkForRecoverableReplay,
  hasReplayRecoverySnapshot,
  createReplayRecoverySnapshot,
  installReplayRecoveryHandlers,
  buildRecoveredReplayState,
  cleanupOrphanedRuns,
} from './replay-recovery';

export {
  AppLifecycleAdapter,
  appMachine,
  type AppLifecycleInput,
} from './app-lifecycle-machine';

export {
  PersistenceLifecycleAdapter,
  persistenceMachine,
  type PersistenceInput,
} from './persistence-lifecycle-machine';

export {
  createPersistenceAdapter,
  getPersistenceAdapter,
  resetPersistenceAdapter,
} from './persistence-adapter-factory';

export {
  createPlatformLifecycleSource,
  WebPlatformLifecycleSource,
  MobilePlatformLifecycleSource,
} from './platform-lifecycle-source';

export {
  NetworkLifecycleAdapter,
  networkMachine,
  getNetworkAdapter,
  resetNetworkAdapter,
} from './network-lifecycle-machine';

export { DeepLinkHandler, setupDeepLinkHandler } from './deep-link-handler';
