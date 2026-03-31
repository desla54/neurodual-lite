/**
 * ProgressBar primitive component.
 */

import type { ReactNode } from 'react';

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly showLabel?: boolean;
  readonly color?: 'primary' | 'audio' | 'visual' | 'destructive';
  readonly className?: string;
}

const colorClasses: Record<NonNullable<ProgressBarProps['color']>, string> = {
  primary: 'bg-primary',
  audio: 'bg-audio',
  visual: 'bg-visual',
  destructive: 'bg-destructive',
};

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  color = 'primary',
  className = '',
}: ProgressBarProps): ReactNode {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-[width] duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm text-muted-foreground mt-1">{Math.round(percentage)}%</span>
      )}
    </div>
  );
}
