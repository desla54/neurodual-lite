import type { ReactNode } from 'react';
import { generateContextualMessageData } from '@neurodual/logic';
import { CanvasWeave, GameControls, Grid, UnifiedSessionReport, cn } from '@neurodual/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedCountdownDigits } from '../components/game/animated-countdown-digits';
import { CognitiveTaskHUD } from '../components/game/CognitiveTaskHUD';
import { DualMixGridlockBoard } from '../components/game/dual-mix-gridlock-board';
import { GameQuitModal } from '../components/game/game-quit-modal';
import { useHaptic } from '../hooks/use-haptic';
import { useDualMixSession } from '../hooks/use-dual-mix-session';
import { useUnifiedReportLabels } from '../hooks/use-unified-report-labels';
import { DUAL_MIX_PREP_DELAY_MS } from '../lib/dual-mix-session';
import { useAppPorts } from '../providers';
import { getStatsPresetForReport } from '../lib/stats-preset';
import { useTransitionNavigate } from '../hooks/use-transition-navigate';
import { useSettingsStore } from '../stores';
import { translateContextualMessage } from '../utils/contextual-message';

function StartingCountdown({
  phase,
  getReadyText,
  scheduleAudio,
}: {
  phase: string;
  getReadyText: string;
  scheduleAudio?: (prepDelayMs: number) => () => void;
}): ReactNode {
  if (phase !== 'starting' && phase !== 'countdown') return null;
  if (phase === 'starting') {
    return <p className="text-sm text-muted-foreground">{getReadyText}</p>;
  }

  return (
    <p className="text-sm text-muted-foreground">
      {getReadyText}{' '}
      <AnimatedCountdownDigits
        prepDelayMs={DUAL_MIX_PREP_DELAY_MS}
        scheduleAudio={scheduleAudio}
      />
    </p>
  );
}

