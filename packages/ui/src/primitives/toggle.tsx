/**
 * Toggle switch component for settings
 */

import type { ReactNode } from 'react';

export interface ToggleProps {
  readonly label: string;
  readonly labelRight?: ReactNode;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly activeColor?: 'primary' | 'audio' | 'visual';
}

export function Toggle({
  label,
  labelRight,
  description,
  checked,
  onChange,
  disabled = false,
  icon,
  activeColor = 'primary',
}: ToggleProps): ReactNode {
  const colorClasses = {
    primary: checked ? 'bg-primary' : 'bg-muted',
    audio: checked ? 'bg-audio' : 'bg-muted',
    visual: checked ? 'bg-visual' : 'bg-muted',
  };

  const iconBgClasses = {
    primary: checked ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground',
    audio: checked ? 'bg-audio/10 text-audio' : 'bg-secondary text-muted-foreground',
    visual: checked ? 'bg-visual/10 text-visual' : 'bg-secondary text-muted-foreground',
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div
            className={`p-2.5 rounded-2xl shrink-0 transition-colors ${iconBgClasses[activeColor]}`}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <div className="font-medium text-foreground truncate">{label}</div>
            {labelRight ? <span className="shrink-0">{labelRight}</span> : null}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-2">
              {description}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors duration-300 ${colorClasses[activeColor]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`block w-5 h-5 bg-surface rounded-full shadow-sm transition-transform duration-300 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
