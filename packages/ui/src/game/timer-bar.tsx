/**
 * TimerBar - visual countdown timer for trial duration.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface TimerBarProps {
  readonly progress: number;
  readonly className?: string;
}

export function TimerBar({ progress, className = '' }: TimerBarProps): ReactNode {
  const { t } = useTranslation();
  const percentage = Math.min(100, Math.max(0, progress * 100));

  return (
    <div className={`w-full h-1 bg-woven-cell-rest/30 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary transition-all duration-100"
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('game.aria.trialTimer')}
      />
    </div>
  );
}
