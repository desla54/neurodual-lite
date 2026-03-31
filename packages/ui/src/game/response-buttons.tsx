/**
 * ResponseButtons - Position and Audio match buttons.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useButtonAnimation } from '../animations';

export interface ResponseButtonsProps {
  readonly onPositionMatch: () => void;
  readonly onAudioMatch: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Optional haptic trigger called on button press (light feedback) */
  readonly onHaptic?: () => void;
}

export function ResponseButtons({
  onPositionMatch,
  onAudioMatch,
  disabled = false,
  className = '',
  onHaptic,
}: ResponseButtonsProps): ReactNode {
  const { t } = useTranslation();
  const positionBtn = useButtonAnimation({ disabled });
  const audioBtn = useButtonAnimation({ disabled });

  return (
    <div className={`flex gap-4 justify-center ${className}`}>
      <button
        ref={positionBtn.ref}
        type="button"
        onClick={() => {
          onHaptic?.();
          onPositionMatch();
        }}
        disabled={disabled}
        className="flex-1 max-w-40 py-4 px-6 bg-visual text-white font-semibold rounded-xl
                   hover:brightness-110 active:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
        aria-label={t('game.aria.positionMatch')}
        {...positionBtn.handlers}
      >
        {t('common.position')}
      </button>
      <button
        ref={audioBtn.ref}
        type="button"
        onClick={() => {
          onHaptic?.();
          onAudioMatch();
        }}
        disabled={disabled}
        className="flex-1 max-w-40 py-4 px-6 bg-audio text-white font-semibold rounded-xl
                   hover:brightness-110 active:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all focus:outline-none focus:ring-2 focus:ring-audio focus:ring-offset-2"
        aria-label={t('game.aria.audioMatch')}
        {...audioBtn.handlers}
      >
        {t('common.audio')}
      </button>
    </div>
  );
}
