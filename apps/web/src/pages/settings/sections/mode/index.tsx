/**
 * Mode settings section - game mode selector + mode-specific settings
 *
 * This is the main entry point that combines the mode selector grid
 * with the mode-specific settings panel.
 */

import { type ReactNode, lazy, useEffect, useMemo, useState } from 'react';
import { SuspenseFade } from '../../../../components/suspense-fade';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, Hatching, InfoSheet, Section } from '@neurodual/ui';
import { CaretRight, Faders, Lock, Play, Timer } from '@phosphor-icons/react';
import { gameModeRegistry } from '@neurodual/logic';
import {
  FREE_TRAINING_DEFAULT_PRESET_ID,
  FREE_TRAINING_QUAD_PRESET_ID,
  FREE_TRAINING_RECOMMENDED_PRESET_ID,
  FREE_TRAINING_TRI_PRESET_ID,
  useSettingsStore,
} from '../../../../stores';
import { GameModeSelector } from './mode-selector';
import type { GameMode } from '../../config';
import { getRouteForMode } from '../../../../lib/mode-metadata';
import { createFreePlayIntent } from '../../../../lib/play-intent';
import { FreeTrainingPresetSelector } from './free-training-preset-selector';
import { GAME_MODES } from '../../config';
import { NLevelSelect } from './plugins/shared';
import { UpgradeDialog } from '../../components';
import { useDailyPlaytimeGate } from '@neurodual/ui';
import {
  getModePageCapabilities,
  supportsModeSubPage,
  type ModeSubPage,
} from './mode-page-capabilities';
import { useAlphaEnabled } from '../../../../hooks/use-beta-features';
import { getModeSettingsNavigation } from './mode-settings-navigation';
import { useIsReady } from '../../../../providers';
import { useHapticTrigger } from '../../../../hooks/use-haptic';
import { useAnalytics } from '../../../../hooks/use-analytics';
import { useModeGates } from '../../../../hooks/use-mode-gates';
import { useTransitionNavigate } from '../../../../hooks/use-transition-navigate';
import { DualMixSettingsCard } from './dual-mix-settings-card';

// Lazy load mode-specific settings for code splitting
const ModeSettingsPanel = lazy(() =>
  import('./mode-settings-panel').then((m) => {
    if (!m.ModeSettingsPanel) throw new Error('Chunk stale: ModeSettingsPanel export missing');
    return { default: m.ModeSettingsPanel };
  }),
);

function ModeSettingsSkeleton(): ReactNode {
  return (
    <div className="space-y-4">
      <div className="h-12 rounded-xl skeleton-breathe" />
      <div className="h-32 rounded-xl skeleton-breathe" />
      <div className="h-20 rounded-xl skeleton-breathe" />
    </div>
  );
}

function ModeQuickLaunchFooter({ mode }: { mode: GameMode }): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const triggerHaptic = useHapticTrigger();
  const { track } = useAnalytics();
  const { isModePlayable } = useModeGates();
  const dailyPlaytimeGate = useDailyPlaytimeGate();
  const isSystemReady = useIsReady();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const modeConfig = useMemo(() => GAME_MODES.find((entry) => entry.value === mode), [mode]);
  const Icon = modeConfig?.icon;
  const isDailyLimitReached = dailyPlaytimeGate.isLimitReached;
  const isPlayable = isModePlayable(mode);

  return (
    <>
      <UpgradeDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        source="mode_settings_quick_launch"
      />

      <div className="px-1 pb-2 flex flex-col items-center gap-2">
        <Hatching id={`mode-settings-launch-${mode}`} className="mb-2" />

        {!isPlayable ? (
          <Button
            size="lg"
            variant="secondary"
            className="w-auto px-10 rounded-full py-4"
            disabled
            data-locked="true"
          >
            <Lock size={20} weight="bold" className="mr-2" />
            {t('common.comingSoon', 'Coming soon')}
          </Button>
        ) : isDailyLimitReached ? (
          <>
            <Button
              size="lg"
              variant="secondary"
              className="w-auto px-10 rounded-full py-4"
              onClick={() => setShowUpgradeDialog(true)}
            >
              <Timer size={20} weight="bold" className="mr-2" />
              {t('home.dailyLimit.unlock', 'Go unlimited')}
            </Button>
            <p className="typo-caption text-muted-foreground text-center max-w-xs">
              {t(
                'home.dailyLimit.message',
                "Today's session is done. Want to keep going? Go unlimited.",
              )}
            </p>
          </>
        ) : (
          <Button
            size="lg"
            className="w-auto px-4 py-3 rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform"
            disabled={!isSystemReady}
            onClick={() => {
              triggerHaptic(35);
              track('mode_selected', {
                mode,
                source: 'settings_mode_config',
              });
              transitionNavigate(getRouteForMode(mode), {
                direction: 'modal',
                state: createFreePlayIntent(mode),
              });
            }}
          >
            {Icon ? (
              <span className="shrink-0 p-2 rounded-xl bg-primary-foreground/15">
                <Icon size={20} weight="duotone" />
              </span>
            ) : null}
            <span className="text-sm font-semibold whitespace-nowrap">
              {!isSystemReady ? t('common.loading', 'Loading...') : t(modeConfig?.labelKey ?? '')}
            </span>
            <Play size={22} weight="fill" className="shrink-0" />
          </Button>
        )}
      </div>
    </>
  );
}

