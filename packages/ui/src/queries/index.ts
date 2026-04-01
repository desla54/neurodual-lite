/**
 * TanStack Query Hooks
 *
 * Centralized exports for all query hooks.
 * This replaces manual Context subscriptions with TanStack Query.
 */

// Query keys
export { queryKeys, type QueryKeys } from './keys';

// Admin (web-only screens)
export {
  useAdminRecentSessionHealthQuery,
  type AdminRecentSessionHealthRowDb,
} from './admin-health';

// Query client
export { createQueryClient, getQueryClient, setQueryClient } from './query-client';

// Re-export TanStack Query utilities for convenience
export {
  useQueryClient,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

// Sync queries
export {
  setSyncAdapter,
  getSyncAdapter,
  useSyncQuery,
  useUnsyncedEvents,
  useSyncEvents,
  useSetAutoSync,
  useIsSyncAvailable,
  useIsSyncing,
  usePendingCount,
  invalidateSyncQueries,
  // Force full resync mutation
  setForceFullResyncFn,
  useForceFullResync,
  type ForceResyncResult,
} from './sync';

// Stats sharing mutations
export {
  setStatsAdapter,
  useSubmitStats,
  type SubmitStatsResult,
  type SubmitStatsInput,
} from './stats-sharing';

// Data management mutations
export {
  setDataManagementAdapter,
  useDeleteAllData,
  type DeleteDataResult,
} from './data-management';

// Auth queries
export {
  setAuthAdapter,
  getAuthAdapter,
  useAuthQuery,
  useIsAuthenticated,
  useCurrentUser,
  useUserProfile,
  useSignUp,
  useSignIn,
  useSignInWithGoogle,
  useSignInWithApple,
  useSignOut,
  useUpdateProfile,
  useResetPassword,
  useUpdatePassword,
  useRefreshSession,
  useValidateSession,
  invalidateAuthQueries,
} from './auth';

// Progression queries (PowerSync reactive - INSTANT updates for core progression)
export {
  setProgressionAdapter,
  getProgressionAdapter,
  useProgressionQuery,
  useBadgesQuery,
} from './progression';

// History queries (TanStack Query + PowerSync)
export {
  setHistoryAdapter,
  getHistoryAdapter,
  getOptionalHistoryAdapter,
  useAvailableJourneyIdsQuery,
  useSessionSummariesCountQuery,
  useSessionSummariesFilteredCountQuery,
  useSessionSummariesHeaderCountsQuery,
  useMaxAchievedLevelForModeQuery,
  useLatestStatsGameModeQuery,
  useJourneyRecordableSessionsQuery,
  useSessionSummariesPageQuery,
  type SessionSummariesCursor,
  type SessionSummariesFilters,
  useSessionsQuery,
  useSessionDetailsQuery,
  useSessionStoredReportQuery,
  useLatestJourneySessionQuery,
  useSessionSummariesQuery,
  useSessionsSuspenseQuery,
  useSessionCount,
  useSessionsByGameMode,
  useJourneySessions,
  useSessionById,
  useLastAdaptiveDPrime,
  useRecentSessionsForTrendQuery,
  useBrainWorkshopStrikes,
  useBrainWorkshopStrikesBySessionId,
  useDeleteSession,
  useDeleteSessions,
  useExportSessions,
  useImportSessions,
  useHistoryIsReady,
} from './history';

// Replay queries (PowerSync reactive)
export { useReplayRunsQuery, useReplayRunEventsQuery } from './replay';
export {
  DEFAULT_STATS_DATA,
  createStatsDataQueryOptions,
  createStatsFiltersSignature,
  useStatsDataQuery,
  type StatsData,
} from './stats';

// Profile queries (PowerSync reactive - INSTANT updates)
export {
  setProfileAdapter,
  getProfileAdapter,
  useProfileQuery,
} from './profile';

// Challenge queries (PowerSync reactive - INSTANT updates)
export { useChallenge20Query } from './challenge';

// Subscription queries
export {
  setSubscriptionAdapter,
  getSubscriptionAdapter,
  useSubscriptionQuery,
  useHasPremiumAccess,
  useHasCloudSync,
  useIsTrialing,
  useDaysRemaining,
  useCanAccessNLevel,
  useRefreshSubscription,
  invalidateSubscriptionQueries,
} from './subscription';

export { useDailyPlaytimeGate, type DailyPlaytimeGate } from './daily-playtime-gate';

// Realtime integration (auth only)
export { invalidateAfterLogin, invalidateAfterLogout } from './realtime';


// Pipeline queries (XState-based session completion)
export {
  setPipelineAdapter,
  getPipelineAdapter,
  hasPipelineAdapter,
  usePipelineState,
  usePipelineStage,
  usePipelineIsRunning,
  usePipelineError,
  useCompleteSession,
  usePipelineRetry,
  usePipelineCancel,
  usePipelineRecover,
  type SessionCompletionResultWithLevel,
  type CompleteSessionOptions,
} from './pipeline';

// Premium queries (activation code system)
export {
  setPremiumAdapter,
  getPremiumAdapter,
  usePremiumState,
  useIsPremium,
  useCanAccessNLevel as usePremiumCanAccessNLevel,
  useActivateCode,
  useDeactivateDevice,
  useVerifyPremium,
  setupPremiumListener,
  invalidatePremiumQueries,
} from './premium';

// Provider
export { NeurodualQueryProvider, type NeurodualQueryProviderProps } from './NeurodualQueryProvider';
