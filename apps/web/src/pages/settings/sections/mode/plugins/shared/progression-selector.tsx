/**
 * Progression algorithm selector component
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Robot } from '@phosphor-icons/react';
import type { ProgressionAlgorithmId } from '../../../../../../stores';
import { InfoSheet } from '@neurodual/ui';
import { ALGORITHM_OPTIONS } from '../../../../config';

interface ProgressionSelectorProps {
  algorithm: ProgressionAlgorithmId;
  onAlgorithmChange: (algorithm: ProgressionAlgorithmId) => void;
  sessionCount: number;
}

export function ProgressionSelector({
  algorithm,
  onAlgorithmChange,
  sessionCount,
}: ProgressionSelectorProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
        <Robot size={14} weight="regular" />
        {t('settings.progression.title', 'Progression')}
        <InfoSheet iconSize={12}>
          {t('settings.progression.info', 'The algorithm determines how the level evolves')}
        </InfoSheet>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {ALGORITHM_OPTIONS.map((option) => {
          const isActive = algorithm === option.id;
          const requiresSessions = option.requiresSessions ?? 0;
          const isLocked = sessionCount < requiresSessions;

          return (
            <button
              key={option.id}
              type="button"
              disabled={isLocked}
              onClick={() => onAlgorithmChange(option.id)}
              className={`relative p-3 rounded-xl text-left transition-all ${
                isActive
                  ? 'bg-violet-500 text-white shadow-md'
                  : isLocked
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-muted text-foreground hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{t(option.labelKey)}</div>
                  <div
                    className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}
                  >
                    {t(option.descKey)}
                  </div>
                </div>
                {isLocked && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock size={12} weight="bold" />
                    <span>
                      {t('settings.progression.requiresSessions', '{{count}} sessions', {
                        count: requiresSessions,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
