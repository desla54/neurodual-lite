import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface BetaBadgeProps {
  readonly label?: string;
  readonly size?: 'xs' | 'sm' | 'md';
  readonly className?: string;
}

const sizeClasses: Record<NonNullable<BetaBadgeProps['size']>, string> = {
  // Extra-small, intended for test mode cards where subtlety matters.
  xs: 'text-xxs px-0.5 py-px leading-none',
  // Slightly smaller, intended for section/accordion headers.
  sm: 'text-3xs px-1 py-0.5 leading-none',
  // Matches the existing UPS badge style.
  md: 'text-xxs px-1.5 py-0.5',
};

export function BetaBadge({ label = 'Beta', size = 'sm', className }: BetaBadgeProps): ReactNode {
  return (
    <span
      className={cn(
        'font-bold uppercase tracking-wide text-amber-600/40 bg-amber-500/5 rounded',
        sizeClasses[size],
        className,
      )}
    >
      {label}
    </span>
  );
}
