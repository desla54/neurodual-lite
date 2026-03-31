/**
 * Replay Context
 *
 * Provides ReplayPort adapter via React context.
 * Injected by apps/web with the replayAdapter from infra.
 */

import { createContext, useContext } from 'react';
import type { ReplayPort } from '@neurodual/logic';

const ReplayContext = createContext<ReplayPort | null>(null);

export const ReplayProvider = ReplayContext.Provider;

export function useReplayAdapter(): ReplayPort {
  const adapter = useContext(ReplayContext);
  if (!adapter) {
    throw new Error('useReplayAdapter must be used within a ReplayProvider');
  }
  return adapter;
}
