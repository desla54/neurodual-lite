/**
 * Replay Recovery Modal
 *
 * Shows when a previous interactive correction was interrupted (page refresh, tab close).
 * Offers to resume the correction or start fresh.
 */

import type { ReplayRecoverySnapshot } from '@neurodual/logic';
import { Play, ArrowCounterClockwise, X, PencilLine } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ReplayRecoveryModalProps {
  /** The recovery snapshot data */
  readonly snapshot: ReplayRecoverySnapshot;
  /** Whether the session is stale (>30 min old) */
  readonly isStale: boolean;
  /** Called when user wants to resume */
  readonly onResume: () => void;
  /** Called when user wants to start fresh (abandon correction) */
  readonly onStartFresh: () => void;
  /** Called when modal is dismissed */
  readonly onDismiss: () => void;
}

/**
 * Format the time elapsed since snapshot.
 */
function formatTimeAgo(timestamp: number, language: string): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);

  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-hours, 'hour');
  }

  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    -Math.floor(hours / 24),
    'day',
  );
}

/**
 * Get session type display name.
 */
function getSessionTypeDisplayName(
  sessionType: ReplayRecoverySnapshot['sessionType'],
  t: (key: string) => string,
): string {
  const typeNames: Record<ReplayRecoverySnapshot['sessionType'], string> = {
    tempo: t('replayRecovery.types.tempo'),
    flow: t('replayRecovery.types.flow'),
    recall: t('replayRecovery.types.recall'),
    'dual-pick': t('replayRecovery.types.dualPick'),
    track: t('replayRecovery.types.tempo'),
  };
  return typeNames[sessionType] || sessionType;
}

/**
 * Format speed display.
 */
function formatSpeed(speed: 0.5 | 1 | 2): string {
  if (speed === 0.5) return '0.5x';
  if (speed === 1) return '1x';
  return '2x';
}

export function ReplayRecoveryModal({
  snapshot,
  isStale,
  onResume,
  onStartFresh,
  onDismiss,
}: ReplayRecoveryModalProps): ReactNode {
  const { t, i18n } = useTranslation();

  const timeAgo = formatTimeAgo(snapshot.timestamp, i18n.language);
  const typeName = getSessionTypeDisplayName(snapshot.sessionType, t);
  const speedDisplay = formatSpeed(snapshot.speed);

  // Format current time as MM:SS
  const currentSeconds = Math.floor(snapshot.currentTimeMs / 1000);
  const minutes = Math.floor(currentSeconds / 60);
  const seconds = currentSeconds % 60;
  const timeProgress = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-overlay-padding">
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
        onKeyDown={(e) => e.key === 'Escape' && onDismiss()}
      />

      {/* Modal */}
      <div
        data-testid="replay-recovery-modal"
        className="relative bg-surface border border-border rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <PencilLine size={28} className="text-amber-500" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-center text-foreground mb-2">
          {t('replayRecovery.title')}
        </h3>

        <p className="text-sm text-muted-foreground text-center mb-4">
          {t('replayRecovery.description')}
        </p>

        {/* Session info */}
        <div className="bg-secondary/50 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t('replayRecovery.type')}:</span>
              <span className="ml-2 text-foreground font-medium">{typeName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('replayRecovery.trial')}:</span>
              <span className="ml-2 text-foreground font-medium">{snapshot.currentTrialIndex}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('replayRecovery.time')}:</span>
              <span className="ml-2 text-foreground font-medium">{timeProgress}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('replayRecovery.speed')}:</span>
              <span className="ml-2 text-foreground font-medium">{speedDisplay}</span>
            </div>
          </div>

          {/* Time ago */}
          <div className="mt-3 text-xs text-center text-muted-foreground">
            {t('replayRecovery.interruptedAgo', { time: timeAgo })}
          </div>
        </div>

        {/* Stale warning */}
        {isStale && (
          <p className="text-xs text-amber-500 text-center mb-4">
            {t('replayRecovery.staleWarning')}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="replay-recovery-resume-button"
            onClick={onResume}
            className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-500/90 transition-colors flex items-center justify-center gap-2"
          >
            <Play size={18} />
            {t('replayRecovery.resume')}
          </button>
          <button
            type="button"
            data-testid="replay-recovery-abandon-button"
            onClick={onStartFresh}
            className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowCounterClockwise size={18} />
            {t('replayRecovery.abandon')}
          </button>
        </div>
      </div>
    </div>
  );
}
