/**
 * TraceTutorialControls - Simplified swipe controls for Trace tutorial
 *
 * Instead of real swipe gestures (complex for a tutorial), we use:
 * - A mini 3x3 grid where user taps the target N-back position
 * - A separate button for audio match (double-tap equivalent)
 *
 * This teaches the CONCEPT of active recall without the gesture complexity.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { MusicNote } from '@phosphor-icons/react';
import type { ExpectedSwipe } from '@neurodual/logic';

// Grid mapping: visual index → logical position (8 positions, center is null)
const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

interface TraceTutorialControlsProps {
  /** Expected swipe response for current step */
  expectedSwipe: ExpectedSwipe | undefined;
  /** Whether the user has already responded with position */
  positionResponded: boolean;
  /** Whether the user has already responded with audio */
  audioResponded: boolean;
  /** Callback when user taps a position */
  onPositionTap: (position: number) => void;
  /** Callback when user taps audio match button */
  onAudioTap: () => void;
  /** Whether controls are disabled */
  disabled?: boolean;
}

export function TraceTutorialControls({
  expectedSwipe,
  positionResponded,
  audioResponded,
  onPositionTap,
  onAudioTap,
  disabled = false,
}: TraceTutorialControlsProps) {
  const { t } = useTranslation();

  const targetPosition = expectedSwipe?.targetPosition;
  const hasAudioMatch = expectedSwipe?.audioMatch ?? false;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      {/* Instruction text */}
      <p className="text-sm text-woven-text-muted text-center">
        {hasAudioMatch && !audioResponded
          ? t('tutorial.trace.tapTargetAndAudio', 'Tap the target position, then Audio')
          : t('tutorial.trace.tapTarget', 'Tap the previous turn position')}
      </p>

      {/* Mini grid for position selection */}
      <div className="flex items-center gap-6">
        <div
          className={cn(
            'grid grid-cols-3 gap-1.5 p-3 rounded-xl',
            'bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm',
          )}
        >
          {GRID_MAP.map((logicPos, idx) => {
            if (logicPos === null) {
              // Center cell - crosshair
              return (
                <div key="center" className="w-10 h-10 relative flex items-center justify-center">
                  <div className="absolute w-1/2 h-[2px] bg-woven-text-muted/30" />
                  <div className="absolute h-1/2 w-[2px] bg-woven-text-muted/30" />
                </div>
              );
            }

            const isTarget = logicPos === targetPosition;
            const isSelected = positionResponded && isTarget;

            return (
              <button
                key={idx}
                type="button"
                disabled={disabled || positionResponded}
                onClick={() => onPositionTap(logicPos)}
                className={cn(
                  'w-10 h-10 rounded-lg transition-all duration-150',
                  'border-2',
                  // Default state
                  !isTarget && 'bg-woven-cell-rest border-transparent',
                  // Target highlight (pulsing)
                  isTarget &&
                    !isSelected &&
                    'bg-visual/20 border-visual animate-pulse cursor-pointer',
                  // Selected state
                  isSelected && 'bg-visual border-visual',
                  // Disabled
                  (disabled || positionResponded) && !isTarget && 'opacity-50',
                )}
                aria-label={`Position ${logicPos}`}
              />
            );
          })}
        </div>

        {/* Audio match button (only shown when audio match expected) */}
        {hasAudioMatch && (
          <button
            type="button"
            disabled={disabled || audioResponded || !positionResponded}
            onClick={onAudioTap}
            className={cn(
              'flex flex-col items-center justify-center gap-1',
              'w-16 h-16 rounded-xl transition-all duration-150',
              'border-2',
              // Waiting for position first
              !positionResponded && 'bg-woven-surface border-woven-border opacity-50',
              // Ready to tap
              positionResponded &&
                !audioResponded &&
                'bg-audio/20 border-audio animate-pulse cursor-pointer',
              // Already selected
              audioResponded && 'bg-audio border-audio',
            )}
          >
            <MusicNote
              size={24}
              weight="bold"
              className={cn('transition-colors', audioResponded ? 'text-white' : 'text-audio')}
            />
            <span
              className={cn('text-xs font-semibold', audioResponded ? 'text-white' : 'text-audio')}
            >
              {t('tutorial.controls.audio')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
