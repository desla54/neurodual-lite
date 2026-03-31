/**
 * AccuracyGauge - circular progress indicator for accuracy.
 */

import type { ReactNode } from 'react';

export interface AccuracyGaugeProps {
  readonly value: number;
  readonly label: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
}

const sizeConfig: Record<
  NonNullable<AccuracyGaugeProps['size']>,
  { size: number; stroke: number; fontSize: string }
> = {
  sm: { size: 60, stroke: 4, fontSize: 'text-sm' },
  md: { size: 80, stroke: 5, fontSize: 'text-lg' },
  lg: { size: 100, stroke: 6, fontSize: 'text-xl' },
};

function getColor(value: number): string {
  if (value >= 80) {
    return 'text-emerald-500';
  }
  if (value >= 60) {
    return 'text-amber-500';
  }
  return 'text-pink-500';
}

export function AccuracyGauge({
  value,
  label,
  size = 'md',
  className = '',
}: AccuracyGaugeProps): ReactNode {
  const config = sizeConfig[size];
  const radius = (config.size - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, value));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg width={config.size} height={config.size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          className="text-gray-200"
        />
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-500 ${getColor(progress)}`}
        />
      </svg>
      <div className={`mt-1 ${config.fontSize} font-semibold ${getColor(progress)}`}>
        {Math.round(progress)}%
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
