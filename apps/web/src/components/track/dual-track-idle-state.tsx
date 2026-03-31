import type { ReactNode } from 'react';
import { InfoSheet } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface DualTrackIdleStateProps {
  readonly calibrationPending: boolean;
  readonly totalRounds: number;
  readonly targetCount: number;
  readonly distractorCount: number;
  readonly showJourneyTierSummary: boolean;
  readonly currentJourneyTierValue: number | null;
  readonly currentJourneyTierCount: number;
  readonly journeyTierHelpText: string;
  readonly adaptivePathEnabled: boolean;
  readonly pathLoaded: boolean;
  readonly isLaunching: boolean;
  readonly statusNote?: string | null;
  readonly onStart: () => void;
}

export function DualTrackIdleState({
  calibrationPending,
  totalRounds,
  targetCount,
  distractorCount,
  showJourneyTierSummary,
  currentJourneyTierValue,
  currentJourneyTierCount,
  journeyTierHelpText,
  adaptivePathEnabled,
  pathLoaded,
  isLaunching,
  statusNote,
  onStart,
}: DualTrackIdleStateProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-bold text-woven-text">
        {t('game.dualTrack.dualTrack', 'Dual Track')}
      </h1>
      <p className="max-w-xs text-sm text-woven-text-muted">
        {calibrationPending
          ? t(
              'game.dualTrack.calibrationDescription',
              'Avant la première étape, une calibration plus longue va estimer votre niveau de départ.',
            )
          : t(
              'game.dualTrack.defaultDescription',
              "Des boules vont s'illuminer. Suivez-les pendant qu'elles bougent, puis identifiez-les.",
            )}
      </p>
      <p
        className="max-w-md text-sm font-medium leading-relaxed text-woven-text-muted sm:text-base"
        data-testid="dual-track-intro-summary"
      >
        <span>
          {calibrationPending
            ? t('game.dualTrack.calibrationRoundsLabel', '{{count}} rounds de calibration', {
                count: totalRounds,
              })
            : t('game.dualTrack.targetsCountLabel', '{{count}} cibles', {
                count: targetCount,
              })}
        </span>
        {!calibrationPending ? (
          <>
            {' · '}
            <span>
              {t('game.dualTrack.distractorsCountLabel', '{{count}} distracteurs', {
                count: distractorCount,
              })}
            </span>
          </>
        ) : null}
        {!calibrationPending ? (
          <>
            {' · '}
            <span>
              {t('game.dualTrack.roundsCountLabel', '{{count}} rounds', {
                count: totalRounds,
              })}
            </span>
          </>
        ) : null}
        {showJourneyTierSummary && currentJourneyTierValue !== null ? (
          <>
            {' · '}
            <span className="inline-flex items-center gap-1 font-semibold text-woven-text">
              {t('game.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                current: currentJourneyTierValue,
                total: currentJourneyTierCount,
              })}
              <InfoSheet
                iconSize={11}
                triggerClassName="text-woven-text-muted/70 hover:text-woven-text"
              >
                {journeyTierHelpText}
              </InfoSheet>
            </span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onStart}
        disabled={isLaunching || (adaptivePathEnabled && !pathLoaded)}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-8 py-3 text-base font-semibold text-white transition hover:bg-cyan-500 active:scale-95 disabled:cursor-wait disabled:opacity-70"
      >
        {isLaunching ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <span>{t('common.loading', 'Loading...')}</span>
          </>
        ) : adaptivePathEnabled && !pathLoaded ? (
          t('common.loading', 'Chargement...')
        ) : calibrationPending ? (
          t('game.dualTrack.startCalibration', 'Démarrer la calibration')
        ) : (
          t('common.start', 'Commencer')
        )}
      </button>
      {statusNote ? (
        <p className="max-w-sm text-xs font-medium text-woven-text-muted">{statusNote}</p>
      ) : null}
    </div>
  );
}
