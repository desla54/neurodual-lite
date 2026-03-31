/**
 * useSessionRuns Hook
 *
 * Fetches replay runs for a session using the ReplayInteractifPort.
 * Used by HistoryView to display sessions with correction runs.
 */

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { ReplayRun } from '@neurodual/logic';
import { useReplayInteractifAdapter } from '../context/ReplayInteractifContext';
import { createReplayRunsQueryOptions } from '../queries/replay';
import { queryKeys } from '../queries/keys';

export interface SessionRunsState {
  readonly runs: readonly ReplayRun[];
  readonly loading: boolean;
  readonly error: Error | null;
}

/**
 * Fetch runs for a single session.
 * Returns empty array if no runs exist (session has no corrections).
 */
export function useSessionRuns(sessionId: string | null): SessionRunsState {
  const adapter = useReplayInteractifAdapter();
  const query = useQuery<ReplayRun[], Error>({
    queryKey: queryKeys.history.runs(sessionId ?? '__none__'),
    queryFn: async () => {
      if (!sessionId) {
        return [];
      }
      return adapter.getRunsForSession(sessionId);
    },
    enabled: sessionId !== null,
  });

  return {
    runs: sessionId ? (query.data ?? []) : [],
    loading: query.isLoading,
    error: query.error ?? null,
  };
}

/**
 * Batch fetch runs for multiple sessions.
 * Returns a map of sessionId -> runs.
 */
export function useMultipleSessionRuns(
  sessionIds: readonly string[],
): ReadonlyMap<string, readonly ReplayRun[]> {
  const adapter = useReplayInteractifAdapter();
  const queryResults = useQueries({
    queries: sessionIds.map((sessionId) => createReplayRunsQueryOptions(sessionId, adapter)),
  });

  return useMemo(() => {
    if (sessionIds.length === 0) {
      return new Map();
    }

    if (queryResults.some((result) => result.error)) {
      return new Map();
    }

    return new Map(
      sessionIds.map((sessionId, index) => [sessionId, queryResults[index]?.data ?? []]),
    );
  }, [queryResults, sessionIds]);
}
