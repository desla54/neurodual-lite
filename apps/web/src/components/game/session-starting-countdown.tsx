import type { ReactNode } from 'react';
import { AnimatedCountdownDigits } from './animated-countdown-digits';

export function SessionStartingCountdown({
  phase,
  prepDelayMs,
  getReadyText,
  onCountdownSecond,
  scheduleAudio,
  className = 'text-sm text-muted-foreground animate-in fade-in duration-200',
}: {
  phase: string;
  prepDelayMs: number;
  getReadyText: string;
  onCountdownSecond?: (value: 3 | 2 | 1 | 0) => void;
  scheduleAudio?: (prepDelayMs: number) => () => void;
  className?: string;
}): ReactNode {
  if (phase !== 'starting' && phase !== 'countdown') {
    return null;
  }

  if (phase === 'starting') {
    return <p className={className}>{getReadyText}</p>;
  }

  return (
    <p className={className}>
      {getReadyText}
      <AnimatedCountdownDigits
        prepDelayMs={prepDelayMs}
        onCountdownSecond={onCountdownSecond}
        scheduleAudio={scheduleAudio}
      />
    </p>
  );
}
