/**
 * Personalization settings section
 * - Theme (light/dark)
 * - Accent color
 * - Haptic feedback
 * - Session recovery (opt-in)
 */

import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowCounterClockwise,
  ArrowsOutLineHorizontal,
  Moon,
  Sun,
  Swatches,
  Vibrate,
} from '@phosphor-icons/react';
import { Card, EditableSlider, Section, Toggle } from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import type { UiAccentPreset } from '../../../../stores/settings-store';
import { STIMULUS_COLORS } from '../../config';
import { useAppPorts } from '../../../../providers';
import { SettingsSegmentedControl } from '../../components';

type AccentSwatch =
  | { type: 'var'; value: string }
  | { type: 'hsl'; value: string }
  | { type: 'class'; value: string };

const ACCENT_OPTIONS: Array<{
  id: UiAccentPreset;
  labelKey: string;
  fallback: string;
  swatch: AccentSwatch;
}> = [
  {
    id: 'theme',
    labelKey: 'settings.personalization.accentTheme',
    fallback: 'Theme default',
    swatch: { type: 'class', value: 'bg-foreground border border-white/15 dark:border-black/20' },
  },
  {
    id: 'amber',
    labelKey: 'settings.personalization.accentAmber',
    fallback: 'Amber',
    swatch: { type: 'class', value: 'bg-woven-amber' },
  },
  // Exact same list as the stimulus color palette (same ids/labels),
  // excluding "black" because it's already covered by the theme default swatch.
  ...STIMULUS_COLORS.filter((c) => c.value !== 'black').map((c) => ({
    id: c.value as UiAccentPreset,
    labelKey: c.labelKey,
    fallback: c.value,
    swatch: { type: 'class' as const, value: c.bgClass },
  })),
];

const TEXT_SCALE_MIN = 80;
const TEXT_SCALE_MAX = 130;
const TEXT_SCALE_MARKS = [90, 100, 110, 120] as const;

function getSwatchStyle(swatch: AccentSwatch): { backgroundColor: string } | undefined {
  if (swatch.type === 'class') return undefined;
  if (swatch.type === 'hsl') return { backgroundColor: `hsl(${swatch.value})` };
  return { backgroundColor: `hsl(var(${swatch.value}))` };
}

