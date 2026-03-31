import type { RefObject } from 'react';
import type { CogTaskEventEmitter } from '../lib/cognitive-task-events';
import { useFinishedSession } from './use-session-finalizer';

interface UseCognitiveTaskFinishedOptions<TSummary> {
  readonly phase: string | null | undefined;
  readonly summary: TSummary | null | undefined;
  readonly emitterRef: RefObject<CogTaskEventEmitter>;
  readonly onFinished: (summary: TSummary) => void;
}

/**
 * Wraps `useFinishedSession` for cognitive task pages.
 *
 * Cognitive task summaries don't carry a `sessionId` — it lives on
 * `emitterRef.current.sessionId`. This hook bridges that gap so each
 * page doesn't need its own `useEffect(() => { if (phase !== 'finished' …`.
 */
export function useCognitiveTaskFinished<TSummary>({
  phase,
  summary,
  emitterRef,
  onFinished,
}: UseCognitiveTaskFinishedOptions<TSummary>): void {
  const enriched =
    phase === 'finished' && summary
      ? { ...summary, sessionId: emitterRef.current.sessionId }
      : null;

  useFinishedSession({
    phase,
    summary: enriched,
    onFinishedSummary: () => {
      onFinished(summary as TSummary);
    },
  });
}
