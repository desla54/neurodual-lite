import { useEffectEvent, useLayoutEffect, useRef, type MutableRefObject } from 'react';

interface FinishedSummaryLike {
  readonly sessionId: string;
}

interface FinalizableSummaryLike extends FinishedSummaryLike {
  readonly completed: boolean;
}

interface UseFinishedSessionOptions<TSummary extends FinishedSummaryLike> {
  readonly phase: string | null | undefined;
  readonly summary: TSummary | null | undefined;
  readonly onFinishedSummary: (summary: TSummary) => void | Promise<void>;
  /**
   * Optional XState actor ref. When provided, subscribes directly to the actor
   * for immediate "finished" detection — bypassing React's render cycle.
   * This ensures persistence starts as soon as the machine reaches 'finished',
   * which is critical on slower devices (Android WebView).
   */
  readonly actorRef?: {
    subscribe(callback: (state: { value: unknown; context: unknown }) => void): {
      unsubscribe(): void;
    };
    getSnapshot(): { value: unknown; context: unknown };
  };
  /**
   * Extract summary from actor snapshot context.
   * Required when actorRef is provided.
   */
  readonly extractSummary?: (context: unknown) => TSummary | null | undefined;
  /**
   * The state value(s) that represent 'finished'. Defaults to matching 'finished'.
   */
  readonly finishedStateValue?: string | ((value: unknown) => boolean);
}

interface FinalizeSessionOptions<
  TSummary extends FinalizableSummaryLike,
  TCompletionInput,
  TResult,
> {
  readonly summary: TSummary;
  readonly abandonedCleanupSessionRef: MutableRefObject<string | null>;
  readonly cleanupAbandonedSession: (sessionId: string) => Promise<void> | void;
  readonly buildCompletionInput: (summary: TSummary) => TCompletionInput;
  readonly complete: (input: TCompletionInput) => Promise<TResult | null>;
}

function isFinishedState(
  value: unknown,
  matcher?: string | ((value: unknown) => boolean),
): boolean {
  if (typeof matcher === 'function') return matcher(value);
  const target = matcher ?? 'finished';
  if (value === target) return true;
  if (typeof value === 'object' && value !== null && target in (value as Record<string, unknown>))
    return true;
  return false;
}

export function useFinishedSession<TSummary extends FinishedSummaryLike>({
  phase,
  summary,
  onFinishedSummary,
  actorRef,
  extractSummary,
  finishedStateValue,
}: UseFinishedSessionOptions<TSummary>): void {
  const runFinishedSummary = useEffectEvent(onFinishedSummary);
  const handledSessionIdRef = useRef<string | null>(null);

  if (phase !== 'finished') {
    handledSessionIdRef.current = null;
  }

  // Path A: Direct actor subscription (bypasses React render cycle)
  useLayoutEffect(() => {
    if (!actorRef || !extractSummary) return;

    // Check current state immediately (actor may already be finished)
    const currentSnapshot = actorRef.getSnapshot();
    if (isFinishedState(currentSnapshot.value, finishedStateValue)) {
      const currentSummary = extractSummary(currentSnapshot.context);
      if (currentSummary?.sessionId && handledSessionIdRef.current !== currentSummary.sessionId) {
        handledSessionIdRef.current = currentSummary.sessionId;
        void runFinishedSummary(currentSummary);
      }
    }

    const sub = actorRef.subscribe((state) => {
      if (!isFinishedState(state.value, finishedStateValue)) {
        handledSessionIdRef.current = null;
        return;
      }
      const s = extractSummary(state.context);
      if (!s?.sessionId || handledSessionIdRef.current === s.sessionId) return;
      handledSessionIdRef.current = s.sessionId;
      void runFinishedSummary(s);
    });
    return () => sub.unsubscribe();
  }, [actorRef, extractSummary, finishedStateValue, runFinishedSummary]);

  // Path B: Fallback to React-driven detection (when no actorRef provided)
  useLayoutEffect(() => {
    if (actorRef && extractSummary) return; // Path A handles it
    if (phase !== 'finished' || !summary) return;
    if (!summary.sessionId || handledSessionIdRef.current === summary.sessionId) return;

    handledSessionIdRef.current = summary.sessionId;
    void runFinishedSummary(summary);
  }, [actorRef, extractSummary, phase, summary, runFinishedSummary]);
}

export async function finalizeSession<
  TSummary extends FinalizableSummaryLike,
  TCompletionInput,
  TResult,
>({
  summary,
  abandonedCleanupSessionRef,
  cleanupAbandonedSession,
  buildCompletionInput,
  complete,
}: FinalizeSessionOptions<TSummary, TCompletionInput, TResult>): Promise<TResult | null> {
  if (!summary.completed) {
    if (abandonedCleanupSessionRef.current === summary.sessionId) {
      return null;
    }

    abandonedCleanupSessionRef.current = summary.sessionId;
    await cleanupAbandonedSession(summary.sessionId);
    return null;
  }

  return complete(buildCompletionInput(summary));
}
