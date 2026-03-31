/**
 * NeurodualQueryProvider
 *
 * Unified provider that sets up TanStack Query with all adapters.
 * Replaces the deep nesting of individual context providers.
 */

import { QueryClientProvider } from '@tanstack/react-query';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type {
  AuthPort,
  HistoryPort,
  JourneyConfig,
  JourneyPort,
  LicensePort,
  PaymentPort,
  ProfilePort,
  ProgressionPort,
  ReadModelPort,
  RewardPort,
  SessionEndPipelinePort,
  SubscriptionPort,
  SyncPort,
} from '@neurodual/logic';
import { createQueryClient, setQueryClient } from './query-client';
import { setAuthAdapter } from './auth';
import { setHistoryAdapter } from './history';
import { setPaymentAdapter, setupPaymentListener } from './payment';
import { setPipelineAdapter } from './pipeline';
import { setProfileAdapter } from './profile';
import { setProgressionAdapter } from './progression';
import { setRewardAdapter } from './reward';
import { setSubscriptionAdapter } from './subscription';
import { setSyncAdapter } from './sync';
import { setJourneyAdapter } from './journey';
import { setLicenseAdapter, setupLicenseListener } from './license';
import { setReadModelsAdapter, setProfileReadModel, setJourneyReadModel } from './read-models';
import { createProfileReadModel, createJourneyReadModel } from '@neurodual/infra';
// Zustand stores are deprecated - TanStack Query handles all data fetching now
import { queryKeys } from './keys';
import { JourneyConfigProvider } from '../context/JourneyConfigContext';

// =============================================================================
// Types
// =============================================================================

export interface NeurodualQueryProviderProps {
  children: ReactNode;
  adapters: {
    auth: AuthPort;
    history: HistoryPort;
    journey: JourneyPort;
    readModels: ReadModelPort;
    /** License key validation (web only - Lemon Squeezy) */
    license?: LicensePort;
    payment: PaymentPort;
    /** Session completion pipeline (XState-based) - optional, enables robust session completion */
    pipeline?: SessionEndPipelinePort;
    profile: ProfilePort;
    progression: ProgressionPort;
    reward: RewardPort;
    subscription: SubscriptionPort;
    sync: SyncPort;
  };
  /** Initial journey configuration (from settings) */
  journeyConfig: JourneyConfig;
}

// =============================================================================
// Provider
// =============================================================================