type ModePage = 'root' | ModeSubPage;

function isModeSubPage(value: string | undefined): value is ModeSubPage {
  return (
    value === 'mode' ||
    value === 'presets' ||
    value === 'base' ||
    value === 'tempo' ||
    value === 'generator' ||
    value === 'advanced'
  );
}

export function ModeSection(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { transitionNavigate } = useTransitionNavigate();
  const { subSection } = useParams<{ subSection?: string }>();
  const alphaEnabled = useAlphaEnabled();
  const currentMode = useSettingsStore((s) => s.freeTraining.selectedModeId) as GameMode;
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const page: ModePage = isModeSubPage(subSection) ? subSection : 'root';

  const freeTrainingPresetsByMode = useSettingsStore((s) => s.ui.freeTrainingPresetsByMode);
  const freeTrainingActivePresetIdByMode = useSettingsStore(
    (s) => s.ui.freeTrainingActivePresetIdByMode,
  );

  const selectedPresetId = useMemo(() => {
    const activeId = freeTrainingActivePresetIdByMode[currentMode];
    return activeId ?? FREE_TRAINING_DEFAULT_PRESET_ID;
  }, [currentMode, freeTrainingActivePresetIdByMode]);

  const currentModeLabel = useMemo(() => {
    const config = GAME_MODES.find((m) => m.value === currentMode);
    return config ? t(config.labelKey) : currentMode;
  }, [currentMode, t]);

  const selectedPresetLabel = useMemo(() => {
    const presets = freeTrainingPresetsByMode[currentMode] ?? [];
    const activeId = freeTrainingActivePresetIdByMode[currentMode];
    const selectedId = activeId ?? FREE_TRAINING_DEFAULT_PRESET_ID;
    if (selectedId === FREE_TRAINING_RECOMMENDED_PRESET_ID) {
      return currentMode === 'sim-brainworkshop'
        ? t('settings.presets.dualNBack', 'Dual N-Back')
        : t('settings.presets.recommended');
    }
    if (selectedId === FREE_TRAINING_TRI_PRESET_ID) return t('settings.presets.tri');
    if (selectedId === FREE_TRAINING_QUAD_PRESET_ID) return t('settings.presets.quad');
    if (selectedId === FREE_TRAINING_DEFAULT_PRESET_ID) return t('settings.presets.default');
    const match = presets.find((p) => p.id === selectedId);
    return match?.name ?? t('settings.presets.default');
  }, [currentMode, freeTrainingActivePresetIdByMode, freeTrainingPresetsByMode, t]);

  const isBuiltInTemplatePreset =
    selectedPresetId === FREE_TRAINING_RECOMMENDED_PRESET_ID ||
    selectedPresetId === FREE_TRAINING_TRI_PRESET_ID ||
    selectedPresetId === FREE_TRAINING_QUAD_PRESET_ID;

  const isDualnbackClassic = currentMode === 'dualnback-classic';
  const isDualMix = currentMode === 'dual-mix';
  const supportsModeSettings = gameModeRegistry.has(currentMode);
  const capabilities = useMemo(
    () => getModePageCapabilities(currentMode, alphaEnabled),
    [alphaEnabled, currentMode],
  );
  const navigationCopy = useMemo(() => getModeSettingsNavigation(currentMode), [currentMode]);
  const showPresetNavigation = supportsModeSettings && capabilities.supportsPresets;
  const inlineBaseSettings = supportsModeSettings && capabilities.inlineBaseSettings;
  const hasTempo = supportsModeSettings && capabilities.hasTempo;
  const hasGenerator = supportsModeSettings && capabilities.hasGenerator;
  const hasAdvanced = supportsModeSettings && capabilities.hasAdvanced;

  useEffect(() => {
    if (subSection && !isModeSubPage(subSection)) {
      navigate('/settings/mode', { replace: true });
    }
  }, [navigate, subSection]);

  useEffect(() => {
    if (!isDualnbackClassic) return;
    if (page === 'mode' || page === 'root') return;
    navigate('/settings/mode', { replace: true });
  }, [isDualnbackClassic, navigate, page]);

  useEffect(() => {
    if (page === 'root' || page === 'mode') return;
    if (!supportsModeSettings) {
      navigate('/settings/mode', { replace: true });
      return;
    }
    if (supportsModeSubPage(currentMode, page, alphaEnabled)) return;
    navigate('/settings/mode', { replace: true });
  }, [alphaEnabled, currentMode, navigate, page, supportsModeSettings]);

  const classicNLevel = useSettingsStore((s) => {
    const value = s.modes['dualnback-classic']?.nLevel;
    return typeof value === 'number' && Number.isFinite(value) ? value : 2;
  });
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);

  const navigateToPage = (nextPage: ModePage, replace = false) => {
    transitionNavigate(nextPage === 'root' ? '/settings/mode' : `/settings/mode/${nextPage}`, {
      replace,
      direction: nextPage === 'root' ? 'back' : 'push',
    });
  };

  if (page === 'mode') {
    return (
      <div className="space-y-6">
        <GameModeSelector
          variant="card"
          lockedModesUi="hidden"
          sectionFilter="training"
          onPlay={(mode) =>
            transitionNavigate(getRouteForMode(mode), {
              direction: 'modal',
              state: createFreePlayIntent(mode),
            })
          }
          stickyExtra={
            <button
              type="button"
              onClick={() => navigateToPage('root')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg transition-all active:scale-95"
              aria-label={t('settings.freeTrainingCards.modeAndPresets')}
            >
              <Faders size={20} weight="bold" />
            </button>
          }
        />
      </div>
    );
  }

  if (page === 'presets') {
    return (
      <div className="space-y-6">
        <Card>
          <FreeTrainingPresetSelector mode={currentMode} />
        </Card>
        <ModeQuickLaunchFooter mode={currentMode} />
      </div>
    );
  }

  if (page === 'base' || page === 'tempo' || page === 'generator' || page === 'advanced') {
    return (
      <div className="space-y-6">
        <SuspenseFade fallback={<ModeSettingsSkeleton />}>
          <ModeSettingsPanel mode={currentMode} showPresets={false} forcedTab={page} />
        </SuspenseFade>
        <ModeQuickLaunchFooter mode={currentMode} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UpgradeDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        source="mode_settings"
      />

      <Section
        title={t(
          isDualnbackClassic || !showPresetNavigation
            ? 'settings.freeTrainingCards.mode'
            : 'settings.freeTrainingCards.modeAndPresets',
        )}
      >
        <Card className="space-y-0" padding="none">
          <div className="divide-y divide-border px-4">
            <button
              type="button"
              onClick={() => navigateToPage('mode')}
              className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.gameMode.activeMode')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                  {currentModeLabel}
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
            </button>

            {isDualnbackClassic ? (
              <div className="py-4">
                <NLevelSelect
                  value={classicNLevel}
                  onChange={(value) => setModeSettingFor('dualnback-classic', 'nLevel', value)}
                  onUpgradeClick={() => setShowUpgradeDialog(true)}
                />
              </div>
            ) : showPresetNavigation ? (
              <button
                type="button"
                onClick={() => navigateToPage('presets')}
                className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-bold text-foreground">{t('settings.presets.title')}</div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                    {selectedPresetLabel}
                  </div>
                </div>
                <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
              </button>
            ) : null}
          </div>
        </Card>
      </Section>

      {/* Mode-specific Settings */}
      {isDualnbackClassic ? null : isDualMix ? (
        <Section title={t('settings.config.main')}>
          <Card>
            <DualMixSettingsCard />
          </Card>
        </Section>
      ) : !supportsModeSettings ? (
        <Section title={t('settings.config.main')}>
          <Card>
            <div className="space-y-2">
              <div className="font-bold text-foreground">
                {t(
                  'settings.modeAvailability.unsupportedTitle',
                  'Settings are not wired for this mode yet',
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t(
                  'settings.modeAvailability.unsupportedBody',
                  'You can still select and launch this mode, but the dedicated settings panel is not connected to the registry yet.',
                )}
              </p>
            </div>
          </Card>
        </Section>
      ) : (
        <Section
          title={
            inlineBaseSettings
              ? t(navigationCopy.sectionTitle, navigationCopy.sectionTitleDefault)
              : showPresetNavigation
                ? t('settings.freeTrainingCards.presetCustomizeTitle', {
                    preset: selectedPresetLabel,
                  })
                : t(navigationCopy.sectionTitle, navigationCopy.sectionTitleDefault)
          }
          action={
            showPresetNavigation && isBuiltInTemplatePreset ? (
              <InfoSheet iconSize={14} title={t('settings.presets.title')}>
                {t('settings.freeTrainingCards.presetTemplateInfo')}
              </InfoSheet>
            ) : null
          }
        >
          {inlineBaseSettings ? (
            <SuspenseFade fallback={<ModeSettingsSkeleton />}>
              <ModeSettingsPanel mode={currentMode} showPresets={false} forcedTab="base" />
            </SuspenseFade>
          ) : (
            <Card className="space-y-0" padding="none">
              <div className="divide-y divide-border px-4">
                <button
                  type="button"
                  onClick={() => navigateToPage('base')}
                  className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">
                      {t(navigationCopy.base.title, navigationCopy.base.titleDefault)}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                      {t(navigationCopy.base.subtitle, navigationCopy.base.subtitleDefault)}
                    </div>
                  </div>
                  <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
                </button>

                {hasTempo ? (
                  <button
                    type="button"
                    onClick={() => navigateToPage('tempo')}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">
                        {t(navigationCopy.tempo.title, navigationCopy.tempo.titleDefault)}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                        {t(navigationCopy.tempo.subtitle, navigationCopy.tempo.subtitleDefault)}
                      </div>
                    </div>
                    <CaretRight
                      size={16}
                      weight="bold"
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ) : null}

                {hasGenerator ? (
                  <button
                    type="button"
                    onClick={() => navigateToPage('generator')}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">
                        {t(navigationCopy.generator.title, navigationCopy.generator.titleDefault)}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                        {t(
                          navigationCopy.generator.subtitle,
                          navigationCopy.generator.subtitleDefault,
                        )}
                      </div>
                    </div>
                    <CaretRight
                      size={16}
                      weight="bold"
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ) : null}

                {hasAdvanced ? (
                  <button
                    type="button"
                    onClick={() => navigateToPage('advanced')}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">
                        {t(navigationCopy.advanced.title, navigationCopy.advanced.titleDefault)}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                        {t(
                          navigationCopy.advanced.subtitle,
                          navigationCopy.advanced.subtitleDefault,
                        )}
                      </div>
                    </div>
                    <CaretRight
                      size={16}
                      weight="bold"
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ) : null}
              </div>
            </Card>
          )}
        </Section>
      )}

      <ModeQuickLaunchFooter mode={currentMode} />
    </div>
  );
}

export { GameModeSelector } from './mode-selector';
