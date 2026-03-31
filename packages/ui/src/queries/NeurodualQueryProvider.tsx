/**
 * NeurodualQueryProvider (Lite)
 *
 * Unified provider that sets up TanStack Query with all adapters.
 * Cloud/payment/license/reward adapters are optional in Lite mode.
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
import { setPaymentAdapter } from './payment';
import { setPipelineAdapter } from './pipeline';
import { setProfileAdapter } from './profile';
import { setProgressionAdapter } from './progression';
import { setRewardAdapter } from './reward';
import { setSubscriptionAdapter } from './subscription';
import { setSyncAdapter } from './sync';
import { setJourneyAdapter } from './journey';
import { setLicenseAdapter } from './license';
import { setReadModelsAdapter, setProfileReadModel, setJourneyReadModel } from './read-models';
import { createProfileReadModel, createJourneyReadModel } from '@neurodual/infra';
import { queryKeys } from './keys';
import { JourneyConfigProvider } from '../context/JourneyConfigContext';

// =============================================================================
// Types
// =============================================================================

export interface NeurodualQueryProviderProps {
  children: ReactNode;
  adapters: {
    auth?: AuthPort;
    history: HistoryPort;
    journey: JourneyPort;
    readModels: ReadModelPort;
    /** License key validation (web only - Lemon Squeezy) - optional in Lite */
    license?: LicensePort;
    /** Payment adapter - optional in Lite */
    payment?: PaymentPort;
    /** Session completion pipeline (XState-based) - optional */
    pipeline?: SessionEndPipelinePort;
    profile: ProfilePort;
    progression: ProgressionPort;
    /** Reward adapter - optional in Lite */
    reward?: RewardPort;
    /** Subscription adapter - optional in Lite */
    subscription?: SubscriptionPort;
    /** Sync adapter - optional in Lite */
    sync?: SyncPort;
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
    if (adapters.auth) setAuthAdapter(adapters.auth);
    setHistoryAdapter(adapters.history);
    setJourneyAdapter(adapters.journey);
    setReadModelsAdapter(adapters.readModels);
    setProfileReadModel(createProfileReadModel(adapters.readModels));
    setJourneyReadModel(createJourneyReadModel(adapters.readModels));
    if (adapters.license && prevAdapters?.license !== adapters.license) {
      setLicenseAdapter(adapters.license);
    }
    if (adapters.payment) setPaymentAdapter(adapters.payment);
    if (adapters.pipeline && prevAdapters?.pipeline !== adapters.pipeline) {
      setPipelineAdapter(adapters.pipeline);
    }
    setProfileAdapter(adapters.profile);
    setProgressionAdapter(adapters.progression);
    if (adapters.reward) setRewardAdapter(adapters.reward);
    if (adapters.subscription) setSubscriptionAdapter(adapters.subscription);
    if (adapters.sync) setSyncAdapter(adapters.sync);
    prevAdaptersRef.current = adapters;
  }
  const queryClient = queryClientRef.current;

  // Subscribe to external adapters and invalidate TanStack queries when they change
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // Auth adapter → invalidate auth queries (optional)
    if (adapters.auth) {
      cleanups.push(
        adapters.auth.subscribe(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        }),
      );
    }

    // Subscription adapter → invalidate subscription queries (optional)
    if (adapters.subscription) {
      cleanups.push(
        adapters.subscription.subscribe(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
        }),
      );
    }

    // Sync adapter → update cache directly (optional)
    if (adapters.sync) {
      cleanups.push(
        adapters.sync.subscribe((newState) => {
          queryClient.setQueryData(queryKeys.sync.state(), newState);
        }),
      );
    }

    // Reward adapter → invalidate reward queries (optional)
    if (adapters.reward) {
      cleanups.push(
        adapters.reward.subscribe(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.reward.all });
        }),
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
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
