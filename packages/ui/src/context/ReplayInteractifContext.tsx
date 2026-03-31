/**
 * Replay Interactif Context
 *
 * Provides ReplayInteractifPort adapter via React context.
 * Injected by apps/web with the replayInteractifAdapter from infra.
 *
 * @see docs/specs/domain-replay-interactif.md
 */

import { createContext, useContext } from 'react';
import type { ReplayInteractifPort } from '@neurodual/logic';

const ReplayInteractifContext = createContext<ReplayInteractifPort | null>(null);

export const ReplayInteractifProvider = ReplayInteractifContext.Provider;

/**
 * Access the ReplayInteractifPort adapter.
 * Must be used within a ReplayInteractifProvider.
 */
export function useReplayInteractifAdapter(): ReplayInteractifPort {
  const adapter = useContext(ReplayInteractifContext);
  if (!adapter) {
    throw new Error('useReplayInteractifAdapter must be used within a ReplayInteractifProvider');
  }
  return adapter;
}

/**
 * Access the ReplayInteractifPort adapter optionally.
 * Returns null if not within a ReplayInteractifProvider.
 */
export function useOptionalReplayInteractifAdapter(): ReplayInteractifPort | null {
  return useContext(ReplayInteractifContext);
}
