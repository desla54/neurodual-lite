/**
 * N-Level slider component
 *
 * All N-levels are now accessible to all users.
 * Premium gating is time-based (daily playtime limit), not level-based.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface NLevelSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  onUpgradeClick?: () => void;
  labelKey?: string;
  minLevel?: number;
}

export function NLevelSlider({
  value,
  onChange,
  disabled = false,
  labelKey = 'settings.config.nLevel',
  minLevel = 1,
}: NLevelSliderProps): ReactNode {
  const { t } = useTranslation();

  const levels = Array.from({ length: 10 - minLevel + 1 }, (_, i) => minLevel + i);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-foreground">{t(labelKey)}</span>
        <span className="font-mono text-xl font-bold text-primary">N-{value}</span>
      </div>

      <div className="flex gap-1.5">
        {levels.map((level) => {
          const isActive = level === value;

          return (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onClick={() => onChange(level)}
              className={`relative flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-md scale-105 z-10'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {level}
            </button>
          );
        })}
      </div>
    </div>
  );
}
