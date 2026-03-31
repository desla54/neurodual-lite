/**
 * TraceSettingsOverlay - In-game settings modal for Dual Trace mode
 *
 * Allows adjusting display settings during gameplay.
 */

import { cn } from '@neurodual/ui';
import {
  ArrowSquareOut,
  Bug,
  CaretDown,
  GridNine,
  Keyboard,
  Metronome,
  Moon,
  SlidersHorizontal,
  SpeakerHigh,
  Sun,
  X,
} from '@phosphor-icons/react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { GridStyle } from '../../stores/trace-game-store';
import type { TraceWritingInputMethod } from '../../stores/settings-store';

function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function AccordionSection({
  title,
  icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}): ReactNode {
  const [isOpen, setIsOpen] = useState(Boolean(defaultOpen));
  const hasOpenedRef = useRef(Boolean(defaultOpen));
  if (isOpen) {
    hasOpenedRef.current = true;
  }

  const shouldRenderChildren = isOpen || hasOpenedRef.current;
  return (
    <div className="rounded-xl">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 py-3 px-4 bg-woven-surface border border-woven-border hover:bg-woven-cell-rest/35 rounded-xl transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 font-medium text-woven-text">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        <CaretDown
          size={18}
          weight="bold"
          className={cn(
            'text-woven-text-muted transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        {shouldRenderChildren ? (
          <div className="pt-3 px-3 pb-2.5">
            <div className="divide-y divide-woven-border/70">{children}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimingSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (value: number) => void;
}): ReactNode {
  return (
    <div className="py-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-woven-text">{label}</span>
        <span className="text-xs text-woven-text-muted font-mono">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-woven-cell-rest rounded-full appearance-none cursor-pointer accent-woven-text"
        style={{ touchAction: 'pan-y' }}
      />
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onHaptic,
  onChange,
}: {
  label: string;
  checked: boolean;
  onHaptic?: (durationMs?: number) => void;
  onChange: (v: boolean) => void;
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        onHaptic?.(10);
        onChange(!checked);
      }}
      className="w-full flex items-center justify-between gap-3 py-3 cursor-pointer"
    >
      <span className="text-sm text-woven-text text-left">{label}</span>
      <span
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors border shrink-0',
          checked
            ? 'bg-woven-text border-woven-text/40'
            : 'bg-woven-cell-rest border-woven-border/60',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}

// =============================================================================
// Types
// =============================================================================

export interface TraceSettingsOverlayProps {
  /** Grid scale value (0.7 - 1.3) */
  gridScale: number;
  /** Grid visual style: 'trace' or 'classic' */
  gridStyle: GridStyle;
  /** Rhythm mode: self-paced or timed */
  rhythmMode: 'self-paced' | 'timed';
  /** Inter-stimulus interval in ms (timed mode only) */
  isiMs: number;
  /** Stimulus duration in ms (self-paced mode only) */
  stimulusDurationMs: number;
  /** Feedback duration in ms (self-paced mode only) */
  feedbackDurationMs: number;
  /** Rule display duration in ms (self-paced mode only) */
  ruleDisplayMs: number;
  /** Interval (blank gap) between trials in ms (self-paced mode only) */
  intervalMs: number;
  /** Show countdown mode */
  countdownMode: boolean;
  /** Show N-level badge */
  showNLevel: boolean;
  /** Show progress bar */
  showProgressBar: boolean;
  /** Show in-game instructions */
  showInGameInstructions: boolean;
  /** Sound enabled */
  soundEnabled: boolean;
  /** Current theme mode (for quick toggle in header) */
  isDarkMode: boolean;
  /** Aria label for the theme toggle */
  themeToggleAriaLabel: string;
  /** Adaptive timing enabled (auto-adjusts difficulty) */
  adaptiveTimingEnabled: boolean;
  /** Dual Trace: writing/arithmetic input method */
  traceWritingInputMethod: TraceWritingInputMethod;
  /** Optional haptic trigger for menu interactions */
  onHaptic?: (durationMs?: number) => void;
  /** Callbacks for setting changes */
  onGridScaleChange: (value: number) => void;
  onGridStyleChange: (value: GridStyle) => void;
  onIsiChange: (value: number) => void;
  onStimulusDurationChange: (value: number) => void;
  onFeedbackDurationChange: (value: number) => void;
  onRuleDisplayChange: (value: number) => void;
  onIntervalChange: (value: number) => void;
  onCountdownModeChange: (value: boolean) => void;
  onShowNLevelChange: (value: boolean) => void;
  onShowProgressBarChange: (value: boolean) => void;
  onShowInGameInstructionsChange: (value: boolean) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onThemeToggle: () => void;
  onAdaptiveTimingEnabledChange: (value: boolean) => void;
  onTraceWritingInputMethodChange: (value: TraceWritingInputMethod) => void;
  /** Called when overlay should close */
  onClose: () => void;
  /** Called to enter layout edit mode */
  onEditLayout?: () => void;
  /** Called when user wants to report a bug */
  onBugReport?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function TraceSettingsOverlay({
  gridScale,
  gridStyle,
  rhythmMode,
  isiMs,
  stimulusDurationMs,
  feedbackDurationMs,
  ruleDisplayMs,
  intervalMs,
  countdownMode,
  showNLevel,
  showProgressBar,
  showInGameInstructions,
  soundEnabled,
  isDarkMode,
  themeToggleAriaLabel,
  adaptiveTimingEnabled,
  traceWritingInputMethod,
  onGridScaleChange,
  onGridStyleChange,
  onIsiChange,
  onStimulusDurationChange,
  onFeedbackDurationChange,
  onRuleDisplayChange,
  onIntervalChange,
  onCountdownModeChange,
  onShowNLevelChange,
  onShowProgressBarChange,
  onShowInGameInstructionsChange,
  onSoundEnabledChange,
  onThemeToggle,
  onAdaptiveTimingEnabledChange,
  onTraceWritingInputMethodChange,
  onHaptic,
  onClose,
  onEditLayout,
  onBugReport,
}: TraceSettingsOverlayProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={() => {
          onHaptic?.(10);
          onClose();
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-label={t('common.close', 'Close')}
      />

      {/* Menu */}
      <div className="relative bg-woven-surface/95 dark:bg-woven-surface backdrop-blur-md dark:backdrop-blur-none border border-woven-border rounded-2xl shadow-xl p-4 min-w-[280px] max-w-[90vw] w-[420px] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-woven-text uppercase tracking-wide">
            {t('game.settings.title', 'Settings')}
          </h3>
          <div className="flex items-center gap-2">
            {onBugReport && (
              <button
                type="button"
                onClick={() => {
                  onHaptic?.(10);
                  onBugReport();
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-woven-cell-rest text-woven-text-muted transition-colors"
                aria-label={t('settings.about.reportBug')}
                title={t('settings.about.reportBug')}
              >
                <Bug size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onHaptic?.(10);
                onThemeToggle();
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-woven-cell-rest text-woven-text-muted transition-colors"
              aria-label={themeToggleAriaLabel}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              onClick={() => {
                onHaptic?.(10);
                onClose();
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-woven-cell-rest text-woven-text-muted transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <X size={18} className="text-destructive" />
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2 max-h-[72vh] overflow-auto pr-1">
          {/* Grid Section */}
          <AccordionSection
            title={t('trace.settings.section.grid', 'Grid')}
            icon={<GridNine size={18} weight="duotone" className="text-primary" />}
          >
            <TimingSlider
              label={t('settings.visual.gridScale', 'Size')}
              value={Math.round(gridScale * 100)}
              min={70}
              max={130}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => onGridScaleChange(v / 100)}
            />

            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-woven-text">
                {t('trace.settings.gridStyle', 'Style')}
              </span>
              <div className="flex items-center gap-1 bg-woven-cell-rest rounded-full p-1">
                {(['trace', 'classic'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      onHaptic?.(10);
                      onGridStyleChange(style);
                    }}
                    className={cn(
                      'h-10 px-4 text-sm font-medium rounded-full transition-colors',
                      gridStyle === style
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text',
                    )}
                  >
                    {style === 'trace'
                      ? t('trace.settings.gridStyleTrace', 'Trace')
                      : t('trace.settings.gridStyleClassic', 'Classic')}
                  </button>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* Input Section */}
          <AccordionSection
            title={t('trace.settings.section.input', 'Input')}
            icon={<Keyboard size={18} weight="duotone" className="text-primary" />}
          >
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-woven-text">
                {t('trace.settings.writingInput', 'Letters/numbers')}
              </span>
              <div className="flex items-center gap-1 bg-woven-cell-rest rounded-full p-1">
                {(
                  [
                    { v: 'auto', label: t('common.auto', 'Auto') },
                    { v: 'keyboard', label: t('trace.settings.inputKeyboard', 'Keyboard') },
                    {
                      v: 'handwriting',
                      label: t('trace.settings.inputHandwriting', 'Handwriting'),
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => {
                      onHaptic?.(10);
                      onTraceWritingInputMethodChange(opt.v);
                    }}
                    className={cn(
                      'h-10 px-3 text-xs font-medium rounded-full transition-colors',
                      traceWritingInputMethod === opt.v
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* Rhythm Section */}
          <AccordionSection
            title={t('trace.settings.section.rhythm', 'Rhythm')}
            icon={<Metronome size={18} weight="duotone" className="text-primary" />}
          >
            {rhythmMode === 'timed' ? (
              <TimingSlider
                label={t('trace.settings.isi', 'Interval (ISI)')}
                value={isiMs}
                min={1500}
                max={10000}
                step={500}
                format={formatSec}
                onChange={onIsiChange}
              />
            ) : (
              <>
                <TimingSlider
                  label={t('trace.settings.stimulusDuration', 'Stimulus duration')}
                  value={stimulusDurationMs}
                  min={200}
                  max={5000}
                  step={100}
                  format={formatSec}
                  onChange={onStimulusDurationChange}
                />
                <TimingSlider
                  label={t('trace.settings.feedbackDuration', 'Feedback duration')}
                  value={feedbackDurationMs}
                  min={200}
                  max={3000}
                  step={100}
                  format={formatSec}
                  onChange={onFeedbackDurationChange}
                />
                <TimingSlider
                  label={t('trace.settings.ruleDisplay', 'Rule display')}
                  value={ruleDisplayMs}
                  min={200}
                  max={3000}
                  step={100}
                  format={formatSec}
                  onChange={onRuleDisplayChange}
                />
                <TimingSlider
                  label={t('trace.settings.blankInterval', 'Blank interval')}
                  value={intervalMs}
                  min={0}
                  max={2000}
                  step={100}
                  format={formatSec}
                  onChange={onIntervalChange}
                />
              </>
            )}

            <ToggleSwitch
              label={t('trace.settings.adaptiveTiming', 'Adaptive timing')}
              checked={adaptiveTimingEnabled}
              onHaptic={onHaptic}
              onChange={onAdaptiveTimingEnabledChange}
            />
          </AccordionSection>

          {/* Interface Section */}
          <AccordionSection
            title={t('trace.settings.section.interface', 'Interface')}
            icon={<SlidersHorizontal size={18} weight="duotone" className="text-primary" />}
          >
            <ToggleSwitch
              label={t('flow.settings.countdownMode', 'Countdown mode')}
              checked={countdownMode}
              onHaptic={onHaptic}
              onChange={onCountdownModeChange}
            />
            <ToggleSwitch
              label={t('flow.settings.showNLevel', 'Show N level')}
              checked={showNLevel}
              onHaptic={onHaptic}
              onChange={onShowNLevelChange}
            />
            <ToggleSwitch
              label={t('trace.settings.showProgressBar', 'Progress bar')}
              checked={showProgressBar}
              onHaptic={onHaptic}
              onChange={onShowProgressBarChange}
            />
            <ToggleSwitch
              label={t('trace.settings.showInstructions', 'In-game instructions')}
              checked={showInGameInstructions}
              onHaptic={onHaptic}
              onChange={onShowInGameInstructionsChange}
            />
          </AccordionSection>

          {/* Sound Section */}
          <AccordionSection
            title={t('trace.settings.section.sound', 'Sound')}
            icon={<SpeakerHigh size={18} weight="duotone" className="text-primary" />}
          >
            <ToggleSwitch
              label={t('settings.sound.enabled', 'Sound enabled')}
              checked={soundEnabled}
              onHaptic={onHaptic}
              onChange={onSoundEnabledChange}
            />
          </AccordionSection>

          {/* Footer */}
          <div className="border-t border-woven-border mt-1 pt-3 flex items-center justify-between gap-3">
            <Link
              to="/settings/mode"
              onClick={() => onHaptic?.(10)}
              className="flex items-center gap-2 text-sm text-woven-text-muted hover:text-woven-text transition-colors"
            >
              <ArrowSquareOut size={14} />
              <span>{t('trace.settings.fullMenu', 'Full menu')}</span>
            </Link>
            {onEditLayout && (
              <button
                type="button"
                onClick={() => {
                  onHaptic?.(10);
                  onEditLayout();
                }}
                className="h-10 px-4 rounded-xl bg-woven-cell-rest hover:bg-woven-cell-hover text-woven-text text-sm font-medium transition-all active:scale-[0.98]"
              >
                {t('game.layoutEdit.editLayout', 'Edit layout')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onHaptic?.(10);
                onClose();
              }}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all active:scale-[0.98]"
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
