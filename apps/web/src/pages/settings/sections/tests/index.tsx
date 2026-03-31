/**
 * Tests section - cognitive tests with settings page (mirrors ModeSection pattern)
 *
 * Structure:
 * - root: selected test mode + settings panel + play button
 * - mode: full test catalogue (GameModeSelector with sectionFilter="test")
 * - base/tempo/generator/advanced: forced settings sub-pages
 */

import { type ReactNode, lazy, useEffect, useMemo, useState } from 'react';
import { SuspenseFade } from '../../../../components/suspense-fade';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, Hatching, Section } from '@neurodual/ui';
import { CaretRight, Faders, Lock, Play, Timer } from '@phosphor-icons/react';
import { gameModeRegistry } from '@neurodual/logic';
import { useSettingsStore } from '../../../../stores';
import { GameModeSelector } from '../mode/mode-selector';
import type { GameMode } from '../../config';
import { GAME_MODES } from '../../config';
import { getRouteForMode } from '../../../../lib/mode-metadata';
import { createFreePlayIntent } from '../../../../lib/play-intent';
import { supportsModeSubPage, type ModeSubPage } from '../mode/mode-page-capabilities';
import { getModeSettingsNavigation } from '../mode/mode-settings-navigation';
import { useAlphaEnabled } from '../../../../hooks/use-beta-features';
import { useIsReady } from '../../../../providers';
import { useHapticTrigger } from '../../../../hooks/use-haptic';
import { useAnalytics } from '../../../../hooks/use-analytics';
import { useModeGates } from '../../../../hooks/use-mode-gates';
import { useDailyPlaytimeGate } from '@neurodual/ui';
import { UpgradeDialog } from '../../components';

const ModeSettingsPanel = lazy(() =>
  import('../mode/mode-settings-panel').then((m) => {
    if (!m.ModeSettingsPanel) throw new Error('Chunk stale: ModeSettingsPanel export missing');
    return { default: m.ModeSettingsPanel };
  }),
);

function SettingsSkeleton(): ReactNode {
  return (
    <div className="space-y-4">
      <div className="h-12 rounded-xl skeleton-breathe" />
      <div className="h-32 rounded-xl skeleton-breathe" />
      <div className="h-20 rounded-xl skeleton-breathe" />
    </div>
  );
}

function TestQuickLaunchFooter({ mode }: { mode: GameMode }): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        source="tests_settings_quick_launch"
      />

      <div className="px-1 pb-2 flex flex-col items-center gap-2">
        <Hatching id={`test-settings-launch-${mode}`} className="mb-2" />

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
                source: 'settings_test_config',
              });
              navigate(getRouteForMode(mode), {
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

type TestPage = 'root' | ModeSubPage;

function isTestSubPage(value: string | undefined): value is ModeSubPage {
  return (
    value === 'mode' ||
    value === 'base' ||
    value === 'tempo' ||
    value === 'generator' ||
    value === 'advanced'
  );
}

export function TestsSection(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subSection } = useParams<{ subSection?: string }>();
  const alphaEnabled = useAlphaEnabled();
  const currentMode = useSettingsStore((s) => s.currentMode) as GameMode;

  const page: TestPage = isTestSubPage(subSection) ? subSection : 'root';

  const currentModeLabel = useMemo(() => {
    const config = GAME_MODES.find((m) => m.value === currentMode);
    return config ? t(config.labelKey) : currentMode;
  }, [currentMode, t]);

  const supportsModeSettings = gameModeRegistry.has(currentMode);
  const navigationCopy = useMemo(() => getModeSettingsNavigation(currentMode), [currentMode]);

  useEffect(() => {
    if (subSection && !isTestSubPage(subSection)) {
      navigate('/settings/tests', { replace: true });
    }
  }, [navigate, subSection]);

  useEffect(() => {
    if (page === 'root' || page === 'mode') return;
    if (!supportsModeSettings) {
      navigate('/settings/tests', { replace: true });
      return;
    }
    if (supportsModeSubPage(currentMode, page, alphaEnabled)) return;
    navigate('/settings/tests', { replace: true });
  }, [alphaEnabled, currentMode, navigate, page, supportsModeSettings]);

  const navigateToPage = (nextPage: TestPage, replace = false) => {
    navigate(nextPage === 'root' ? '/settings/tests' : `/settings/tests/${nextPage}`, { replace });
  };

  // ── Sub-page: full test catalogue ──
  if (page === 'mode') {
    return (
      <div className="space-y-6">
        <GameModeSelector
          variant="card"
          lockedModesUi="hidden"
          sectionFilter="test"
          onPlay={(mode) => navigate(getRouteForMode(mode), { state: createFreePlayIntent(mode) })}
          stickyExtra={
            <button
              type="button"
              onClick={() => navigateToPage('root')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg transition-all active:scale-95"
              aria-label={t('settings.tests.settings', 'Test settings')}
            >
              <Faders size={20} weight="bold" />
            </button>
          }
        />
      </div>
    );
  }

  // ── Sub-page: forced settings tab ──
  if (page === 'base' || page === 'tempo' || page === 'generator' || page === 'advanced') {
    return (
      <div className="space-y-6">
        <SuspenseFade fallback={<SettingsSkeleton />}>
          <ModeSettingsPanel mode={currentMode} showPresets={false} forcedTab={page} />
        </SuspenseFade>
        <TestQuickLaunchFooter mode={currentMode} />
      </div>
    );
  }

  // ── Root page: selected test + settings + play ──
  return (
    <div className="space-y-6">
      <Section title={t('settings.tests.selectedTest', 'Test')}>
        <Card className="space-y-0" padding="none">
          <div className="divide-y divide-border px-4">
            <button
              type="button"
              onClick={() => navigateToPage('mode')}
              className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground">
                  {t('settings.tests.activeTest', 'Test actif')}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                  {currentModeLabel}
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
            </button>
          </div>
        </Card>
      </Section>

      {/* Mode-specific settings — always inline for tests */}
      {supportsModeSettings ? (
        <Section title={t(navigationCopy.sectionTitle, navigationCopy.sectionTitleDefault)}>
          <SuspenseFade fallback={<SettingsSkeleton />}>
            <ModeSettingsPanel mode={currentMode} showPresets={false} forcedTab="base" />
          </SuspenseFade>
        </Section>
      ) : null}

      <TestQuickLaunchFooter mode={currentMode} />
    </div>
  );
}
