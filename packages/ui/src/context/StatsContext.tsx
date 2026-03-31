/**
 * Stats Context
 *
 * Provides StatsPort adapter via React context.
 * Injected by apps/web with the statsAdapter from infra.
 */

import { createContext, useContext } from 'react';
import type { StatsPort } from '@neurodual/logic';

const StatsContext = createContext<StatsPort | null>(null);

export const StatsProvider = StatsContext.Provider;

export function useStatsAdapter(): StatsPort {
  const adapter = useContext(StatsContext);
  if (!adapter) {
    throw new Error('useStatsAdapter must be used within a StatsProvider');
  }
  return adapter;
}