export function DualMixTrainingPage(): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const haptic = useHaptic();
  const { audio } = useAppPorts();
  const unifiedReportLabels = useUnifiedReportLabels();
  const [showQuitModal, setShowQuitModal] = useState(false);
  const setStatsTab = useSettingsStore((state) => state.setStatsTab);
  const setStatsMode = useSettingsStore((state) => state.setStatsMode);
  const setStatsJourneyFilter = useSettingsStore((state) => state.setStatsJourneyFilter);

  const {
    phase,
    round,
    totalRounds,
    nLevel,
    canPause,
    isStarting,
    manualAdvance,
    colors,
    currentStimulus,
    currentStroopTrial,
    currentInkCss,
    currentRuleLabel,
    lastStroopFeedback,
    gridlockBoard,
    summary,
    completionReport,
    modeLabel,
    startSession,
    togglePause,
    restartSession,
    abandonSession,
    togglePositionMatch,
    toggleAudioMatch,
    submitNBackRound,
    submitStroopResponse,
    submitGridlockMove,
  } = useDualMixSession();

  if (phase === 'finished' && summary && completionReport) {
    const contextMessage = translateContextualMessage(
      t,
      generateContextualMessageData(completionReport, {
        style: 'simple',
        variant: 'stable',
      }),
    );

    return (
      <div className="game-report-scroll">
        <UnifiedSessionReport
          data={completionReport}
          message={contextMessage}
          labels={{
            ...unifiedReportLabels,
            modeScoreLabel: t(completionReport.modeScore.labelKey),
            modeScoreTooltip: completionReport.modeScore.tooltipKey
              ? t(completionReport.modeScore.tooltipKey)
              : undefined,
          }}
          onPlayAgain={restartSession}
          onBackToHome={() => transitionNavigate('/')}
          onGoToStats={(report) => {
            const preset = getStatsPresetForReport(report);
            setStatsTab(preset.tab);
            setStatsMode(preset.mode);
            setStatsJourneyFilter(preset.journeyFilter);
            transitionNavigate('/stats');
          }}
        />
      </div>
    );
  }

  if (phase === 'finished' && summary && !completionReport) {
    return (
      <div className="game-page-shell">
        <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {t('stats.report.loading', 'Loading report...')}
        </div>
      </div>
    );
  }

  return (
    <div className="game-page-shell">
      <CognitiveTaskHUD
        label={modeLabel}
        overrideNLevel={nLevel}
        trialIndex={round}
        totalTrials={totalRounds}
        onQuit={() => setShowQuitModal(true)}
        isPaused={phase === 'paused'}
        canPause={canPause || phase === 'paused'}
        onTogglePause={togglePause}
      />

      <div className="flex h-10 items-center justify-center px-4 text-center">
        <StartingCountdown
          phase={phase}
          getReadyText={t('game.starting.getReady', 'Get ready')}
          scheduleAudio={(prepDelayMs) => audio.scheduleCountdownTicks?.(prepDelayMs) ?? (() => {})}
        />
      </div>

      <div className="game-page-stage">
        <div className="relative flex aspect-square w-full max-w-[360px] items-center justify-center overflow-hidden rounded-2xl border border-white/18 bg-woven-surface shadow-[0_24px_60px_hsl(var(--foreground)/0.10)] sm:max-w-[420px]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.40),hsl(var(--background)/0.18))]" />
          <CanvasWeave opacity={0.15} className="stroke-neutral-400" />

          <div className="relative z-10 flex h-full w-full items-center justify-center">
            {(phase === 'idle' ||
              phase === 'starting' ||
              phase === 'countdown' ||
              phase === 'nback-stimulus' ||
              phase === 'nback-response') && (
              <Grid
                activePosition={
                  phase === 'nback-stimulus' && currentStimulus ? currentStimulus.position : null
                }
                showStimulus={phase === 'nback-stimulus'}
                showPlayButton={phase === 'idle'}
                onPlay={() => {
                  if (isStarting) return;
                  startSession();
                }}
                className="h-full w-full"
              />
            )}

            {phase === 'stroop-fixation' && (
              <span className="select-none text-4xl font-bold text-woven-text-muted">+</span>
            )}

            {phase === 'stroop-stimulus' && currentStroopTrial && (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                <div className="rounded-full border border-woven-border/70 bg-woven-bg/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-woven-text-muted">
                  {t('game.cogTask.stroopFlex.followRule')}: {currentRuleLabel}
                </div>
                <span
                  className="select-none text-5xl font-black tracking-tight sm:text-6xl"
                  style={{ color: currentInkCss }}
                >
                  {currentStroopTrial.word}
                </span>
              </div>
            )}

            {phase === 'stroop-feedback' && (
              <span
                className={cn(
                  'select-none text-3xl font-black',
                  lastStroopFeedback ? 'text-woven-correct' : 'text-woven-incorrect',
                )}
              >
                {lastStroopFeedback
                  ? t('game.cogTask.feedbackCorrect')
                  : t('game.cogTask.feedbackIncorrect')}
              </span>
            )}

            {phase === 'gridlock-move' && (
              <DualMixGridlockBoard
                board={gridlockBoard}
                active
                onMove={submitGridlockMove}
                onHaptic={(durationMs) => haptic.vibrate(durationMs)}
              />
            )}

            {phase === 'round-isi' && (
              <span className="select-none animate-pulse text-sm text-woven-text-muted">···</span>
            )}

            {phase === 'paused' && (
              <span className="select-none text-xl font-bold uppercase tracking-wider text-woven-text-muted">
                {t('game.status.paused')}
              </span>
            )}
          </div>
        </div>

        <div className="relative min-h-[11.5rem] w-full max-w-[360px] sm:max-w-[420px]">
          <div
            className={cn(
              'absolute inset-0 flex flex-col items-center gap-2 transition-opacity',
              phase === 'nback-stimulus' || phase === 'nback-response'
                ? 'opacity-100'
                : 'pointer-events-none opacity-0',
            )}
          >
            <GameControls
              onVisualClick={togglePositionMatch}
              onAudioClick={toggleAudioMatch}
              disabled={phase !== 'nback-stimulus' && phase !== 'nback-response'}
              onHaptic={() => haptic.vibrate(30)}
            />
            <button
              type="button"
              onClick={submitNBackRound}
              disabled={phase !== 'nback-response' || !manualAdvance}
              className={cn(
                'w-full rounded-lg border border-border/40 py-2.5 text-sm font-medium text-muted-foreground transition-all touch-manipulation',
                phase === 'nback-response' && manualAdvance
                  ? 'hover:bg-muted/30 active:scale-[0.98]'
                  : 'pointer-events-none opacity-0',
              )}
            >
              {t('common.next', 'Next')} →
            </button>
          </div>

          <div
            className={cn(
              'absolute inset-0 grid grid-cols-2 gap-3 transition-opacity',
              phase === 'stroop-stimulus' || phase === 'stroop-fixation'
                ? 'opacity-100'
                : 'pointer-events-none opacity-0',
            )}
          >
            {colors.map((color) => (
              <button
                key={color.id}
                type="button"
                disabled={phase !== 'stroop-stimulus'}
                onClick={() => submitStroopResponse(color.id)}
                className={cn(
                  'rounded-xl border border-white/20 py-4 text-base font-bold text-white transition-all active:scale-95 touch-manipulation',
                  color.twClass,
                  phase !== 'stroop-stimulus' ? 'opacity-40' : 'opacity-100',
                )}
              >
                {color.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <GameQuitModal
        open={showQuitModal}
        labels={{
          title: t('game.quitModal.title'),
          message: t('game.quitModal.message'),
          cancel: t('common.cancel'),
          confirm: t('game.quitModal.confirm'),
          close: t('common.close', 'Close'),
        }}
        onCancel={() => setShowQuitModal(false)}
        onConfirm={() => {
          setShowQuitModal(false);
          abandonSession();
          transitionNavigate('/');
        }}
      />
    </div>
  );
}