export function PersonalizationSection(): ReactNode {
  const { t } = useTranslation();
  const accentScrollerRef = useRef<HTMLDivElement | null>(null);
  const { haptic: hapticPort } = useAppPorts();
  const isHapticsAvailable = hapticPort.isAvailable();

  // Theme
  const darkMode = useSettingsStore((s) => s.ui.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);

  // Accent color
  const accentPreset = useSettingsStore((s) => s.ui.accentPreset);
  const setAccentPreset = useSettingsStore((s) => s.setAccentPreset);

  // Text size
  const textScalePercent = useSettingsStore((s) => s.ui.textScalePercent);
  const setTextScalePercent = useSettingsStore((s) => s.setTextScalePercent);

  // Haptic
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const hapticIntensity = useSettingsStore((s) => s.ui.hapticIntensity);
  const setHapticIntensity = useSettingsStore((s) => s.setHapticIntensity);
  const handleHapticEnabledChange = (enabled: boolean) => {
    setHapticEnabled(enabled);
    if (enabled && isHapticsAvailable) {
      hapticPort.impact('light');
    }
  };

  const handleHapticIntensityChange = (next: 'low' | 'medium' | 'high') => {
    setHapticIntensity(next);
    if (hapticEnabled && isHapticsAvailable) {
      // Preview the selected intensity so users feel the difference immediately.
      // Native first (Capacitor impact), web Vibration API as fallback.
      const style = next === 'low' ? 'light' : next === 'medium' ? 'medium' : 'heavy';
      hapticPort.impact(style as 'light' | 'medium' | 'heavy');
    }
  };

  // Session recovery (opt-in)
  const sessionRecoveryEnabled = useSettingsStore((s) => s.ui.sessionRecoveryEnabled);
  const setSessionRecoveryEnabled = useSettingsStore((s) => s.setSessionRecoveryEnabled);

  const handleAccentPick = (preset: UiAccentPreset) => {
    const scroller = accentScrollerRef.current;
    const left = scroller?.scrollLeft ?? 0;
    setAccentPreset(preset);
    // Prevent the horizontal scroller from jumping back to the start after selection.
    // (Can happen when the selected item changes size due to ring/scale styles.)
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollLeft = left;
    });
  };

  return (
    <div className="space-y-6">
      <Section title={t('settings.accessibility.theme')}>
        <Card className="space-y-0 divide-y divide-border">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-secondary text-muted-foreground">
                {darkMode ? (
                  <Moon size={20} weight="regular" />
                ) : (
                  <Sun size={20} weight="regular" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.accessibility.theme')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {darkMode
                    ? t('settings.accessibility.themeDark')
                    : t('settings.accessibility.themeLight')}
                </div>
              </div>
            </div>
            <SettingsSegmentedControl
              value={darkMode ? 'dark' : 'light'}
              size="icon"
              options={[
                {
                  value: 'light',
                  ariaLabel: t('settings.accessibility.themeLight'),
                  label: <Sun size={18} weight={!darkMode ? 'fill' : 'regular'} />,
                },
                {
                  value: 'dark',
                  ariaLabel: t('settings.accessibility.themeDark'),
                  label: <Moon size={18} weight={darkMode ? 'fill' : 'regular'} />,
                },
              ]}
              onChange={(next) => setDarkMode(next === 'dark')}
            />
          </div>

          {/* Accent color */}
          <div className="py-3 space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-secondary text-muted-foreground">
                <Swatches size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">
                  {t('settings.personalization.accentColor', 'Accent color')}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {accentPreset === 'theme'
                    ? t('settings.personalization.accentTheme', 'Theme default')
                    : t(
                        'settings.personalization.accentHint',
                        'Changes button and highlight color',
                      )}
                </div>
              </div>
            </div>

            {/* Horizontal scroll picker */}
            <div
              ref={accentScrollerRef}
              className="w-full overflow-x-auto overflow-y-visible rounded-xl px-3 py-3"
            >
              <div className="flex flex-nowrap gap-4 justify-start w-max">
                {ACCENT_OPTIONS.map((option) => {
                  const active = option.id === accentPreset;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleAccentPick(option.id)}
                      className={`w-10 h-10 rounded-full transition-all shrink-0 ${
                        active
                          ? 'ring-[5px] ring-amber-500 ring-offset-2 ring-offset-surface scale-110 shadow-lg'
                          : 'hover:scale-105'
                      }`}
                      aria-pressed={active}
                      aria-label={t(option.labelKey, option.fallback)}
                      title={t(option.labelKey, option.fallback)}
                    >
                      <span
                        className={`block w-full h-full rounded-full ${
                          option.swatch.type === 'class' ? option.swatch.value : ''
                        }`}
                        style={getSwatchStyle(option.swatch)}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Text size */}
          <div className="py-3 space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-secondary text-muted-foreground">
                <ArrowsOutLineHorizontal size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">
                  {t('settings.personalization.textSize', 'Text size')}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {t(
                    'settings.personalization.textSizeHint',
                    'Adjusts the app text size without changing your phone settings',
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <EditableSlider
                label=""
                value={textScalePercent}
                onChange={setTextScalePercent}
                min={TEXT_SCALE_MIN}
                max={TEXT_SCALE_MAX}
                step={1}
                suffix="%"
                decimals={0}
                colorClass="bg-secondary text-foreground"
                trackClass="bg-secondary"
                accentClass="accent-primary"
              />

              <div className="relative -mt-1 pt-1 pb-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-6">
                  {TEXT_SCALE_MARKS.map((mark) => {
                    const left = `${((mark - TEXT_SCALE_MIN) / (TEXT_SCALE_MAX - TEXT_SCALE_MIN)) * 100}%`;
                    const active = mark === textScalePercent;
                    return (
                      <button
                        key={mark}
                        type="button"
                        onClick={() => setTextScalePercent(mark)}
                        className="pointer-events-auto absolute -translate-x-1/2 flex flex-col items-center gap-1"
                        style={{ left }}
                        aria-label={t('settings.personalization.textSizeSet', 'Set to {{value}}%', {
                          value: mark,
                        })}
                      >
                        <span
                          className={`h-2 w-px rounded-full ${active ? 'bg-primary' : 'bg-border'}`}
                        />
                        <span
                          className={`text-[11px] font-semibold ${
                            active ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        >
                          {mark}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Section>

      <Section title={t('settings.accessibility.hapticFeedback')}>
        <Card className="space-y-0 divide-y divide-border">
          <Toggle
            label={t('settings.accessibility.hapticFeedback')}
            description={
              isHapticsAvailable
                ? t('settings.accessibility.hapticDesc')
                : t(
                    'settings.accessibility.hapticUnsupportedDesc',
                    'Not supported on this browser/device (e.g. iOS Safari/PWA).',
                  )
            }
            checked={hapticEnabled}
            onChange={handleHapticEnabledChange}
            disabled={!isHapticsAvailable}
            icon={<Vibrate size={20} weight="regular" />}
            activeColor="primary"
          />

          <div
            className={`flex items-center justify-between gap-3 py-3 ${!isHapticsAvailable ? 'opacity-50' : ''}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                {t('settings.accessibility.hapticIntensity', 'Intensity')}
              </div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-2">
                {t(
                  'settings.accessibility.hapticIntensityDesc',
                  'Adjust vibration strength (especially on web).',
                )}
              </div>
            </div>
            <SettingsSegmentedControl
              value={hapticIntensity}
              disabled={!isHapticsAvailable}
              options={[
                {
                  value: 'low',
                  label: t('settings.accessibility.hapticIntensityLow', 'Low'),
                },
                {
                  value: 'medium',
                  label: t('settings.accessibility.hapticIntensityMedium', 'Medium'),
                },
                {
                  value: 'high',
                  label: t('settings.accessibility.hapticIntensityHigh', 'High'),
                },
              ]}
              onChange={handleHapticIntensityChange}
              className="shrink-0"
            />
          </div>
        </Card>
      </Section>

      <Section title={t('settings.accessibility.sessionRecoveryTitle')}>
        <Card className="space-y-0 divide-y divide-border">
          <Toggle
            label={t(
              'settings.accessibility.sessionRecovery',
              'Offer to resume an interrupted session',
            )}
            description={t(
              'settings.accessibility.sessionRecoveryDesc',
              'Shows a prompt after refresh if a session was in progress',
            )}
            checked={sessionRecoveryEnabled}
            onChange={setSessionRecoveryEnabled}
            icon={<ArrowCounterClockwise size={20} weight="regular" />}
            activeColor="primary"
          />
        </Card>
      </Section>
    </div>
  );
}
