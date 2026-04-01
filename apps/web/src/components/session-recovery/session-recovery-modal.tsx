/**
 * Session Recovery Modal
 *
 * Shows when a previous session was interrupted (page refresh, tab close).
 * Offers to resume the session or start fresh.
 */

import type { SessionRecoverySnapshot } from '@neurodual/logic';
import { Play, ArrowCounterClockwise, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface SessionRecoveryModalProps {
  /** The recovery snapshot data */
  readonly snapshot: SessionRecoverySnapshot;
  /** Whether the session is stale (>30 min old) */
  readonly isStale: boolean;
  /** Called when user wants to resume */
  readonly onResume: () => void;
  /** Called when user wants to start fresh */
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
 * Get mode display name.
 */
function getModeDisplayName(
  modeId: SessionRecoverySnapshot['modeId'],
  t: (key: string) => string,
): string {
  const modeNames: Record<SessionRecoverySnapshot['modeId'], string> = {
    game: t('recovery.modes.game'),
    'active-training': t('recovery.modes.activeTraining'),
    'place-training': t('recovery.modes.flowTraining'),
    'dual-pick-training': t('recovery.modes.dualPickTraining'),
    'trace-training': t('recovery.modes.traceTraining'),
  };
  return modeNames[modeId] || modeId;
}

export function SessionRecoveryModal({
  snapshot,
  isStale,
  onResume,
  onStartFresh,
  onDismiss,
}: SessionRecoveryModalProps): ReactNode {
  const { t, i18n } = useTranslation();

  const progress = Math.round((snapshot.trialIndex / snapshot.totalTrials) * 100);
  const timeAgo = formatTimeAgo(snapshot.timestamp, i18n.language);
  const modeName = getModeDisplayName(snapshot.modeId, t);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-overlay-padding">
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60"
        onClick={onDismiss}
        onKeyDown={(e) => e.key === 'Escape' && onDismiss()}
      />

      {/* Modal */}
      <div
        data-testid="session-recovery-modal"
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
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Play size={28} className="text-primary ml-1" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-center text-foreground mb-2">
          {t('recovery.title')}
        </h3>

        <p className="text-sm text-muted-foreground text-center mb-4">
          {t('recovery.description')}
        </p>

        {/* Session info */}
        <div className="bg-secondary/50 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t('recovery.mode')}:</span>
              <span className="ml-2 text-foreground font-medium">{modeName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('recovery.level')}:</span>
              <span className="ml-2 text-foreground font-medium">
                {snapshot.nLevel ?? snapshot.config.nLevel}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('recovery.progress')}:</span>
              <span className="ml-2 text-foreground font-medium">{progress}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('recovery.timeAgo')}:</span>
              <span className="ml-2 text-foreground font-medium">{timeAgo}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stale warning */}
        {isStale && (
          <p className="text-xs text-amber-500 text-center mb-4">{t('recovery.staleWarning')}</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="recovery-resume-button"
            onClick={onResume}
            className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Play size={18} />
            {t('recovery.resume')}
          </button>
          <button
            type="button"
            data-testid="recovery-start-fresh-button"
            onClick={onStartFresh}
            className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowCounterClockwise size={18} />
            {t('recovery.startFresh')}
          </button>
        </div>
      </div>
    </div>
  );
}
