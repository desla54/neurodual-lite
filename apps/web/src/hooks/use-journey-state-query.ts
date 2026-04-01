/**
 * useJourneyStateQuery
 *
 * Reads journey state from journey_state_projection.
 * Re-reads on mount and when the pipeline processes a new session.
 * Uses a short delay on re-read to ensure the observer has written the update first.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JourneyState } from '@neurodual/logic';
import { usePipelineState } from '@neurodual/ui';
import { usePersistence } from '../providers';
import { buildFreshJourneyState } from '../lib/journey-progression';

/** Delay (ms) before re-reading after a session completes, to let the observer write first. */
const POST_SESSION_READ_DELAY = 500;

export function useJourneyStateQuery(
  journeyId: string,
  startLevel: number,
  targetLevel: number,
  gameMode?: string,
): { data: JourneyState; isPending: boolean } {
  const persistence = usePersistence();
  const pipelineState = usePipelineState();
  const [state, setState] = useState<JourneyState | null>(null);
  const [isPending, setIsPending] = useState(true);
  const timerRef = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!persistence) return;
    try {
      const result = await persistence.query<{ state_json: string }>(
        'SELECT state_json FROM journey_state_projection WHERE journey_id = ? LIMIT 1',
        [journeyId],
      );
      const rows = result.rows;
      if (rows.length > 0 && rows[0]?.state_json) {
        setState(JSON.parse(rows[0].state_json) as JourneyState);
      }
    } catch {
      // Ignore read errors — fallback to default state
    } finally {
      setIsPending(false);
    }
  }, [persistence, journeyId]);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Re-load after session completes (with delay to let observer write first)
  useEffect(() => {
    if (!pipelineState.result?.report) return;
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void load(), POST_SESSION_READ_DELAY);
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, [pipelineState.result?.report, load]);

  const fallback = buildFreshJourneyState(startLevel, targetLevel, gameMode);

  return {
    data: state ?? fallback,
    isPending,
  };
}
