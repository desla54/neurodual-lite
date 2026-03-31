import { queryOptions, useQuery } from '@tanstack/react-query';
import type { ReplayEvent, ReplayInteractifPort, ReplayRun } from '@neurodual/logic';
import { queryKeys } from './keys';

const EMPTY_RUN_EVENTS_QUERY_KEY = [...queryKeys.history.all, 'run-events', '__none__'] as const;

export function createReplayRunsQueryOptions(sessionId: string, adapter: ReplayInteractifPort) {
  return queryOptions({
    queryKey: queryKeys.history.runs(sessionId),
    queryFn: async () => adapter.getRunsForSession(sessionId),
  });
}

export function useReplayRunsQuery(
  sessionId: string | null,
  adapter?: ReplayInteractifPort | null,
): {
  data: ReplayRun[];
  isPending: boolean;
  error: Error | null;
} {
  const effectiveSessionId = sessionId && sessionId !== '' ? sessionId : null;
  const runsQuery = useQuery<ReplayRun[], Error>({
    queryKey: queryKeys.history.runs(effectiveSessionId ?? '__none__'),
    queryFn: async () => {
      if (!adapter || !effectiveSessionId) {
        return [];
      }
      return adapter.getRunsForSession(effectiveSessionId);
    },
    enabled: effectiveSessionId !== null && adapter != null,
  });

  return {
    data: runsQuery.data ?? [],
    isPending: effectiveSessionId !== null && (adapter == null || runsQuery.isPending),
    error: runsQuery.error ?? null,
  };
}

export function useReplayRunEventsQuery(
  runId: string | null,
  adapter?: ReplayInteractifPort | null,
): {
  data: ReplayEvent[];
  isPending: boolean;
  error: Error | null;
} {
  const effectiveRunId = runId && runId !== '' ? runId : null;
  const eventsQuery = useQuery({
    queryKey: effectiveRunId
      ? queryKeys.history.runEvents(effectiveRunId)
      : EMPTY_RUN_EVENTS_QUERY_KEY,
    queryFn: async () => {
      if (!adapter || !effectiveRunId) return [];
      return adapter.getActiveEventsForRun(effectiveRunId);
    },
    enabled: effectiveRunId !== null && adapter != null,
    retry: false,
  });

  return {
    data: eventsQuery.data ?? [],
    isPending: effectiveRunId !== null && (adapter == null || eventsQuery.isPending),
    error: eventsQuery.error
      ? eventsQuery.error instanceof Error
        ? eventsQuery.error
        : new Error(String(eventsQuery.error))
      : null,
  };
}
