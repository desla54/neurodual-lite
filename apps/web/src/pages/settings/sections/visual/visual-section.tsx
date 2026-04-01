/**
 * Visual settings section - stimulus style and color
 */

import { useMemo, useRef, type ReactNode, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { gameModeRegistry } from '@neurodual/logic';
import {
  Card,
  Section,
  StringArtPlus,
  EditableSlider,
  Grid,
  wovenText,
  wovenCssVar,
  resolveThemeColor,
} from '@neurodual/ui';
import { Upload, X } from '@phosphor-icons/react';
import { useSettingsStore, type ColorModalityTheme } from '../../../../stores';
import { useShallow } from 'zustand/react/shallow';
import { getStimulusColors } from '../../config';

/** Preview swatches for the color modality theme selector */
const THEME_PREVIEW_COLORS: Record<ColorModalityTheme, string[]> = {
  woven: ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'cyan', 'magenta'],
  vivid: [
    'vivid-blue',
    'vivid-red',
    'vivid-green',
    'vivid-yellow',
    'vivid-purple',
    'vivid-orange',
    'vivid-cyan',
    'vivid-magenta',
  ],
};

export function VisualSection(): ReactNode {
  const { t } = useTranslation();
  const {
    stimulusStyle,
    stimulusColor,
    colorModalityTheme,
    customImageUrl,
    stringArtPoints,
    gridScale,
    controlsScale,
  } = useSettingsStore(
    useShallow((s) => ({
      stimulusStyle: s.ui.stimulusStyle,
      stimulusColor: s.ui.stimulusColor,
      colorModalityTheme: s.ui.colorModalityTheme,
      customImageUrl: s.ui.customImageUrl,
      stringArtPoints: s.ui.stringArtPoints,
      gridScale: s.ui.gridScale,
      controlsScale: s.ui.controlsScale,
    })),
  );
  const setStimulusStyle = useSettingsStore((s) => s.setStimulusStyle);
  const setStimulusColor = useSettingsStore((s) => s.setStimulusColor);
  const setColorModalityTheme = useSettingsStore((s) => s.setColorModalityTheme);
  const setCustomImageUrl = useSettingsStore((s) => s.setCustomImageUrl);
  const setStringArtPoints = useSettingsStore((s) => s.setStringArtPoints);
  const setGridScale = useSettingsStore((s) => s.setGridScale);
  const setControlsScale = useSettingsStore((s) => s.setControlsScale);
  const currentMode = useSettingsStore((s) => s.currentMode);
  const effectiveMode = gameModeRegistry.has(currentMode) ? currentMode : 'dualnback-classic';
  const modeSettings = useSettingsStore((s) => s.modes[effectiveMode]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Color is only modifiable if "color" modality is NOT active
  const resolvedMode = useMemo(() => {
    return gameModeRegistry.resolveWithSettings(effectiveMode, modeSettings ?? {});
  }, [effectiveMode, modeSettings]);
  const activeModalities = resolvedMode.spec.defaults.activeModalities ?? ['position', 'audio'];
  const hasColorModality = activeModalities.includes('color');

  // Handle image upload
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCustomImageUrl(dataUrl);
      setStimulusStyle('custom');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setCustomImageUrl(null);
    if (stimulusStyle === 'custom') {
      setStimulusStyle('full');
    }
  };

  return (
    <div className="space-y-6">
      <Section title={t('settings.visual.stimulusStyle')}>
        <Card className="space-y-0 divide-y divide-border">
          {/* Style Preview + Selector */}
          <div className="py-3">
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {t('settings.visual.stimulusStyle')}
              </div>

              <div className="flex justify-center py-2">
                <Grid
                  activePosition={4}
                  showStimulus
                  stimulusStyle={stimulusStyle}
                  color={resolveThemeColor(stimulusColor, colorModalityTheme)}
                  customImageUrl={customImageUrl ?? undefined}
                  stringArtPoints={stringArtPoints}
                  gridStyle="classic"
                  hideCross
                  className="w-32"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStimulusStyle('full')}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    stimulusStyle === 'full'
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {t('settings.visual.fullSquare')}
                </button>
                <button
                  type="button"
                  onClick={() => setStimulusStyle('dots')}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    stimulusStyle === 'dots'
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {t('settings.visual.dots')}
                </button>
                <button
                  type="button"
                  onClick={() => setStimulusStyle('stringart')}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    stimulusStyle === 'stringart'
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {t('settings.visual.stringArt', 'String Art')}
                </button>
                <button
                  type="button"
                  onClick={() => setStimulusStyle('custom')}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    stimulusStyle === 'custom'
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {t('settings.visual.custom', 'Image')}
                </button>
              </div>
            </div>
          </div>

          {/* String Art Settings - only shown when "stringart" style is selected */}
          {stimulusStyle === 'stringart' && (
            <div className="py-3">
              <div className="space-y-4">
                {/* Large preview */}
                <div className="flex justify-center py-4">
                  <div className="w-24 h-24 bg-secondary rounded-xl flex items-center justify-center">
                    <StringArtPlus
                      size={80}
                      numPoints={stringArtPoints}
                      className={wovenText(resolveThemeColor(stimulusColor, colorModalityTheme))}
                    />
                  </div>
                </div>

                {/* Points slider */}
                <EditableSlider
                  label={t('settings.visual.stringArtPoints')}
                  value={stringArtPoints}
                  onChange={setStringArtPoints}
                  min={4}
                  max={20}
                  step={1}
                  colorClass="bg-primary/10 text-primary"
                  trackClass="bg-primary/20"
                  accentClass="accent-primary"
                />
              </div>
            </div>
          )}

          {/* Custom Image Upload - only shown when "custom" style is selected */}
          {stimulusStyle === 'custom' && !hasColorModality && (
            <div className="py-3">
              <div className="space-y-3">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  {t('settings.visual.customImage')}
                </div>

                {customImageUrl ? (
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-secondary rounded-lg overflow-hidden flex items-center justify-center">
                      <img
                        src={customImageUrl}
                        alt={t('aria.customStimulus')}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{t('settings.visual.imageLoaded')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.visual.imageHint')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      aria-label={t('common.remove')}
                    >
                      <X size={20} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 px-4 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    <Upload size={20} weight="regular" />
                    <span className="text-sm font-medium">{t('settings.visual.uploadImage')}</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.visual.imageRequirements')}
                </p>
              </div>
            </div>
          )}

          {/* Color Modality Theme Selector */}
          <div className="py-3">
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {t('settings.visual.colorModalityTheme')}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.visual.colorModalityThemeHint')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['woven', 'vivid'] as const).map((theme) => {
                  const isActive = colorModalityTheme === theme;
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setColorModalityTheme(theme)}
                      className={`flex flex-col items-center gap-2 py-3 px-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-primary/10 ring-2 ring-primary shadow-sm'
                          : 'bg-secondary hover:bg-secondary/80'
                      }`}
                    >
                      {/* Color swatches preview */}
                      <div className="flex gap-1">
                        {THEME_PREVIEW_COLORS[theme].map((colorName) => (
                          <div
                            key={colorName}
                            className="w-4 h-4 rounded-full"
                            style={{
                              backgroundColor: wovenCssVar(colorName) ?? 'hsl(var(--foreground))',
                            }}
                          />
                        ))}
                      </div>
                      <div className="text-center">
                        <div
                          className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}
                        >
                          {t(`settings.visual.colorTheme${theme === 'woven' ? 'Woven' : 'Vivid'}`)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t(
                            `settings.visual.colorTheme${theme === 'woven' ? 'Woven' : 'Vivid'}Desc`,
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Color Selector - hidden only when using custom image */}
          {stimulusStyle !== 'custom' && (
            <div className={`py-3 ${hasColorModality ? 'opacity-50' : ''}`}>
              <div className="space-y-3">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  {t('settings.visual.stimulusColor')}
                </div>
                {hasColorModality && (
                  <p className="text-xs text-amber-600">{t('settings.visual.colorDisabled')}</p>
                )}
                <div className="flex flex-wrap gap-4 justify-center">
                  {getStimulusColors(colorModalityTheme).map((color) => {
                    const isActive = stimulusColor === color.value;
                    return (
                      <button
                        key={color.value}
                        type="button"
                        disabled={hasColorModality}
                        onClick={() => setStimulusColor(color.value)}
                        className={`w-10 h-10 rounded-full transition-all ${color.bgClass} ${
                          isActive
                            ? 'ring-[5px] ring-amber-500 ring-offset-2 ring-offset-background scale-110 shadow-lg'
                            : 'hover:scale-105'
                        } ${hasColorModality ? 'cursor-not-allowed opacity-50' : ''}`}
                        aria-label={t(color.labelKey)}
                        aria-pressed={isActive}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Info banner when color modality is active */}
          {hasColorModality && (stimulusStyle === 'stringart' || stimulusStyle === 'custom') && (
            <div className="py-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('settings.visual.colorModalityWarning')}
                </p>
              </div>
            </div>
          )}
        </Card>
      </Section>

      <Section title={t('settings.visual.layoutSize')}>
        <Card className="space-y-0 divide-y divide-border">
          <div className="py-3">
            <EditableSlider
              label={t('settings.visual.gridScale')}
              value={Math.round(gridScale * 100)}
              onChange={(v) => setGridScale(v / 100)}
              min={70}
              max={130}
              step={5}
              unit="%"
              colorClass="bg-primary/10 text-primary"
              trackClass="bg-primary/20"
              accentClass="accent-primary"
            />
          </div>

          <div className="py-3 space-y-4">
            <EditableSlider
              label={t('settings.visual.controlsScale')}
              value={Math.round(controlsScale * 100)}
              onChange={(v) => setControlsScale(v / 100)}
              min={70}
              max={130}
              step={5}
              unit="%"
              colorClass="bg-audio/10 text-audio"
              trackClass="bg-audio/20"
              accentClass="accent-audio"
            />

            <p className="text-xs text-muted-foreground">{t('settings.visual.layoutSizeHint')}</p>
          </div>
        </Card>
      </Section>
    </div>
  );
}
