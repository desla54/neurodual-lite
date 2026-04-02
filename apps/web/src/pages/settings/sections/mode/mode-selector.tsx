/**
 * Game mode selector — simple grid for NeuroDual Lite (5 modes)
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Play } from '@phosphor-icons/react';
import { BetaBadge, Section } from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import { GAME_MODES, type GameMode, type GameModeConfig } from '../../config';
import { cn } from '@neurodual/ui';

interface GameModeSelectorProps {
  onModeChange?: (mode: GameMode) => void;
  onPlay?: (mode: GameMode) => void;
  variant?: 'section' | 'card';
  lockedModesUi?: 'full' | 'minimal' | 'hidden';
  extraContent?: ReactNode;
  sectionFilter?: 'training' | 'test';
  stickyExtra?: ReactNode;
}

const modeConfigMap = new Map<string, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

export function GameModeSelector({
  onModeChange,
  onPlay,
  variant = 'section',
  extraContent,
  sectionFilter,
  stickyExtra,
}: GameModeSelectorProps): ReactNode {
  const { t } = useTranslation();
  const currentMode = useSettingsStore((s) => s.freeTraining.selectedModeId) as GameMode;
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);

  const visibleModes = sectionFilter
    ? GAME_MODES.filter((m) => m.section === sectionFilter)
    : GAME_MODES;

  const selectedMode = visibleModes.some((m) => m.value === currentMode)
    ? currentMode
    : (visibleModes[0]?.value ?? null);
  const selectedModeConfig = selectedMode ? modeConfigMap.get(selectedMode) : undefined;

  const handleModeChange = (mode: GameMode) => {
    setCurrentMode(mode);
    onModeChange?.(mode);
  };

  const content = (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2.5">
        {visibleModes.map((mode) => {
          const isSelected = mode.value === selectedMode;
          const Icon = mode.icon;
          const badge = mode.badge;

          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleModeChange(mode.value)}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all',
                'border-border/50 bg-card',
                'hover:border-border/70 hover:bg-card',
                'active:scale-[0.97]',
                isSelected
                  ? 'border-2 border-primary/50 ring-1 ring-primary/20 shadow-sm'
                  : 'shadow-none',
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check size={14} weight="bold" className="text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  mode.bgClass,
                )}
              >
                <Icon size={22} weight="duotone" className={mode.colorClass} />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-semibold text-foreground">{t(mode.labelKey)}</span>
                {badge && (
                  <div className="mt-0.5">
                    <BetaBadge size="xs" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {extraContent ? <div>{extraContent}</div> : null}

      {onPlay && selectedModeConfig ? <div className="h-14" /> : null}
    </div>
  );

  const stickyBar =
    onPlay && selectedModeConfig ? (
      <div className="sticky bottom-1 z-20 pointer-events-none flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2">
          {stickyExtra}
          <button
            type="button"
            onClick={() => onPlay(selectedModeConfig.value)}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform"
          >
            <span className="shrink-0 p-2 rounded-xl bg-primary-foreground/15">
              <selectedModeConfig.icon size={20} weight="duotone" />
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">
              {t(selectedModeConfig.labelKey)}
            </span>
            <Play size={22} weight="fill" className="shrink-0" />
          </button>
        </div>
      </div>
    ) : null;

  const wrapped = (
    <>
      {content}
      {stickyBar}
    </>
  );

  if (variant === 'card') return wrapped;
  return <Section title={t('settings.gameMode.activeMode', 'Active mode')}>{wrapped}</Section>;
}
