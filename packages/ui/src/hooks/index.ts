/**
 * Hooks
 *
 * React hooks for connecting UI to logic.
 */

export {
  useGameSession,
  type UseGameSessionResult,
  type GameSessionLike,
} from './use-game-session';
export {
  useGameSessionMachine,
  type UseGameSessionMachineResult,
} from './use-game-session-machine';
export { useHistoryStats } from './use-history-stats';
export { useProgression, type UseProgressionReturn } from './use-progression';
export { useUserProfile, type UseUserProfileReturn } from './use-user-profile';
export { useEffectiveUserId } from './use-effective-user-id';
export {
  useRewardDetection,
  useNextReward,
  type NewlyGrantedReward,
  type UseRewardDetectionReturn,
} from './use-reward-detection';
export {
  useSessionCompletion,
  type SessionCompletionResultWithLevel,
  type UseSessionCompletionOptions,
  type UseSessionCompletionReturn,
} from './use-session-completion';
export {
  useTurnsLoader,
  type TurnsLoaderState,
  type TurnsLoaderResult,
} from './use-turns-loader';
export {
  useSessionRuns,
  useMultipleSessionRuns,
  type SessionRunsState,
} from './use-session-runs';
export {
  usePowerSyncStatus,
  usePowerSyncConnected,
  usePowerSyncSyncing,
  type PowerSyncStatusInfo,
} from './use-powersync-status';
export {
  useGameControls,
  type UseGameControlsOptions,
  type UseGameControlsReturn,
  type GameDispatch,
  type GameDispatchEvent,
  type InputMethod,
  type ButtonPosition,
  type TranslationFn,
} from './use-game-controls';
export {
  useSessionDecider,
  type UseSessionDeciderOptions,
  type UseSessionDeciderResult,
} from './use-session-decider';
export { useBadgeTranslation } from './use-badge-translation';
export { useGameModeTranslation } from './use-game-mode-translation';
export { useMountEffect } from './use-mount-effect';
export {
  useScrollHints,
  type UseScrollHintsOptions,
  type UseScrollHintsReturn,
} from './use-scroll-hints';