export function NeurodualQueryProvider({
  children,
  adapters,
  journeyConfig,
}: NeurodualQueryProviderProps): ReactNode {
  // Create QueryClient once AND initialize TanStack Query adapters synchronously.
  // This MUST happen before children render (some hooks throw if adapters aren't set).
  //
  // IMPORTANT: The QueryClient must remain stable. Recreating it on prop changes
  // (e.g., when `journeyConfig` changes) will drop cache, subscriptions, and in-flight state.
  const queryClientRef = useRef<ReturnType<typeof createQueryClient> | null>(null);
  const prevAdaptersRef = useRef<NeurodualQueryProviderProps['adapters'] | null>(null);
  if (!queryClientRef.current) {
    const client = createQueryClient();
    queryClientRef.current = client;
    setQueryClient(client);
  }
  const prevAdapters = prevAdaptersRef.current;
  const adaptersChanged =
    !prevAdapters ||
    prevAdapters.auth !== adapters.auth ||
    prevAdapters.history !== adapters.history ||
    prevAdapters.journey !== adapters.journey ||
    prevAdapters.readModels !== adapters.readModels ||
    prevAdapters.payment !== adapters.payment ||
    prevAdapters.profile !== adapters.profile ||
    prevAdapters.progression !== adapters.progression ||
    prevAdapters.reward !== adapters.reward ||
    prevAdapters.subscription !== adapters.subscription ||
    prevAdapters.sync !== adapters.sync ||
    prevAdapters.license !== adapters.license ||
    prevAdapters.pipeline !== adapters.pipeline;

  if (adaptersChanged) {
    // Initialize/update all TanStack Query adapters synchronously.
    // This must happen before children render so hooks always read the latest adapters.
    setAuthAdapter(adapters.auth);
    setHistoryAdapter(adapters.history);
    setJourneyAdapter(adapters.journey);
    setReadModelsAdapter(adapters.readModels);
    setProfileReadModel(createProfileReadModel(adapters.readModels));
    setJourneyReadModel(createJourneyReadModel(adapters.readModels));
    if (adapters.license && prevAdapters?.license !== adapters.license) {
      setLicenseAdapter(adapters.license);
    }
    setPaymentAdapter(adapters.payment);
    if (adapters.pipeline && prevAdapters?.pipeline !== adapters.pipeline) {
      setPipelineAdapter(adapters.pipeline);
    }
    setProfileAdapter(adapters.profile);
    setProgressionAdapter(adapters.progression);
    setRewardAdapter(adapters.reward);
    setSubscriptionAdapter(adapters.subscription);
    setSyncAdapter(adapters.sync);
    prevAdaptersRef.current = adapters;
  }
  const queryClient = queryClientRef.current;

  // Subscribe to external adapters and invalidate TanStack queries when they change
  // This bridges adapter listeners → TanStack Query reactivity
  useEffect(() => {
    // Auth adapter → invalidate auth queries
    const unsubscribeAuth = adapters.auth.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    });

    // Subscription adapter → invalidate subscription queries
    const unsubscribeSubscription = adapters.subscription.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      // Also invalidate sync since it depends on subscription (cloud sync access)
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
    });

    // Sync adapter → update cache directly for efficiency
    // setQueryData is faster than invalidateQueries since we have the exact data
    const unsubscribeSync = adapters.sync.subscribe((newState) => {
      // Update cache directly instead of invalidating (more efficient)
      queryClient.setQueryData(queryKeys.sync.state(), newState);

      // NOTE: forceRefresh() was removed - it caused double work with PowerSync.
      // PowerSync watched queries (useSessionsQuery) auto-update when SQLite changes.
      // Profile/Journey/Progression derive from sessions via useMemo, so they update instantly.
      // Manual forceRefresh() after sync was redundant and caused main thread freezes.
    });

    // Reward adapter → invalidate reward queries on state changes
    // Note: Mutations also invalidate in onSuccess, but this handles non-mutation changes
    // (init, background sync, etc.). TanStack Query deduplicates multiple invalidations.
    // The adapter uses setTimeout(0) + re-entrant protection to prevent infinite loops.
    const unsubscribeReward = adapters.reward.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    });

    // NOTE: Profile and Progression reactivity is now handled by PowerSync via useSessionsQuery().
    // Profile and Progression states are computed from sessions using projectProfileFromSessions()
    // and projectProgressionFromSessions(). They auto-update when session_summaries table changes.
    // No manual subscription needed - the useMemo in useProfileQuery/useProgressionQuery
    // recalculates when useSessionsQuery() data changes.

    // NOTE: Journey reactivity is now handled by PowerSync via useSessionsQuery().
    // Journey state is computed from sessions in useJourneyState(), which auto-updates
    // when session_summaries table changes. No manual subscription needed.

    // Payment adapter → sync RevenueCat listener with TanStack Query cache
    // This updates customerInfo in cache directly when RevenueCat notifies of changes
    const unsubscribePayment = setupPaymentListener(queryClient);

    // License adapter → sync Lemon Squeezy listener with TanStack Query cache (web only)
    const unsubscribeLicense = adapters.license ? setupLicenseListener(queryClient) : () => {};

    // NOTE: History reactivity is now handled by PowerSync native useQuery with rowComparator.
    // No manual subscription/invalidation needed - PowerSync watched queries auto-update.
    // See packages/ui/src/queries/history.ts for the implementation.

    return () => {
      unsubscribeAuth();
      unsubscribeSubscription();
      unsubscribeSync();
      unsubscribeReward();
      unsubscribePayment();
      unsubscribeLicense();
    };
  }, [
    adapters.auth,
    adapters.license,
    adapters.subscription,
    adapters.sync,
    adapters.reward,
    adapters.payment,
    queryClient,
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <JourneyConfigProvider config={journeyConfig}>{children}</JourneyConfigProvider>
    </QueryClientProvider>
  );
}
