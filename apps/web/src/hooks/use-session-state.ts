import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

interface SessionIdLike {
  readonly sessionId: string;
}

interface CompletionWithReport<TReport extends SessionIdLike> {
  readonly report: TReport;
}

interface UseStartedSessionOptions {
  readonly phase: string | null | undefined;
  readonly sessionId: string | null | undefined;
  readonly onStarted: (sessionId: string) => void;
}

interface UseFinishedSessionReportStateOptions<
  TSummary extends SessionIdLike,
  TReport extends SessionIdLike,
  TResult extends CompletionWithReport<TReport>,
> {
  readonly phase: string | null | undefined;
  readonly summary: TSummary | null | undefined;
  readonly completionResult: TResult | null | undefined;
  readonly completionIsProcessing: boolean;
  readonly completionError: Error | null;
}

interface UseFinishedSessionReportStateResult<
  TReport extends SessionIdLike,
  TResult extends CompletionWithReport<TReport>,
> {
  readonly stableReport: TReport | null;
  readonly stableCompletion: TResult | null;
  readonly stableReportTick: number;
  readonly stableReportSessionId: string | null;
  readonly stableCompletionSessionId: string | null;
  readonly reportReady: boolean;
  readonly reportPending: boolean;
  readonly reportFailed: boolean;
  readonly sessionFinalizing: boolean;
}

export function useStartedSession({ phase, sessionId, onStarted }: UseStartedSessionOptions): void {
  const runStarted = useEffectEvent(onStarted);
  const startedSessionIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (phase === 'idle' || phase === 'finished') {
      startedSessionIdRef.current = null;
      return;
    }
    if (!sessionId || startedSessionIdRef.current === sessionId) return;

    startedSessionIdRef.current = sessionId;
    runStarted(sessionId);
  }, [phase, sessionId, runStarted]);
}

export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!active) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
      return;
    }
    if (visible || timerRef.current) return;

    timerRef.current = setTimeout(() => {
      setVisible(true);
      timerRef.current = null;
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, delayMs, visible]);

  return visible;
}

export function useFinishedSessionReportState<
  TSummary extends SessionIdLike,
  TReport extends SessionIdLike,
  TResult extends CompletionWithReport<TReport>,
>({
  phase,
  summary,
  completionResult,
  completionIsProcessing,
  completionError,
}: UseFinishedSessionReportStateOptions<
  TSummary,
  TReport,
  TResult
>): UseFinishedSessionReportStateResult<TReport, TResult> {
  const stableReportRef = useRef<{ sessionId: string; report: TReport } | null>(null);
  const stableCompletionRef = useRef<{ sessionId: string; result: TResult } | null>(null);
  const [stableReportTick, bumpStableReportTick] = useState(0);

  useLayoutEffect(() => {
    if (phase === 'finished') return;
    stableReportRef.current = null;
    stableCompletionRef.current = null;
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== 'finished' || !summary || !completionResult?.report) return;
    if (completionResult.report.sessionId !== summary.sessionId) return;

    let didUpdate = false;

    if (stableReportRef.current?.sessionId !== summary.sessionId) {
      stableReportRef.current = { sessionId: summary.sessionId, report: completionResult.report };
      didUpdate = true;
    }
    if (stableCompletionRef.current?.sessionId !== summary.sessionId) {
      stableCompletionRef.current = { sessionId: summary.sessionId, result: completionResult };
      didUpdate = true;
    }

    if (didUpdate) {
      bumpStableReportTick((value) => value + 1);
    }
  }, [phase, summary?.sessionId, completionResult]);

  const stableReport =
    phase === 'finished' && summary && stableReportRef.current?.sessionId === summary.sessionId
      ? stableReportRef.current.report
      : null;
  const stableCompletion =
    phase === 'finished' && summary && stableCompletionRef.current?.sessionId === summary.sessionId
      ? stableCompletionRef.current.result
      : null;
  const reportReady = Boolean(stableReport && stableCompletion);
  const reportPending =
    phase === 'finished' && Boolean(summary) && !reportReady && completionIsProcessing;
  const sessionFinalizing = phase === 'finished' && !summary;
  const reportFailed =
    phase === 'finished' &&
    Boolean(summary) &&
    !reportReady &&
    !completionIsProcessing &&
    completionError instanceof Error;

  return {
    stableReport,
    stableCompletion,
    stableReportTick,
    stableReportSessionId: stableReportRef.current?.sessionId ?? null,
    stableCompletionSessionId: stableCompletionRef.current?.sessionId ?? null,
    reportReady,
    reportPending,
    reportFailed,
    sessionFinalizing,
  };
}
