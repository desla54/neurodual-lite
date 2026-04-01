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
  PremiumPort,
  ProfilePort,
  ProgressionPort,
  ReadModelPort,
  SessionEndPipelinePort,
  SubscriptionPort,
  SyncPort,
} from '@neurodual/logic';
import { createQueryClient, setQueryClient } from './query-client';
import { setAuthAdapter } from './auth';
import { setHistoryAdapter } from './history';
import { setPipelineAdapter } from './pipeline';
import { setProfileAdapter } from './profile';
import { setProgressionAdapter } from './progression';
import { setSubscriptionAdapter } from './subscription';
import { setSyncAdapter } from './sync';
import { setPremiumAdapter } from './premium';
import { setReadModelsAdapter, setProfileReadModel } from './read-models';
import { createProfileReadModel } from '@neurodual/infra';
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
    readModels: ReadModelPort;
    /** Session completion pipeline (XState-based) - optional */
    pipeline?: SessionEndPipelinePort;
    /** Premium activation adapter */
    premium?: PremiumPort;
    profile: ProfilePort;
    progression: ProgressionPort;
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
    prevAdapters.readModels !== adapters.readModels ||
    prevAdapters.premium !== adapters.premium ||
    prevAdapters.profile !== adapters.profile ||
    prevAdapters.progression !== adapters.progression ||
    prevAdapters.subscription !== adapters.subscription ||
    prevAdapters.sync !== adapters.sync ||
    prevAdapters.pipeline !== adapters.pipeline;

  if (adaptersChanged) {
    // Initialize/update all TanStack Query adapters synchronously.
    if (adapters.auth) setAuthAdapter(adapters.auth);
    setHistoryAdapter(adapters.history);
    setReadModelsAdapter(adapters.readModels);
    setProfileReadModel(createProfileReadModel(adapters.readModels));
    if (adapters.pipeline && prevAdapters?.pipeline !== adapters.pipeline) {
      setPipelineAdapter(adapters.pipeline);
    }
    setProfileAdapter(adapters.profile);
    setProgressionAdapter(adapters.progression);
    if (adapters.premium) setPremiumAdapter(adapters.premium);
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

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [
    adapters.auth,
    adapters.subscription,
    adapters.sync,
    queryClient,
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <JourneyConfigProvider config={journeyConfig}>{children}</JourneyConfigProvider>
    </QueryClientProvider>
  );
}
