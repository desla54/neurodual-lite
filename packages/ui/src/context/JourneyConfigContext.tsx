/**
 * JourneyConfigContext
 *
 * Provides the current JourneyConfig to components.
 * This allows journey hooks to access the config without explicit passing.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { JourneyConfig } from '@neurodual/logic';

// =============================================================================
// Context
// =============================================================================

const JourneyConfigContext = createContext<JourneyConfig | null>(null);

// =============================================================================
// Hook
// =============================================================================

/**
 * Get the current JourneyConfig from context.
 * Throws if used outside of JourneyConfigProvider.
 */
export function useJourneyConfig(): JourneyConfig {
  const config = useContext(JourneyConfigContext);
  if (!config) {
    throw new Error('useJourneyConfig must be used within JourneyConfigProvider');
  }
  return config;
}

/**
 * Get the current JourneyConfig from context, or null if not available.
 */
export function useJourneyConfigSafe(): JourneyConfig | null {
  return useContext(JourneyConfigContext);
}

// =============================================================================
// Provider
// =============================================================================

interface JourneyConfigProviderProps {
  config: JourneyConfig;
  children: ReactNode;
}

export function JourneyConfigProvider({ config, children }: JourneyConfigProviderProps): ReactNode {
  return <JourneyConfigContext.Provider value={config}>{children}</JourneyConfigContext.Provider>;
}
