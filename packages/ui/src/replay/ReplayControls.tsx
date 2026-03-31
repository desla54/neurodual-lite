// packages/ui/src/replay/ReplayControls.tsx
/**
 * Replay Controls
 *
 * Play/Pause button, speed selector, and progress bar for replay.
 */

import { Pause, Play, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useCallback } from 'react';
import { useReplayState, type ReplaySpeed } from './use-replay-state';

// =============================================================================
// Types
// =============================================================================

export interface ReplayControlsLabels {
  play: string;
  pause: string;
  restart: string;
  speed: string;
}

export interface ReplayControlsProps {
  labels: ReplayControlsLabels;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// =============================================================================
// Speed Button
// =============================================================================

function SpeedButton({
  speed,
  currentSpeed,
  onClick,
}: {
  speed: ReplaySpeed;
  currentSpeed: ReplaySpeed;
  onClick: (speed: ReplaySpeed) => void;
}) {
  const isActive = speed === currentSpeed;
  return (
    <button
      type="button"
      onClick={() => onClick(speed)}
      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      }`}
    >
      {speed}x
    </button>
  );
}

// =============================================================================
// Progress Bar
// =============================================================================

function ProgressBar({
  progress,
  onSeek,
}: {
  progress: number;
  onSeek: (progress: number) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newProgress = Math.max(0, Math.min(1, x / rect.width));
      onSeek(newProgress);
    },
    [onSeek],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 0.05;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        onSeek(Math.min(1, progress + step));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        onSeek(Math.max(0, progress - step));
      } else if (e.key === 'Home') {
        onSeek(0);
      } else if (e.key === 'End') {
        onSeek(1);
      }
    },
    [onSeek, progress],
  );

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="h-2 bg-secondary rounded-full cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="h-full bg-primary transition-all duration-100"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ReplayControls({ labels }: ReplayControlsProps) {
  const {
    status,
    currentTimeMs,
    speed,
    progress,
    session,
    togglePlayPause,
    setSpeed,
    seekToProgress,
    seek,
  } = useReplayState();

  const isPlaying = status === 'playing';
  const isFinished = status === 'finished';
  const totalDurationMs = session?.totalDurationMs ?? 0;

  const handleRestart = useCallback(() => {
    seek(0);
  }, [seek]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-card rounded-xl border">
      {/* Progress bar */}
      <ProgressBar progress={progress} onSeek={seekToProgress} />

      {/* Time display */}
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>{formatTime(currentTimeMs)}</span>
        <span>{formatTime(totalDurationMs)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Play/Pause/Restart */}
        <div className="flex items-center gap-2">
          {isFinished ? (
            <button
              type="button"
              onClick={handleRestart}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label={labels.restart}
            >
              <ArrowCounterClockwise className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label={isPlaying ? labels.pause : labels.play}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
          )}
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">{labels.speed}:</span>
          <SpeedButton speed={0.5} currentSpeed={speed} onClick={setSpeed} />
          <SpeedButton speed={1} currentSpeed={speed} onClick={setSpeed} />
          <SpeedButton speed={2} currentSpeed={speed} onClick={setSpeed} />
        </div>
      </div>
    </div>
  );
}
