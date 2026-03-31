/**
 * StatCard - displays a single statistic with label.
 */

import type { ReactNode } from 'react';

export interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly icon?: ReactNode;
  readonly trend?: 'up' | 'down' | 'neutral';
  readonly className?: string;
}

const trendColors: Record<NonNullable<StatCardProps['trend']>, string> = {
  up: 'text-emerald-500',
  down: 'text-pink-500',
  neutral: 'text-slate-500',
};

export function StatCard({ label, value, icon, trend, className = '' }: StatCardProps): ReactNode {
  return (
    <div className={`bg-surface rounded-xl p-4 border border-border ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${trend ? trendColors[trend] : 'text-gray-800'}`}>
        {value}
      </div>
    </div>
  );
}
