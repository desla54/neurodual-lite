import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pulse } from '@phosphor-icons/react';
import {
  generateContextualMessageData,
  getModeI18nKey,
  mapReplayEventsToGameEvents,
  type ModalityId,
  projectSessionReportFromEvents,
  type ReplayEvent,
  type ReplayRun,
  type ReplaySession,
  type SessionEndReportModel,
} from '@neurodual/logic';
import { Button, UnifiedSessionReport, useReplayInteractifAdapter } from '@neurodual/ui';
import { useBetaScoringEnabled } from '../../hooks/use-beta-features';
import { useUnifiedReportLabels } from '../../hooks/use-unified-report-labels';
import { useReportVariant } from '../../hooks/use-report-variant';
import { translateContextualMessage } from '../../utils/contextual-message';

interface ReplayUnifiedCompletionReportProps {
  readonly session: ReplaySession;
  readonly run: ReplayRun;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onReplay?: () => void;
  readonly onCorrect?: () => void;
}

export function ReplayUnifiedCompletionReport({
  session,
  run,
  onPlayAgain,
  onBackToHome,
  onReplay,
  onCorrect,
}: ReplayUnifiedCompletionReportProps): ReactNode {
  const { t } = useTranslation();
  const betaEnabled = useBetaScoringEnabled();
  const reportVariant = useReportVariant();
  const unifiedReportLabels = useUnifiedReportLabels();
  const replayAdapter = useReplayInteractifAdapter();

  const [report, setReport] = useState<SessionEndReportModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveModeLabel = useCallback(
    (gameMode: string): string => {
      const i18nKey = getModeI18nKey(gameMode);
      return i18nKey ? t(i18nKey) : gameMode;
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setReport(null);

    replayAdapter
      .getActiveEventsForRun(run.id)
      .then((events) => {
        if (cancelled) return;
        const gameEvents = mapReplayEventsToGameEvents(session.sessionId, events as ReplayEvent[]);
        const gameMode =
          session.sessionType === 'tempo' && typeof session.spec?.metadata?.id === 'string'
            ? session.spec.metadata.id
            : undefined;
        const generator = session.sessionType === 'tempo' ? session.config.generator : undefined;
        const projected = projectSessionReportFromEvents({
          sessionId: session.sessionId,
          events: gameEvents,
          modeHint: session.sessionType,
          gameMode,
          gameModeLabelResolver: resolveModeLabel,
          activeModalities: session.activeModalities as readonly ModalityId[],
          generator,
        });
        setReport(projected);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn('[Replay] Failed to build unified correction report:', error);
        setReport(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [replayAdapter, resolveModeLabel, run.id, session]);

  const labels = useMemo(() => {
    if (!report) return null;
    return {
      ...unifiedReportLabels,
      modeScoreLabel: t(report.modeScore.labelKey),
      modeScoreTooltip: report.modeScore.tooltipKey ? t(report.modeScore.tooltipKey) : undefined,
    };
  }, [report, t, unifiedReportLabels]);

  const message = useMemo(() => {
    if (!report) return null;
    return translateContextualMessage(
      t,
      generateContextualMessageData(report, {
        style: reportVariant === 'beta' ? 'analyst' : 'simple',
        variant: reportVariant,
      }),
    );
  }, [report, t, reportVariant]);
  if (isLoading) {
    return (
      <div className="game-report-scroll">
        <div className="relative flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
            <Pulse size={32} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!report || !labels || !message) {
    return (
      <div className="game-report-scroll">
        <div className="relative w-full max-w-md mx-auto rounded-2xl border border-woven-border bg-woven-surface p-6 text-center space-y-4">
          <p className="text-sm text-woven-text-muted">
            {t('stats.report.runUnavailable', 'Rapport de correction indisponible pour ce run.')}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={onPlayAgain}>
              {t('stats.unifiedReport.playAgain')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onBackToHome}>
              {t('stats.unifiedReport.backToHome')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-report-scroll">
      <div className="relative px-0 pt-0 pb-8 md:px-4 md:py-8">
        <UnifiedSessionReport
          data={report}
          message={message}
          labels={labels}
          onPlayAgain={onPlayAgain}
          onBackToHome={onBackToHome}
          onReplay={onReplay}
          onCorrect={onCorrect}
          showFloatingCloseButton
          betaEnabled={betaEnabled}
        />
      </div>
    </div>
  );
}
