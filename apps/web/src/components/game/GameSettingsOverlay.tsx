/**
 * GameSettingsOverlay - In-game settings modal for tempo modes (Dual Catch, etc.)
 *
 * Allows adjusting display settings during gameplay.
 * Design unified "Woven Ink" with canvas texture.
 */

import { cn, Disclosure } from '@neurodual/ui';
import {
  ArrowSquareOutIcon,
  BugIcon,
  GridNineIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  SpeakerHighIcon,
  SunIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { StimulusColor, StimulusStyle } from '../../stores/settings-store';

// =============================================================================
// Types
// =============================================================================

export interface GameSettingsOverlayProps {
  /** UI click sounds (buttons, etc.) */
  buttonSoundsEnabled: boolean;
  /** Gameplay feedback sounds (correct/incorrect) */
  feedbackSoundsEnabled: boolean;
  /** Haptic feedback enabled */
  hapticEnabled: boolean;
  /** Countdown mode (show remaining trials instead of current/total) */
  countdownMode?: boolean;
  /** Show progress bar in HUD */
  showProgressBar?: boolean;
  /** Show N-level badge in HUD */
  showNLevel?: boolean;
  /** Current theme mode (for quick toggle in header) */
  isDarkMode?: boolean;
  /** Aria label for the theme toggle */
  themeToggleAriaLabel?: string;
  /** Guided mode (show timeline with past trials) */
  guidedMode?: boolean;
  /** Mirror mode (reverse position mapping) */
  mirrorMode?: boolean;
  /** Grid scale factor (0.7 - 1.3) */
  gridScale?: number;
  /** Controls scale factor (0.7 - 1.3) */
  controlsScale?: number;
  /** Stimulus style (visual appearance) */
  stimulusStyle?: StimulusStyle;
  /** Stimulus color (used when no dynamic color modality is active) */
  stimulusColor?: string;
  /** Whether the custom stimulus option is available (custom image present) */
  hasCustomStimulusImage?: boolean;
  /** Whether Position/Audio buttons are inverted (audio before position) */
  positionAudioButtonsInverted?: boolean;
  /** Grid visual style for tempo sessions */
  gridStyle?: 'trace' | 'classic';
  /** Callbacks for setting changes */
  onButtonSoundsEnabledChange: (value: boolean) => void;
  onFeedbackSoundsEnabledChange: (value: boolean) => void;
  onHapticEnabledChange: (value: boolean) => void;
  onCountdownModeChange?: (value: boolean) => void;
  onShowProgressBarChange?: (value: boolean) => void;
  onShowNLevelChange?: (value: boolean) => void;
  onThemeToggle?: () => void;
  onGuidedModeChange?: (value: boolean) => void;
  onMirrorModeChange?: (value: boolean) => void;
  onGridScaleChange?: (value: number) => void;
  onControlsScaleChange?: (value: number) => void;
  onStimulusStyleChange?: (value: StimulusStyle) => void;
  onStimulusColorChange?: (value: StimulusColor) => void;
  onPositionAudioButtonsInvertedChange?: (value: boolean) => void;
  onGridStyleChange?: (value: 'trace' | 'classic') => void;
  /** Called when user wants to edit layout (open LayoutEditor) */
  onEditLayout?: () => void;
  /** Called when user wants to report a bug */
  onBugReport?: () => void;
  /** Optional haptic trigger for menu interactions */
  onHaptic?: (durationMs?: number) => void;
  /** Called when overlay should close */
  onClose: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

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
      <span className="text-sm text-foreground text-left">{label}</span>
      <span
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors border shrink-0',
          checked
            ? 'bg-primary border-primary/40'
            : 'bg-foreground/10 dark:bg-white/[0.10] border-border/60',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}

function ScaleSlider({
  value,
  onChange,
  label,
  onBeginAdjust,
  focusAriaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  onBeginAdjust?: () => void;
  focusAriaLabel?: string;
}): ReactNode {
  const percent = Math.round(value * 100);

  return (
    <div className="py-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{percent}%</span>
          {onBeginAdjust && (
            <button
              type="button"
              onClick={onBeginAdjust}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-foreground/10 text-foreground transition-colors hover:bg-foreground/15"
              aria-label={focusAriaLabel}
            >
              <ArrowSquareOutIcon size={18} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={70}
        max={130}
        step={5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerDown={() => onBeginAdjust?.()}
        className="w-full h-1.5 bg-foreground/10 dark:bg-white/[0.10] rounded-full appearance-none cursor-pointer accent-primary"
        style={{ touchAction: 'pan-y' }}
      />
    </div>
  );
}

const STIMULUS_STYLE_OPTIONS: Array<{
  id: StimulusStyle;
  labelKey: string;
  fallback: string;
}> = [
  { id: 'full', labelKey: 'settings.visual.fullSquare', fallback: 'Full' },
  { id: 'dots', labelKey: 'settings.visual.dots', fallback: 'Dots' },
  { id: 'stringart', labelKey: 'settings.visual.stringArt', fallback: 'String Art' },
  { id: 'custom', labelKey: 'settings.visual.custom', fallback: 'Custom' },
];

const STIMULUS_COLOR_OPTIONS: Array<{
  id: StimulusColor;
  labelKey: string;
  fallback: string;
  swatchClassName: string;
}> = [
  {
    id: 'black',
    labelKey: 'settings.visual.colors.black',
    fallback: 'Black',
    swatchClassName: 'bg-foreground',
  },
  {
    id: 'blue',
    labelKey: 'settings.visual.colors.blue',
    fallback: 'Blue',
    swatchClassName: 'bg-blue-500',
  },
  {
    id: 'red',
    labelKey: 'settings.visual.colors.red',
    fallback: 'Red',
    swatchClassName: 'bg-red-500',
  },
  {
    id: 'green',
    labelKey: 'settings.visual.colors.green',
    fallback: 'Green',
    swatchClassName: 'bg-green-500',
  },
  {
    id: 'yellow',
    labelKey: 'settings.visual.colors.yellow',
    fallback: 'Yellow',
    swatchClassName: 'bg-yellow-400',
  },
  {
    id: 'purple',
    labelKey: 'settings.visual.colors.purple',
    fallback: 'Purple',
    swatchClassName: 'bg-purple-500',
  },
  {
    id: 'orange',
    labelKey: 'settings.visual.colors.orange',
    fallback: 'Orange',
    swatchClassName: 'bg-orange-500',
  },
  {
    id: 'cyan',
    labelKey: 'settings.visual.colors.cyan',
    fallback: 'Cyan',
    swatchClassName: 'bg-cyan-500',
  },
  {
    id: 'magenta',
    labelKey: 'settings.visual.colors.magenta',
    fallback: 'Magenta',
    swatchClassName: 'bg-fuchsia-500',
  },
];

// =============================================================================
// Component
// =============================================================================

export function GameSettingsOverlay({
  buttonSoundsEnabled,
  feedbackSoundsEnabled,
  hapticEnabled,
  countdownMode,
  showProgressBar,
  showNLevel,
  isDarkMode,
  themeToggleAriaLabel,
  guidedMode,
  mirrorMode,
  gridScale,
  controlsScale,
  stimulusStyle,
  stimulusColor,
  hasCustomStimulusImage,
  positionAudioButtonsInverted,
  gridStyle,
  onButtonSoundsEnabledChange,
  onFeedbackSoundsEnabledChange,
  onHapticEnabledChange,
  onCountdownModeChange,
  onShowProgressBarChange,
  onShowNLevelChange,
  onThemeToggle,
  onGuidedModeChange,
  onMirrorModeChange,
  onGridScaleChange,
  onControlsScaleChange,
  onStimulusStyleChange,
  onStimulusColorChange,
  onPositionAudioButtonsInvertedChange,
  onGridStyleChange,
  onEditLayout,
  onBugReport,
  onHaptic,
  onClose,
}: GameSettingsOverlayProps): ReactNode {
  const { t } = useTranslation();
  const [view, setView] = useState<'menu' | 'scale'>('menu');
  const isScaleView = view === 'scale';
  const scalePanelRef = useRef<HTMLDivElement | null>(null);
  const [scalePanelPos, setScalePanelPos] = useState<{ top: number; left: number } | null>(null);
  const [gridSectionOpen, setGridSectionOpen] = useState(false);

  const handleClose = () => {
    onHaptic?.(10);
    onClose();
  };

  useLayoutEffect(() => {
    if (!isScaleView) {
      setScalePanelPos(null);
      return;
    }

    let rafId = 0;

    const update = () => {
      const scalePanel = scalePanelRef.current;
      const gridHost = document.querySelector<HTMLElement>('[data-nd-sync-host="nback-stimulus"]');
      if (!scalePanel || !gridHost) return;

      const gridRect = gridHost.getBoundingClientRect();
      const panelRect = scalePanel.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

      const margin = 12;
      const minLeft = panelRect.width / 2 + margin;
      const maxLeft = viewportWidth - panelRect.width / 2 - margin;
      const nextLeft = Math.min(Math.max(gridRect.left + gridRect.width / 2, minLeft), maxLeft);

      const minTop = margin;
      const maxTop = viewportHeight - panelRect.height - margin;

      // Keep the panel above the grid. If it doesn't fit, clamp within the viewport (may overlap).
      const desiredTop = gridRect.top - panelRect.height - margin;
      const nextTop = Math.min(Math.max(desiredTop, minTop), maxTop);

      setScalePanelPos({
        top: Math.round(nextTop),
        left: Math.round(nextLeft),
      });
    };

    const scheduleUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    scheduleUpdate();

    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate);
    };
  }, [isScaleView, gridScale]);

  const hasGridSection =
    gridScale !== undefined ||
    controlsScale !== undefined ||
    gridStyle !== undefined ||
    onGridScaleChange !== undefined ||
    onControlsScaleChange !== undefined ||
    onGridStyleChange !== undefined ||
    onEditLayout !== undefined;

  const hasInterfaceSection =
    countdownMode !== undefined ||
    showProgressBar !== undefined ||
    showNLevel !== undefined ||
    guidedMode !== undefined ||
    mirrorMode !== undefined;

  const shouldShowStimulusSection =
    stimulusStyle !== undefined ||
    stimulusColor !== undefined ||
    onStimulusStyleChange !== undefined ||
    onStimulusColorChange !== undefined;

  return (
    <div
      className={cn('fixed inset-0 z-[200]', isScaleView ? '' : 'flex items-center justify-center')}
    >
      {/* Backdrop */}
      <button
        type="button"
        className={cn(
          'absolute inset-0 cursor-default',
          isScaleView ? 'bg-black/0' : 'bg-black/40',
        )}
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-label={t('common.close', 'Close')}
      />

      {/* Menu */}
      <div
        className={cn(
          'relative bg-surface border border-border rounded-2xl shadow-xl p-4',
          isScaleView
            ? 'fixed left-1/2 -translate-x-1/2 w-[min(420px,92vw)]'
            : 'min-w-[280px] max-w-[90vw] w-[420px] animate-in fade-in zoom-in-95 duration-200',
          isScaleView && !scalePanelPos ? 'bottom-4' : '',
        )}
        ref={scalePanelRef}
        style={
          isScaleView && scalePanelPos
            ? { top: scalePanelPos.top, left: scalePanelPos.left }
            : undefined
        }
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between', isScaleView ? 'mb-2' : 'mb-4')}>
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
            {isScaleView
              ? t('settings.visual.layoutSize', 'Layout size')
              : t('game.settings.title', 'Settings')}
          </h3>
          {isScaleView ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onHaptic?.(10);
                  setView('menu');
                }}
                className="h-10 px-4 rounded-xl bg-foreground/10 text-foreground text-sm font-semibold transition-colors hover:bg-foreground/15"
              >
                {t('common.back', 'Back')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-foreground/10 text-muted-foreground transition-colors hover:bg-foreground/15"
                aria-label={t('common.close', 'Close')}
              >
                <XIcon size={18} className="text-destructive" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {onBugReport && (
                <button
                  type="button"
                  onClick={() => {
                    onHaptic?.(10);
                    onBugReport();
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
                  aria-label={t('settings.about.reportBug')}
                  title={t('settings.about.reportBug')}
                >
                  <BugIcon size={18} />
                </button>
              )}
              {typeof isDarkMode === 'boolean' && onThemeToggle && (
                <button
                  type="button"
                  onClick={() => {
                    onHaptic?.(10);
                    onThemeToggle();
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
                  aria-label={themeToggleAriaLabel ?? t('settings.visual.darkMode', 'Dark mode')}
                >
                  {isDarkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
                aria-label={t('common.close', 'Close')}
              >
                <XIcon size={18} className="text-destructive" />
              </button>
            </div>
          )}
        </div>

        {/* Options */}
        <div
          className={cn(
            'space-y-2',
            isScaleView ? 'max-h-[60vh] overflow-auto pr-1' : 'max-h-[72vh] overflow-auto pr-1',
          )}
        >
          {hasGridSection && (
            <Disclosure
              title={t('game.settings.gridAndButtons', 'Grid & buttons')}
              icon={<GridNineIcon size={18} weight="duotone" className="text-primary" />}
              open={isScaleView ? true : gridSectionOpen}
              onOpenChange={isScaleView ? undefined : setGridSectionOpen}
              className={isScaleView ? '[&>button]:hidden' : ''}
            >
              <div className="py-3 px-4 rounded-xl bg-white/50 dark:bg-white/[0.05] subcard-border">
                <div className="divide-y divide-border/60">
                  {gridScale !== undefined && onGridScaleChange && (
                    <ScaleSlider
                      value={gridScale}
                      onChange={onGridScaleChange}
                      label={t('settings.visual.gridScaleShort', 'Grid')}
                      onBeginAdjust={!isScaleView ? () => setView('scale') : undefined}
                      focusAriaLabel={t(
                        'settings.visual.layoutSizeHint',
                        'Adjust the size of game elements',
                      )}
                    />
                  )}

                  {!isScaleView && gridStyle !== undefined && onGridStyleChange && (
                    <div className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-foreground">
                        {t('trace.settings.gridStyle', 'Grid style')}
                      </span>
                      <div className="flex items-center gap-1 bg-foreground/10 dark:bg-white/[0.10] border border-border/60 rounded-full p-1">
                        <button
                          type="button"
                          onClick={() => {
                            onHaptic?.(10);
                            onGridStyleChange('trace');
                          }}
                          className={cn(
                            'h-10 px-4 text-sm font-semibold rounded-full transition-colors',
                            gridStyle === 'trace'
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {t('trace.settings.gridStyleTrace', 'Trace')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onHaptic?.(10);
                            onGridStyleChange('classic');
                          }}
                          className={cn(
                            'h-10 px-4 text-sm font-semibold rounded-full transition-colors',
                            gridStyle === 'classic'
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {t('trace.settings.gridStyleClassic', 'Classic')}
                        </button>
                      </div>
                    </div>
                  )}

                  {controlsScale !== undefined && onControlsScaleChange && (
                    <ScaleSlider
                      value={controlsScale}
                      onChange={onControlsScaleChange}
                      label={t('settings.visual.controlsScaleShort', 'Buttons')}
                      onBeginAdjust={!isScaleView ? () => setView('scale') : undefined}
                      focusAriaLabel={t(
                        'settings.visual.layoutSizeHint',
                        'Adjust the size of game elements',
                      )}
                    />
                  )}

                  {!isScaleView &&
                    shouldShowStimulusSection &&
                    stimulusStyle !== undefined &&
                    onStimulusStyleChange && (
                      <div className="py-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground">
                            {t('settings.visual.stimulusStyle', 'Stimulus style')}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {STIMULUS_STYLE_OPTIONS.map((opt) => {
                            const isActive = stimulusStyle === opt.id;
                            const isDisabled = opt.id === 'custom' && !hasCustomStimulusImage;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                  onHaptic?.(10);
                                  onStimulusStyleChange(opt.id);
                                }}
                                className={cn(
                                  'min-h-10 px-4 py-2 text-sm font-semibold rounded-full border transition-colors',
                                  isActive
                                    ? 'bg-foreground text-background border-foreground/20'
                                    : 'bg-foreground/5 text-foreground border-border/60 hover:bg-foreground/10',
                                  isDisabled &&
                                    'opacity-40 cursor-not-allowed hover:bg-foreground/5',
                                )}
                              >
                                {t(opt.labelKey, opt.fallback)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {!isScaleView &&
                    shouldShowStimulusSection &&
                    stimulusColor !== undefined &&
                    onStimulusColorChange && (
                      <div className="py-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground">
                            {t('settings.visual.stimulusColor', 'Stimulus color')}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {STIMULUS_COLOR_OPTIONS.map((opt) => {
                            const isActive = stimulusColor === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  onHaptic?.(10);
                                  onStimulusColorChange(opt.id);
                                }}
                                className={cn(
                                  'w-10 h-10 rounded-full border transition-all flex items-center justify-center',
                                  isActive
                                    ? 'border-foreground/50 ring-2 ring-foreground/20'
                                    : 'border-border/60 hover:border-foreground/30',
                                )}
                                aria-label={t(opt.labelKey, opt.fallback)}
                              >
                                <span
                                  className={cn(
                                    'w-6 h-6 rounded-full',
                                    opt.swatchClassName,
                                    opt.id === 'black'
                                      ? 'shadow-[inset_0_0_0_1px_hsl(var(--border)/0.6)]'
                                      : '',
                                  )}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {!isScaleView &&
                    positionAudioButtonsInverted !== undefined &&
                    onPositionAudioButtonsInvertedChange && (
                      <ToggleSwitch
                        checked={positionAudioButtonsInverted}
                        onChange={onPositionAudioButtonsInvertedChange}
                        onHaptic={onHaptic}
                        label={t('game.settings.swapPositionAudio', 'Swap Position / Audio')}
                      />
                    )}

                  {!isScaleView && onEditLayout && (
                    <div className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          onHaptic?.(10);
                          onEditLayout();
                        }}
                        className="w-full flex items-center justify-between gap-2 py-2.5 px-3 bg-surface hover:bg-muted/50 border border-border rounded-xl text-sm text-foreground transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <SlidersHorizontalIcon size={16} />
                          {t('game.settings.editLayout', 'Edit layout')}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Disclosure>
          )}

          {!isScaleView && hasInterfaceSection && (
            <Disclosure
              title={t('trace.settings.section.interface', 'Interface')}
              icon={<SlidersHorizontalIcon size={18} weight="duotone" className="text-primary" />}
              lazy
              keepMounted={false}
              render={() => (
                <div className="py-3 px-4 rounded-xl bg-white/50 dark:bg-white/[0.05] subcard-border">
                  <div className="divide-y divide-border/60">
                    {countdownMode !== undefined && onCountdownModeChange && (
                      <ToggleSwitch
                        checked={countdownMode}
                        onChange={onCountdownModeChange}
                        onHaptic={onHaptic}
                        label={t('settings.mode.countdownMode', 'Countdown')}
                      />
                    )}

                    {showProgressBar !== undefined && onShowProgressBarChange && (
                      <ToggleSwitch
                        checked={showProgressBar}
                        onChange={onShowProgressBarChange}
                        onHaptic={onHaptic}
                        label={t('settings.mode.showProgressBar', 'Progress bar')}
                      />
                    )}

                    {showNLevel !== undefined && onShowNLevelChange && (
                      <ToggleSwitch
                        checked={showNLevel}
                        onChange={onShowNLevelChange}
                        onHaptic={onHaptic}
                        label={t('settings.mode.showNLevel', 'Badge N-Level')}
                      />
                    )}

                    {guidedMode !== undefined && onGuidedModeChange && (
                      <ToggleSwitch
                        checked={guidedMode}
                        onChange={onGuidedModeChange}
                        onHaptic={onHaptic}
                        label={t('settings.mode.guidedMode', 'Guided mode')}
                      />
                    )}

                    {mirrorMode !== undefined && onMirrorModeChange && (
                      <ToggleSwitch
                        checked={mirrorMode}
                        onChange={onMirrorModeChange}
                        onHaptic={onHaptic}
                        label={t('settings.mode.mirrorMode', 'Mirror mode')}
                      />
                    )}
                  </div>
                </div>
              )}
            />
          )}

          {!isScaleView && (
            <>
              <Disclosure
                title={t('trace.settings.section.sound', 'Sound')}
                icon={<SpeakerHighIcon size={18} weight="duotone" className="text-primary" />}
                lazy
                keepMounted={false}
                render={() => (
                  <div className="py-3 px-4 rounded-xl bg-white/50 dark:bg-white/[0.05] subcard-border">
                    <div className="divide-y divide-border/60">
                      <ToggleSwitch
                        checked={buttonSoundsEnabled}
                        onChange={onButtonSoundsEnabledChange}
                        onHaptic={onHaptic}
                        label={t('settings.audio.buttonSounds', 'Button sounds')}
                      />

                      <ToggleSwitch
                        checked={feedbackSoundsEnabled}
                        onChange={onFeedbackSoundsEnabledChange}
                        onHaptic={onHaptic}
                        label={t('settings.audio.feedbackSounds', 'Feedback sounds')}
                      />

                      <ToggleSwitch
                        checked={hapticEnabled}
                        onChange={onHapticEnabledChange}
                        onHaptic={onHaptic}
                        label={t('settings.accessibility.hapticEnabled', 'Haptics')}
                      />
                    </div>
                  </div>
                )}
              />

              <div className="border-t border-border mt-1 pt-3 flex items-center justify-between gap-3">
                <Link
                  to="/settings/mode"
                  onClick={() => onHaptic?.(10)}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowSquareOutIcon size={14} />
                  <span>{t('trace.settings.fullMenu', 'Full menu')}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all active:scale-[0.98]"
                >
                  {t('common.save', 'Save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
