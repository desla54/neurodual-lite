/**
 * StimulusDisplay - shows current trial info and audio letter.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface StimulusDisplayProps {
  readonly currentTrial: number;
  readonly totalTrials: number;
  readonly nLevel: number;
  readonly audioLetter?: string;
  readonly className?: string;
}

export function StimulusDisplay({
  currentTrial,
  totalTrials,
  nLevel,
  audioLetter,
  className = '',
}: StimulusDisplayProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className={`text-center ${className}`}>
      <div className="text-sm text-gray-500 mb-1">
        {t('game.hud.trial', 'Trial')} {currentTrial + 1} / {totalTrials}
      </div>
      <div className="text-lg font-semibold text-gray-700">{nLevel}-Back</div>
      {audioLetter && (
        <div className="mt-4 text-4xl font-bold text-blue-600" aria-live="polite">
          <span className="sr-only">{t('game.aria.audioLetter')} </span>
          {audioLetter.toUpperCase()}
        </div>
      )}
    </div>
  );
}
