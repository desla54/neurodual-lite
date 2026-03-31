/**
 * Journey Queries
 *
 * PowerSync-based reactive hooks for journey (parcours d'entraînement) state.
 * Uses a journey-scoped PowerSync query for INSTANT updates when SQLite changes.
 *
 * All hooks require JourneyConfig parameter for multi-journey isolation.
 */

import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getJourneyRoute,
  getStageDefinition,
  isSimulatorMode,
  type JourneyConfig,
  type JourneyPort,
  type JourneyRecordableSession,
  type JourneyRoute,
  type JourneyStageDefinition,
  type JourneyState,
} from '@neurodual/logic';
import type { NextJourneySession } from '@neurodual/infra';
import { useJourneyConfig } from '../context/JourneyConfigContext';
import { useCurrentUser } from './auth';
import { getReadModelsAdapter, getJourneyReadModel } from './read-models';
import { useSubscribable } from '../reactive/use-subscribable';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let journeyAdapter: JourneyPort | null = null;

export function setJourneyAdapter(adapter: JourneyPort): void {
  journeyAdapter = adapter;
}

export function getJourneyAdapter(): JourneyPort {
  if (!journeyAdapter) {
    throw new Error('Journey adapter not initialized. Call setJourneyAdapter first.');
  }
  return journeyAdapter;
}

// =============================================================================
// Query Hooks (PowerSync-based - INSTANT updates)
// =============================================================================

/**
 * Journey state hook using PowerSync reactive queries.
 *
 * Uses a journey-scoped watched query which auto-updates when session_summaries changes.
 * No invalidation or refetch needed - updates are instant.
 */
export function useJourneyState(config: JourneyConfig): {
  state: JourneyState;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const snapshot = useSubscribable(getReadModelsAdapter().journeyState(config, user?.id ?? null));

  return {
    state: snapshot.data,
    isPending: snapshot.isPending,
    error: snapshot.error ? new Error(snapshot.error) : null,
  };
}

/**
 * Current stage definition using PowerSync reactive queries.
 */
export function useCurrentStage(config: JourneyConfig): JourneyStageDefinition | null {
  const { state } = useJourneyState(config);
  const isSimulator = isSimulatorMode(config.gameMode);

  return useMemo(() => {
    if (state.currentStage > state.stages.length) {
      return null; // Journey complete
    }
    return (
      getStageDefinition(state.currentStage, config.targetLevel, config.startLevel, isSimulator) ??
      null
    );
  }, [state.currentStage, state.stages.length, config.targetLevel, config.startLevel, isSimulator]);
}

/**
 * Combined journey data using PowerSync reactive queries.
 */
export function useJourneyData(config: JourneyConfig) {
  const { state, isPending, error } = useJourneyState(config);
  const currentStage = useCurrentStage(config);

  return {
    state,
    currentStage,
    isPending,
    error,
  };
}

/**
 * Next route using PowerSync reactive queries.
 */
export function useNextRoute(config: JourneyConfig): JourneyRoute | null {
  const currentStage = useCurrentStage(config);
  return useMemo(() => {
    if (!currentStage) return null;
    return getJourneyRoute(currentStage, config.gameMode);
  }, [currentStage, config.gameMode]);
}

/**
 * Get a specific stage definition (synchronous, no query needed).
 */
export function useStageDefinition(
  stageId: number,
  config: JourneyConfig,
): JourneyStageDefinition | undefined {
  return useMemo(() => {
    return getJourneyAdapter().getStageDefinition(stageId, config);
  }, [stageId, config]);
}

// =============================================================================
// Context-Based Wrapper Hooks
// =============================================================================

/**
 * Journey state using config from context.
 */
export function useJourneyStateWithContext() {
  const config = useJourneyConfig();
  return useJourneyState(config);
}

// =============================================================================
// Read Model Hook — NextJourneySession
// =============================================================================

/**
 * Reactive hook that provides the next session to launch for a journey.
 *
 * Uses the JourneyReadModel to derive nLevel, gameMode (with hybrid alternation),
 * and route from the reactive JourneyState. Single source of truth for game pages.
 */
export function useNextJourneySession(config: JourneyConfig): {
  nextSession: NextJourneySession | null;
  journeyState: JourneyState | null;
  isPending: boolean;
} {
  const user = useCurrentUser();
  const snapshot = useSubscribable(getJourneyReadModel().getNextSession(config, user?.id ?? null));

  return {
    nextSession: snapshot.data.nextSession,
    journeyState: snapshot.data.journeyState,
    isPending: snapshot.isPending,
  };
}

/**
 * useNextJourneySession using config from context.
 */
export function useNextJourneySessionWithContext() {
  const config = useJourneyConfig();
  return useNextJourneySession(config);
}

const NOOP_JOURNEY_CONFIG: JourneyConfig = {
  journeyId: '__noop__',
  startLevel: 1,
  targetLevel: 1,
};

/**
 * Safe version of useNextJourneySession that handles null config.
 * Returns null nextSession when no journey config is available.
 */
export function useNextJourneySessionSafe(config: JourneyConfig | null): {
  nextSession: NextJourneySession | null;
  journeyState: JourneyState | null;
  isPending: boolean;
} {
  // Always call the hook unconditionally (React rules of hooks).
  // When config is null, use a stable noop config — the result is discarded.
  const result = useNextJourneySession(config ?? NOOP_JOURNEY_CONFIG);
  if (!config) {
    return { nextSession: null, journeyState: null, isPending: false };
  }
  return result;
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Record an attempt on a stage.
 * PowerSync handles reactivity - no TanStack invalidation needed.
 */
export function useRecordAttempt(config: JourneyConfig) {
  return useMutation({
    mutationFn: async ({
      stageId,
      session,
    }: {
      stageId: number;
      session: JourneyRecordableSession;
    }) => {
      return getJourneyAdapter().recordAttempt(config, stageId, session);
    },
  });
}

/**
 * Record an attempt using config from context.
 */
export function useRecordAttemptWithContext() {
  const config = useJourneyConfig();
  return useRecordAttempt(config);
}
