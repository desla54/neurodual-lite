/**
 * DualPickSettingsOverlay.tsx - Mini menu de paramètres en overlay
 *
 * Permet de personnaliser rapidement l'affichage pendant le jeu.
 * Design unifié "Woven Ink" avec texture canvas.
 */

import { ArrowSquareOut, Minus, Plus, X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@neurodual/ui';

interface DualPickSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onHaptic?: (durationMs?: number) => void;
  showModalityLabels: boolean;
  onShowModalityLabelsChange: (value: boolean) => void;
  showTimeLabels: boolean;
  onShowTimeLabelsChange: (value: boolean) => void;
  showRecenterButton: boolean;
  onShowRecenterButtonChange: (value: boolean) => void;
  gridScale: number;
  onGridScaleChange: (value: number) => void;
  countdownMode: boolean;
  onCountdownModeChange: (value: boolean) => void;
  showNLevel: boolean;
  onShowNLevelChange: (value: boolean) => void;
  showAdaptiveZone: boolean;
  onShowAdaptiveZoneChange: (value: boolean) => void;
}

function ToggleSwitch({
  checked,
  onChange,
  onHaptic,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  onHaptic?: (durationMs?: number) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
      <span className="text-sm text-woven-text">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          onHaptic?.(10);
          onChange(!checked);
        }}
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors',
          checked ? 'bg-woven-text' : 'bg-woven-cell-rest',
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  );
}

function ScaleControl({
  value,
  onChange,
  onHaptic,
  label,
  min = 0.7,
  max = 1.3,
  step = 0.1,
}: {
  value: number;
  onChange: (value: number) => void;
  onHaptic?: (durationMs?: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { t } = useTranslation();
  const canDecrease = value > min + 0.01;
  const canIncrease = value < max - 0.01;

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-woven-text">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (canDecrease) {
              onHaptic?.(10);
              onChange(Math.round((value - step) * 10) / 10);
            }
          }}
          disabled={!canDecrease}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
            canDecrease
              ? 'bg-woven-cell-rest text-woven-text'
              : 'bg-woven-cell-rest/50 text-woven-text-muted/40',
          )}
          aria-label={t('aria.minimize')}
        >
          <Minus size={14} />
        </button>
        <span className="w-12 text-center text-sm font-mono font-medium text-woven-text">
          {Math.round(value * 100)}%
        </span>
        <button
          type="button"
          onClick={() => {
            if (canIncrease) {
              onHaptic?.(10);
              onChange(Math.round((value + step) * 10) / 10);
            }
          }}
          disabled={!canIncrease}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
            canIncrease
              ? 'bg-woven-cell-rest text-woven-text'
              : 'bg-woven-cell-rest/50 text-woven-text-muted/40',
          )}
          aria-label={t('aria.maximize')}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function DualPickSettingsOverlay({
  isOpen,
  onClose,
  onHaptic,
  showModalityLabels,
  onShowModalityLabelsChange,
  showTimeLabels,
  onShowTimeLabelsChange,
  showRecenterButton,
  onShowRecenterButtonChange,
  gridScale,
  onGridScaleChange,
  countdownMode,
  onCountdownModeChange,
  showNLevel,
  onShowNLevelChange,
  showAdaptiveZone,
  onShowAdaptiveZoneChange,
}: DualPickSettingsOverlayProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
        onClick={() => {
          onHaptic?.(10);
          onClose();
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-label={t('common.close', 'Close')}
      />

      {/* Menu */}
      <div className="relative bg-woven-surface/95 dark:bg-woven-surface backdrop-blur-md dark:backdrop-blur-none border border-woven-border rounded-2xl shadow-xl p-4 min-w-[280px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-woven-text uppercase tracking-wide">
            {t('game.settings.title', 'Settings')}
          </h3>
          <button
            type="button"
            onClick={() => {
              onHaptic?.(10);
              onClose();
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-woven-cell-rest text-woven-text-muted transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X size={14} className="text-destructive" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-1">
          <ScaleControl
            value={gridScale}
            onChange={onGridScaleChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.gridScale', 'Grid size')}
          />
          <ToggleSwitch
            checked={countdownMode}
            onChange={onCountdownModeChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.countdownMode', 'Countdown (instead of counter)')}
          />
          <ToggleSwitch
            checked={showNLevel}
            onChange={onShowNLevelChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.showNLevel', 'Show N level')}
          />
          <ToggleSwitch
            checked={showAdaptiveZone}
            onChange={onShowAdaptiveZoneChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.showAdaptiveZone', 'Show adaptive zone')}
          />
          <div className="border-t border-woven-border my-2" />
          <ToggleSwitch
            checked={showModalityLabels}
            onChange={onShowModalityLabelsChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.modalityLabels', 'Position / Audio labels')}
          />
          <ToggleSwitch
            checked={showTimeLabels}
            onChange={onShowTimeLabelsChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.timeLabels', 'Present / Past labels')}
          />
          <ToggleSwitch
            checked={showRecenterButton}
            onChange={onShowRecenterButtonChange}
            onHaptic={onHaptic}
            label={t('dualPick.settings.recenterButton', 'Recenter button')}
          />

          <div className="border-t border-woven-border mt-3 pt-3 flex items-center justify-between gap-3">
            <Link
              to="/settings/mode"
              onClick={() => onHaptic?.(10)}
              className="flex items-center gap-2 text-sm text-woven-text-muted hover:text-woven-text transition-colors"
            >
              <ArrowSquareOut size={14} />
              <span>{t('trace.settings.fullMenu', 'Full menu')}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                onHaptic?.(10);
                onClose();
              }}
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all active:scale-[0.98]"
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
