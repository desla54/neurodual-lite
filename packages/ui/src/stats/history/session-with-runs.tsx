/**
 * SessionWithRuns - Wrapper that shows RunStackCard if session has correction runs
 *
 * Loads runs for a session and displays either:
 * - SessionCard (no runs)
 * - RunStackCard (has runs)
 */

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getModeI18nKey,
  type SessionEndReportModel,
  type SessionHistoryItem,
  type ReplayRun,
} from '@neurodual/logic';
import { SessionCard, type SessionCardProps } from './session-card';
import { RunStackCard, type RunStackCardLabels } from '../run-stack-card';
import { useOptionalReplayInteractifAdapter } from '../../context/ReplayInteractifContext';
import { profileDevEffectAsync, profileDevEffectSync } from '../../debug/dev-effect-profiler';
import { projectReplayRunReportFromHistorySession } from './run-report-projection';

// =============================================================================
// Types
// =============================================================================

export interface SessionWithRunsProps extends Omit<SessionCardProps, 'session'> {
  readonly session: SessionHistoryItem;
  /** Runs for this session (empty array if none) */
  readonly runs: readonly ReplayRun[];
  /** Callback when a run's card is clicked to open report */
  readonly onRunClick?: (sessionId: string, runId: string | null) => void;
  /** Callback when a run is deleted */
  readonly onDeleteRun?: (sessionId: string, runId: string | null) => void;
}

// =============================================================================
// Component
// =============================================================================

const EMPTY_RUN_REPORTS: ReadonlyMap<string, SessionEndReportModel> = new Map();

export const SessionWithRuns = memo(function SessionWithRuns({
  session,
  runs,
  onRunClick,
  onDeleteRun,
  betaEnabled,
  ...sessionCardProps
}: SessionWithRunsProps): ReactNode {
  const { t, i18n } = useTranslation();
  const replayAdapter = useOptionalReplayInteractifAdapter();
  const [runReports, setRunReports] =
    useState<ReadonlyMap<string, SessionEndReportModel>>(EMPTY_RUN_REPORTS);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN (Rules of Hooks)

  // Build labels for RunStackCard
  const runStackLabels: RunStackCardLabels = useMemo(
    () => ({
      originalRun: t('replay.runStack.original', 'Original'),
      correctionRun: t('replay.runStack.correction', 'correction'),
      deltaLabel: t('replay.runStack.delta', "d'"),
      inProgress: t('replay.runStack.inProgress', 'In progress'),
      completed: t('replay.runStack.completed', 'Completed'),
      delete: t('common.delete', 'Delete'),
    }),
    [t],
  );

  const resolveModeLabel = useMemo(
    () => (modeId: string) => {
      const key = getModeI18nKey(modeId);
      return key ? t(key) : modeId;
    },
    [t],
  );

  // Build per-run projected reports from replay events.
  // This provides mode score + UPS values that are truly tab-specific.
  useEffect(() => {
    return profileDevEffectSync(`SessionWithRuns.effect(runs=${runs.length})`, () => {
      if (!replayAdapter || runs.length === 0) {
        setRunReports((prev) => (prev.size === 0 ? prev : EMPTY_RUN_REPORTS));
        return;
      }

      let cancelled = false;

      const load = async () => {
        const projectedEntries = await Promise.all(
          runs.map(async (run) => {
            try {
              const events = await replayAdapter.getActiveEventsForRun(run.id);
              const report = projectReplayRunReportFromHistorySession(
                session,
                events,
                resolveModeLabel,
              );
              return report ? ([run.id, report] as const) : null;
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) return;

        const next = new Map<string, SessionEndReportModel>();
        for (const entry of projectedEntries) {
          if (!entry) continue;
          next.set(entry[0], entry[1]);
        }
        setRunReports((prev) => {
          if (prev.size === next.size) {
            let unchanged = true;
            for (const [key, value] of next) {
              const current = prev.get(key);
              if (
                !current ||
                current.ups.score !== value.ups.score ||
                current.unifiedAccuracy !== value.unifiedAccuracy ||
                current.nLevel !== value.nLevel ||
                current.durationMs !== value.durationMs
              ) {
                unchanged = false;
                break;
              }
            }
            if (unchanged) return prev;
          }
          return next;
        });
      };

      void profileDevEffectAsync(`SessionWithRuns.loadRunReports(runs=${runs.length})`, load).catch(
        () => {
          if (!cancelled) {
            setRunReports((prev) => (prev.size === 0 ? prev : EMPTY_RUN_REPORTS));
          }
        },
      );

      return () => {
        cancelled = true;
      };
    });
  }, [replayAdapter, resolveModeLabel, runs, session]);

  // Build run UPS scores map from projected run reports.
  const runScores = useMemo(() => {
    const scores = new Map<string, number>();
    for (const run of runs) {
      const report = runReports.get(run.id);
      // NaN indicates "not loaded yet" and is rendered as an em dash in UI.
      scores.set(run.id, report ? report.ups.score : Number.NaN);
    }
    return scores;
  }, [runReports, runs]);

  // Session metadata for display
  const sessionMeta = useMemo(
    () => ({
      nLevel: session.nLevel,
      mode: session.gameMode ?? 'dual-catch',
      createdAt: session.createdAt,
      durationMs: session.durationMs,
    }),
    [session],
  );

  // Original UPS score
  const originalUPS = session.upsScore ?? Math.round(session.unifiedMetrics.accuracy * 100);

  // If no runs, just show the regular SessionCard (AFTER all hooks)
  if (runs.length === 0) {
    return <SessionCard session={session} betaEnabled={betaEnabled} {...sessionCardProps} />;
  }

  const handleOpenReport = (runId: string | null) => {
    onRunClick?.(session.id, runId);
  };

  const handleDeleteRun = (runId: string | null) => {
    onDeleteRun?.(session.id, runId);
  };

  return (
    <RunStackCard
      sessionId={session.id}
      originalUPS={originalUPS}
      originalDPrime={session.dPrime}
      originalAccuracy={session.unifiedMetrics.accuracy}
      originalUpsAccuracy={session.upsAccuracy}
      originalByModality={session.byModality}
      runs={runs}
      runScores={runScores}
      runReports={runReports}
      labels={runStackLabels}
      onOpenReport={handleOpenReport}
      onDeleteRun={handleDeleteRun}
      sessionMeta={sessionMeta}
      language={i18n.language}
      betaEnabled={betaEnabled}
    />
  );
});
