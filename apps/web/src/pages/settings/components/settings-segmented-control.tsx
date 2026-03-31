import type { ReactNode } from 'react';
import { cn } from '@neurodual/ui';

export interface SettingsSegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}

interface SettingsSegmentedControlProps<T extends string> {
  readonly value: T;
  readonly options: readonly SettingsSegmentedOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly size?: 'default' | 'icon';
  readonly className?: string;
}

export function SettingsSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  size = 'default',
  className,
}: SettingsSegmentedControlProps<T>): ReactNode {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full bg-woven-cell-rest p-1',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const isDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.ariaLabel}
            disabled={isDisabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full font-medium transition-all active:scale-95',
              size === 'icon' ? 'h-10 w-10 flex items-center justify-center' : 'h-10 px-3 text-xs',
              active
                ? 'bg-woven-text text-woven-bg active:bg-woven-text/80'
                : 'text-woven-text-muted hover:text-woven-text active:bg-woven-cell-rest/80',
              isDisabled && 'pointer-events-none',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
