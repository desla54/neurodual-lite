import type { SessionEndReportModel } from '@neurodual/logic';
import { useMountEffect, type SessionCompletionResultWithLevel } from '@neurodual/ui';
import { useLayoutEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router';
import { useSynergyStore } from '../stores/synergy-store';

interface SummaryLike {
  readonly sessionId: string;
}

interface UseNbackReportRuntimeOptions {
  readonly phase: string;
  readonly summary: SummaryLike | null | undefined;
  readonly stableReportTick: number;
  readonly completionIsProcessing: boolean;
  readonly completionResult: SessionCompletionResultWithLevel | null;
  readonly stableReportSessionId: string | null;
  readonly stableCompletionSessionId: string | null;
  readonly reportReady: boolean;
  readonly reportPending: boolean;
  readonly finalizingPending: boolean;
  readonly showClassicGridFinalizingOverlay: boolean;
  readonly gameplayPlayMode: string;
  readonly stableFinishedReport: SessionEndReportModel | null;
  readonly stableFinishedCompletion: SessionCompletionResultWithLevel | null;
  readonly effectiveMode: string;
  readonly navigate: NavigateFunction;
}

export function useNbackReportRuntime({
  phase,
  summary,
  stableReportTick,
  completionIsProcessing,
  completionResult,
  stableReportSessionId,
  stableCompletionSessionId,
  reportReady,
  reportPending,
  finalizingPending,
  showClassicGridFinalizingOverlay,
  gameplayPlayMode,
  stableFinishedReport,
  stableFinishedCompletion,
  effectiveMode,
  navigate,
}: UseNbackReportRuntimeOptions): boolean {
  const reportDebugEnabledRef = useRef(false);
  const reportFinishedAtRef = useRef<number | null>(null);
  const synergyAdvancedRef = useRef(false);

  useMountEffect(() => {
    try {
      reportDebugEnabledRef.current = localStorage.getItem('nd_debug_report') === '1';
    } catch {
      reportDebugEnabledRef.current = false;
    }
  });

  useLayoutEffect(() => {
    if (!reportDebugEnabledRef.current) return;
    if (phase !== 'finished' || !summary) {
      reportFinishedAtRef.current = null;
      return;
    }
    if (reportFinishedAtRef.current === null) {
      reportFinishedAtRef.current = performance.now();
    }

    const elapsedMs = reportFinishedAtRef.current
      ? Math.round(performance.now() - reportFinishedAtRef.current)
      : null;
    console.debug('[ReportUI]', {
      phase,
      sessionId: summary.sessionId,
      stableReportTick,
      completionIsProcessing,
      hasCompletionReport: Boolean(completionResult?.report),
      stableReportSessionId,
      stableCompletionSessionId,
      reportReady,
      reportPending,
      finalizingPending,
      showClassicGridFinalizingOverlay,
      finishedToNowMs: elapsedMs,
    });
  }, [
    phase,
    summary,
    stableReportTick,
    completionIsProcessing,
    completionResult,
    stableReportSessionId,
    stableCompletionSessionId,
    reportReady,
    reportPending,
    finalizingPending,
    showClassicGridFinalizingOverlay,
  ]);

  const shouldSynergyReturn =
    phase === 'finished' &&
    Boolean(summary) &&
    reportReady &&
    gameplayPlayMode === 'synergy' &&
    Boolean(stableFinishedReport);

  useLayoutEffect(() => {
    if (!shouldSynergyReturn || synergyAdvancedRef.current) return;
    if (!stableFinishedReport || !stableFinishedCompletion) return;

    synergyAdvancedRef.current = true;
    useSynergyStore.getState().completeStep({
      mode: effectiveMode,
      score: stableFinishedReport.ups.score,
      nLevel: stableFinishedReport.nLevel,
      sessionId: stableFinishedReport.sessionId,
      report: stableFinishedReport,
      xpBreakdown: stableFinishedCompletion.xpBreakdown,
    });
    navigate('/', { replace: true, state: { returnTab: 'synergy' } });
  }, [
    shouldSynergyReturn,
    stableFinishedReport,
    stableFinishedCompletion,
    effectiveMode,
    navigate,
  ]);

  return shouldSynergyReturn;
}
