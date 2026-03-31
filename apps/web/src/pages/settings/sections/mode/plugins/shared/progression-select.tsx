/**
 * Progression algorithm select component
 *
 * Replaces the old card-based ProgressionSelector with a clean Select dropdown.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Robot, Lock } from '@phosphor-icons/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
} from '@neurodual/ui';
import type { ProgressionAlgorithmId } from '../../../../../../stores';
import { ALGORITHM_OPTIONS } from '../../../../config';

interface ProgressionSelectProps {
  algorithm: ProgressionAlgorithmId;
  onAlgorithmChange: (algorithm: ProgressionAlgorithmId) => void;
  sessionCount: number;
}

export function ProgressionSelect({
  algorithm,
  onAlgorithmChange,
  sessionCount,
}: ProgressionSelectProps): ReactNode {
  const { t } = useTranslation();

  const handleValueChange = (value: string) => {
    const option = ALGORITHM_OPTIONS.find((o) => o.id === value);
    if (option) {
      const requiresSessions = option.requiresSessions ?? 0;
      if (sessionCount >= requiresSessions) {
        onAlgorithmChange(value as ProgressionAlgorithmId);
      }
    }
  };

  const currentOption = ALGORITHM_OPTIONS.find((o) => o.id === algorithm);

  return (
    <SettingRow
      label={t('settings.progression.title', 'Progression')}
      description={t(
        'settings.progression.info',
        "L'algorithme détermine comment le niveau évolue",
      )}
      icon={<Robot size={20} weight="regular" />}
      colorTheme="mode"
    >
      <Select value={algorithm} onValueChange={handleValueChange}>
        <SelectTrigger className="w-32 h-10" aria-label={t('settings.progression.title')}>
          <SelectValue>{currentOption ? t(currentOption.labelKey) : algorithm}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ALGORITHM_OPTIONS.map((option) => {
            const requiresSessions = option.requiresSessions ?? 0;
            const isLocked = sessionCount < requiresSessions;

            return (
              <SelectItem key={option.id} value={option.id} disabled={isLocked}>
                <span className="flex items-center gap-2">
                  {t(option.labelKey)}
                  {isLocked && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock size={10} weight="bold" />
                      {requiresSessions}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
