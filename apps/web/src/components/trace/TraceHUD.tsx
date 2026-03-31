/**
 * TraceHUD - Thin wrapper around GameHUD for Dual Trace mode.
 */

import { memo, type ReactNode } from 'react';
import { GameHUD } from '@neurodual/ui';

export interface TraceHUDProps {
  trialIndex: number;
  totalTrials: number;
  nLevel: number;
  isPaused: boolean;
  countdownMode: boolean;
  showNLevel: boolean;
  showProgressBar: boolean;
  canPause: boolean;
  onTogglePause: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onRestartFromPause?: () => void;
  onHaptic?: (durationMs?: number) => void;
}

export const TraceHUD = memo(function TraceHUD({
  trialIndex,
  totalTrials,
  nLevel,
  isPaused,
  countdownMode,
  showNLevel,
  showProgressBar,
  canPause,
  onTogglePause,
  onSettings,
  onQuit,
  onRestartFromPause,
  onHaptic,
}: TraceHUDProps): ReactNode {
  return (
    <GameHUD
      label={showNLevel ? `N-${nLevel}` : undefined}
      trialIndex={trialIndex}
      totalTrials={totalTrials}
      countdownMode={countdownMode}
      isPaused={isPaused}
      canPause={canPause}
      onTogglePause={onTogglePause}
      onSettings={onSettings}
      onQuit={onQuit}
      onRestart={onRestartFromPause}
      showProgressBar={showProgressBar}
      onHaptic={onHaptic}
    />
  );
});
