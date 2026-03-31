/**
 * N-Level select component
 *
 * All N-levels are accessible to all users.
 * Premium gating is time-based (daily playtime limit), not level-based.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InfoSheet,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neurodual/ui';

interface NLevelSelectProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  onUpgradeClick?: () => void;
  labelKey?: string;
  descriptionKey?: string;
  minLevel?: number;
  maxLevel?: number;
  /** Custom label formatter for each level. Defaults to "N-{level}". */
  formatLevel?: (level: number) => string;
}

export function NLevelSelect({
  value,
  onChange,
  disabled = false,
  labelKey = 'settings.config.nLevel',
  descriptionKey = 'settings.config.nLevelDesc',
  minLevel = 1,
  maxLevel = 10,
  formatLevel,
}: NLevelSelectProps): ReactNode {
  const { t } = useTranslation();

  const levels = Array.from({ length: maxLevel - minLevel + 1 }, (_, i) => minLevel + i);
  const fmt = formatLevel ?? ((l: number) => `N-${l}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 min-w-0">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
          {t(labelKey)}
        </p>
        <span className="shrink-0">
          <InfoSheet iconSize={12}>{t(descriptionKey, 'Task memory difficulty')}</InfoSheet>
        </span>
      </div>

      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
        <SelectTrigger className="w-full h-11" aria-label={t(labelKey)}>
          <SelectValue>
            <span className="font-mono font-bold">{fmt(value)}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {levels.map((level) => (
            <SelectItem key={level} value={String(level)} className="font-mono">
              {fmt(level)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
