/**
 * CloudSyncProvider
 *
 * Wrapper component that initializes cloud sync for settings and progression.
 * Must be placed inside NeurodualQueryProvider.
 */

import { type ReactNode, createContext, useContext } from 'react';
import { useCloudSync } from '../hooks/use-cloud-sync';

interface CloudSyncContextValue {
  /** Trigger sync via SyncPort (PowerSync). Returns immediately. */
  syncProgressionNow: () => void;
  /** Full sync: events, progression, settings. Returns when complete. */
  syncEventsAndProgression: () => Promise<void>;
  /** Push settings to cloud. */
  syncSettingsNow: () => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

interface CloudSyncProviderProps {
  children: ReactNode;
}

export function CloudSyncProvider({ children }: CloudSyncProviderProps) {
  const { syncProgressionNow, syncEventsAndProgression, syncSettingsNow } = useCloudSync();

  return (
    <CloudSyncContext.Provider
      value={{ syncProgressionNow, syncEventsAndProgression, syncSettingsNow }}
    >
      {children}
    </CloudSyncContext.Provider>
  );
}

/**
 * Hook to access cloud sync functions.
 *
 * - syncEventsAndProgression(): Use after session completion. Syncs events first,
 *   then recalculates progression from all events, then syncs progression.
 * - syncProgressionNow(): Push current progression without recalculating.
 * - syncSettingsNow(): Push current settings.
 */
export function useCloudSyncActions(): CloudSyncContextValue {
  const context = useContext(CloudSyncContext);
  if (!context) {
    // Return no-op functions if not in provider (for tests, etc.)
    return {
      syncProgressionNow: () => {},
      syncEventsAndProgression: async () => {},
      syncSettingsNow: async () => {},
    };
  }
  return context;
}
