/**
 * Mode settings panel - Unified settings layout
 *
 * Structure:
 * - BASE: N-Level, Modalities, Session Length (always visible)
 * - MODE SECTIONS: tempo / generation / advanced according to each mode
 */

import { type ReactNode, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  cn,
  EditableSlider,
  InfoSheet,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SubCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
  useMaxAchievedLevelForModeQuery,
  useSessionSummariesCountQuery,
} from '@neurodual/ui';
import { CaretDown, Gauge } from '@phosphor-icons/react';
import { gameModeRegistry, type ConfigurableSettingKey, type ModalityId } from '@neurodual/logic';
import {
  FREE_TRAINING_QUAD_PRESET_ID,
  FREE_TRAINING_RECOMMENDED_PRESET_ID,
  FREE_TRAINING_TRI_PRESET_ID,
  useSettingsStore,
  type ProgressionAlgorithmId,
} from '../../../../stores';
import type { GameMode } from '../../config';
import { MODE_COLORS } from '../../config';
import { ModalityMixer, NLevelSelect, ProgressionSelect } from './plugins/shared';
import { useAlphaEnabled } from '../../../../hooks/use-beta-features';
import { useAnalytics } from '../../../../hooks/use-analytics';
import { canUseJourneySettingsScope } from '../../../../lib/journey-session-mode';
import { useJourneyStateWithContext } from '../../../../lib/journey-stubs';

// Stub for removed dual-track-settings
type DualTrackResolvedIdentityMode = string;
// biome-ignore lint/suspicious/noExplicitAny: stub for removed dual-track-settings
function normalizeDualTrackResolvedSettings(..._args: unknown[]): any {
  return {};
}
// biome-ignore lint/suspicious/noExplicitAny: stub for removed dual-track-settings
const hybridStrategy = {} as any;
import { SettingsSegmentedControl, UpgradeDialog } from '../../components';
import { FreeTrainingPresetSelector } from './free-training-preset-selector';
import { JourneyPresetSelector } from './journey-preset-selector';
import { useShallow } from 'zustand/react/shallow';

const EMPTY_SETTINGS_OBJECT: Record<string, unknown> = {};
const BRAINWORKSHOP_COMBO_MODALITIES = ['position', 'audio', 'color', 'image'] as const;
const DUAL_TRACK_HIDDEN_MODALITIES = ['arithmetic', 'visvis', 'visaudio', 'audiovis'] as const;
const VISUAL_IDENTITY_MODALITIES = [
  'position',
  'color',
  'image',
  'spatial',
  'digits',
  'emotions',
  'words',
] as const;

interface ModeSettingsPanelProps {
  mode: GameMode;
  scopeOverride?: 'free' | 'journey';
  showPresets?: boolean;
  forcedTab?: 'base' | 'tempo' | 'generator' | 'advanced';
  readOnly?: boolean;
}

function SettingBlock({
  children,
  className,
  hideTabs,
}: {
  children: ReactNode;
  className?: string;
  hideTabs: boolean;
}): ReactNode {
  if (!hideTabs) return <SubCard className={className}>{children}</SubCard>;
  return <div className={cn('py-3', className)}>{children}</div>;
}

function SettingsGroupHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}): ReactNode {
  return (
    <div className={cn('pt-2 pb-1', className)}>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
        {title}
      </div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

const isProgressionAlgorithmId = (value?: string): value is ProgressionAlgorithmId =>
  value === 'adaptive' || value === 'meta-learning' || value === 'jitter-adaptive';

function DualTrackBaseSettingsSection({
  wrapInBlock = true,
  hideTabs,
  isHybridJourneyScope,
  hybridTrackSessionsPerBlock,
  hybridDnbSessionsPerBlock,
  onHybridTrackSessionsPerBlockChange,
  onHybridDnbSessionsPerBlockChange,
  positionIdentityEnabled,
  colorIdentityEnabled,
  letterAudioEnabled,
  imageIdentityEnabled,
  spatialIdentityEnabled,
  digitsIdentityEnabled,
  emotionsIdentityEnabled,
  wordsIdentityEnabled,
  tonesEnabled,
  focusCrossEnabled,
  onTrackingIdentityModeChange,
  onTrackingLetterAudioEnabledChange,
  onTrackingTonesEnabledChange,
  onFocusCrossEnabledChange,
  autoCalibrationSummary,
}: {
  wrapInBlock?: boolean;
  hideTabs: boolean;
  isHybridJourneyScope: boolean;
  hybridTrackSessionsPerBlock: number;
  hybridDnbSessionsPerBlock: number;
  onHybridTrackSessionsPerBlockChange: (value: number) => void;
  onHybridDnbSessionsPerBlockChange: (value: number) => void;
  positionIdentityEnabled: boolean;
  colorIdentityEnabled: boolean;
  letterAudioEnabled: boolean;
  imageIdentityEnabled: boolean;
  spatialIdentityEnabled: boolean;
  digitsIdentityEnabled: boolean;
  emotionsIdentityEnabled: boolean;
  wordsIdentityEnabled: boolean;
  tonesEnabled: boolean;
  focusCrossEnabled: boolean;
  onTrackingIdentityModeChange: (
    value: 'classic' | 'position' | 'color' | 'image' | 'spatial' | 'digits' | 'emotions' | 'words',
  ) => void;
  onTrackingLetterAudioEnabledChange: (value: boolean) => void;
  onTrackingTonesEnabledChange: (value: boolean) => void;
  onFocusCrossEnabledChange: (value: boolean) => void;
  autoCalibrationSummary: string;
}): ReactNode {
  const { t } = useTranslation();
  const content = (
    <div className="space-y-3">
      {isHybridJourneyScope && (
        <>
          <SettingsGroupHeader
            title={t('settings.dualTrack.groupHybrid', 'Hybrid cycle')}
            description={t(
              'settings.dualTrack.groupHybridDesc',
              'Choose how many Track and DNB sessions are played before the loop switches phase.',
            )}
          />
          <EditableSlider
            label={t('settings.dualTrack.hybridTrackBlockLabel', 'Dual Track sessions per loop')}
            value={hybridTrackSessionsPerBlock}
            min={1}
            max={3}
            step={1}
            onChange={onHybridTrackSessionsPerBlockChange}
          />
          <EditableSlider
            label={t('settings.dualTrack.hybridDnbBlockLabel', 'Dual N-Back sessions per loop')}
            value={hybridDnbSessionsPerBlock}
            min={1}
            max={5}
            step={1}
            onChange={onHybridDnbSessionsPerBlockChange}
          />
        </>
      )}
      <SettingsGroupHeader
        title={t('settings.dualTrack.groupModalities', 'Modalities')}
        description={t(
          'settings.dualTrack.groupModalitiesDesc',
          'Choose the identity cue shown on each target.',
        )}
      />
      <ModalityMixer
        activeModalities={[
          ...(positionIdentityEnabled ? (['position'] as const) : []),
          ...(colorIdentityEnabled ? (['color'] as const) : []),
          ...(letterAudioEnabled ? (['audio'] as const) : []),
          ...(imageIdentityEnabled ? (['image'] as const) : []),
          ...(spatialIdentityEnabled ? (['spatial'] as const) : []),
          ...(digitsIdentityEnabled ? (['digits'] as const) : []),
          ...(emotionsIdentityEnabled ? (['emotions'] as const) : []),
          ...(wordsIdentityEnabled ? (['words'] as const) : []),
          ...(tonesEnabled ? (['tones'] as const) : []),
        ]}
        onToggle={(modality) => {
          // Audio channels (additive)
          if (modality === 'audio') {
            onTrackingLetterAudioEnabledChange(!letterAudioEnabled);
            return;
          }
          if (modality === 'tones') {
            onTrackingTonesEnabledChange(!tonesEnabled);
            return;
          }
          // Visual identity modes (mutually exclusive)
          if ((VISUAL_IDENTITY_MODALITIES as readonly string[]).includes(modality)) {
            const currentlyEnabled =
              (modality === 'position' && positionIdentityEnabled) ||
              (modality === 'color' && colorIdentityEnabled) ||
              (modality === 'image' && imageIdentityEnabled) ||
              (modality === 'spatial' && spatialIdentityEnabled) ||
              (modality === 'digits' && digitsIdentityEnabled) ||
              (modality === 'emotions' && emotionsIdentityEnabled) ||
              (modality === 'words' && wordsIdentityEnabled);
            onTrackingIdentityModeChange(
              currentlyEnabled
                ? 'classic'
                : (modality as (typeof VISUAL_IDENTITY_MODALITIES)[number]),
            );
          }
        }}
        hiddenModalities={[...DUAL_TRACK_HIDDEN_MODALITIES]}
      />
      <Toggle
        label={t('settings.dualTrack.focusCross', 'Focus cross')}
        description={t(
          'settings.dualTrack.focusCrossDesc',
          'An amber crosshair moves across the arena during tracking to help anchor your attention.',
        )}
        checked={focusCrossEnabled}
        onChange={onFocusCrossEnabledChange}
      />
      <p className="text-xs text-muted-foreground leading-relaxed">{autoCalibrationSummary}</p>
    </div>
  );

  if (!wrapInBlock) return content;
  return <SettingBlock hideTabs={hideTabs}>{content}</SettingBlock>;
}

export function ModeSettingsPanel({
  mode,
  scopeOverride,
  showPresets = true,
  forcedTab,
  readOnly = false,
}: ModeSettingsPanelProps): ReactNode {
  const { t } = useTranslation();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [brainWorkshopTab, setBrainWorkshopTab] = useState<
    'essentials' | 'tempo' | 'generator' | 'advanced'
  >('essentials');
  const [modeSettingsTab, setModeSettingsTab] = useState<
    'base' | 'tempo' | 'generator' | 'advanced'
  >('base');
  const [brainWorkshopGeneratorOpen, setBrainWorkshopGeneratorOpen] = useState(false);
  const [brainWorkshopAdvancedOpen, setBrainWorkshopAdvancedOpen] = useState(false);

  // Mode definition from registry
  const modeDefinition = gameModeRegistry.get(mode);
  const configurableSettings = modeDefinition.configurableSettings;

  // Journey context (active journey only)
  const { state: journeyState } = useJourneyStateWithContext();
  const activeJourneyId = useSettingsStore((s) => s.journeyUi.selectedJourneyId);
  const activeJourneyGameMode = useSettingsStore(
    (s) => s.savedJourneys.find((j) => j.id === s.journeyUi.selectedJourneyId)?.gameMode,
  );
  const activeJourneyStrategyConfig = useSettingsStore(
    (s) => s.savedJourneys.find((j) => j.id === s.journeyUi.selectedJourneyId)?.strategyConfig,
  );
  const journeyActivePresetId = useSettingsStore(
    (s) => s.ui.journeyActivePresetIdByJourneyId[activeJourneyId],
  );
  const freeTrainingActivePresetId = useSettingsStore(
    (s) => s.ui.freeTrainingActivePresetIdByMode[mode],
  );

  // Settings sources (free vs journey)
  const freeModeSettings = useSettingsStore((s) => s.modes[mode]);
  const journeyModeSettings = useSettingsStore(
    (s) => s.ui.journeyModeSettingsByJourneyId[activeJourneyId],
  );
  const canUseJourneyScope = canUseJourneySettingsScope({
    journeyGameModeId: activeJourneyGameMode,
    modeId: mode,
  });
  const effectiveScope = scopeOverride ?? 'free';
  const isJourneyScope = effectiveScope === 'journey' && canUseJourneyScope;
  const interactionsLocked = readOnly && isJourneyScope;
  const modeSettings =
    (isJourneyScope ? journeyModeSettings : freeModeSettings) ?? EMPTY_SETTINGS_OBJECT;

  const setModeSettingForFree = useSettingsStore((s) => s.setModeSettingFor);
  const setJourneyModeSetting = useSettingsStore((s) => s.setJourneyModeSetting);
  const setJourneyStrategyConfig = useSettingsStore((s) => s.setJourneyStrategyConfig);
  const { track } = useAnalytics();
  const setModeSetting = (key: string, value: unknown) => {
    if (interactionsLocked) return;
    track('setting_changed', {
      setting: key,
      mode,
      value:
        typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean),
    });
    if (isJourneyScope) {
      setJourneyModeSetting(activeJourneyId, key as never, value as never);
      return;
    }
    setModeSettingForFree(mode, key as never, value as never);
  };
  const setModeSettingFor = (modeId: GameMode, key: string, value: unknown) => {
    if (interactionsLocked) return;
    track('setting_changed', {
      setting: key,
      mode: modeId,
      value:
        typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean),
    });
    if (isJourneyScope) {
      setJourneyModeSetting(activeJourneyId, key as never, value as never);
      return;
    }
    setModeSettingForFree(modeId, key as never, value as never);
  };

  const { count: sessionCount } = useSessionSummariesCountQuery();
  const { maxLevel: maxAchievedLevelForMode } = useMaxAchievedLevelForModeQuery(mode);
  const alphaEnabled = useAlphaEnabled();

  // Resolved mode with extensions
  // Note: Ce panneau gère plusieurs modes avec des extensions différentes.
  // resolveWithSettings() garantit que les valeurs existent pour le mode actif.
  const resolvedMode = useMemo(
    () => gameModeRegistry.resolveWithSettings(mode, modeSettings),
    [mode, modeSettings],
  );
  const extensions = (resolvedMode.spec.extensions ?? {}) as {
    // Flow/Label common
    placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
    distractorCount: number;
    distractorSource: 'random' | 'proactive';
    hideFilledCards: boolean;
    noRepetitions: boolean;
    trialColorCoding: boolean;
    // Recall
    fillOrderMode: 'sequential' | 'random';
    // Brain Workshop Faithful
    guaranteedMatchProbability: number;
    interferenceProbability: number;
    variableNBack: boolean;
    crabBackMode: boolean;
    // BW Advanced knobs (formula: trialsBase + trialsFactor * n^trialsExponent)
    trialsBase: number;
    trialsFactor: number;
    trialsExponent: number;
    arithmeticDifficulty: 1 | 2 | 3 | 4;
    // Multi-stimulus (BW)
    multiStimulus: 1 | 2 | 3 | 4;
    multiMode: 'color' | 'image';
    multiAudio: 1 | 2;
    selfPaced: boolean;
    // Trace
    rhythmMode: 'self-paced' | 'timed';
    dynamicRules: boolean;
    dynamicSwipeDirection: boolean;
    arithmeticInterference?: { enabled: boolean };
    // Dual Track
    totalObjects?: number;
    targetCount?: number;
    trackingDurationMs?: number;
    trackingDurationMode?: 'auto' | 'manual';
    speedPxPerSec?: number;
    trackingSpeedMode?: 'auto' | 'manual';
    trackingIdentityMode?: string;
    trackingLetterAudioEnabled?: boolean;
    trackingTonesEnabled?: boolean;
    motionComplexity?: 'smooth' | 'standard' | 'agile';
    crowdingMode?: 'low' | 'standard' | 'dense';
    focusCrossEnabled?: boolean;
    renderMode?: 'dom' | 'webgl' | 'webgl3d';
  };

  // Extension values with defensive fallbacks for legacy/incomplete persisted settings
  const placementOrderMode = extensions.placementOrderMode;
  const distractorCount = extensions.distractorCount;
  const distractorSource = extensions.distractorSource;
  const hideFilledCards = extensions.hideFilledCards;
  const noRepetitions = extensions.noRepetitions;
  const trialColorCoding = extensions.trialColorCoding;
  const fillOrderMode = extensions.fillOrderMode;
  const randomFillOrder = fillOrderMode === 'random';

  // Brain Workshop Faithful extension values
  const guaranteedMatchProbability = extensions.guaranteedMatchProbability ?? 0.125;
  const interferenceProbability = extensions.interferenceProbability ?? 0.125;
  const variableNBack = extensions.variableNBack ?? false;
  const crabBackMode = extensions.crabBackMode ?? false;
  // BW Advanced knobs
  const trialsBase = Number.isFinite(extensions.trialsBase) ? extensions.trialsBase : 20;
  const trialsFactor = Number.isFinite(extensions.trialsFactor) ? extensions.trialsFactor : 1;
  const trialsExponent = Number.isFinite(extensions.trialsExponent) ? extensions.trialsExponent : 2;
  const arithmeticDifficulty = (() => {
    const raw = Number(extensions.arithmeticDifficulty);
    if (!Number.isFinite(raw)) return 4;
    const normalized = Math.round(raw);
    return normalized >= 1 && normalized <= 4 ? (normalized as 1 | 2 | 3 | 4) : 4;
  })();

  // Multi-stimulus extension values (BrainWorkshop)
  const multiStimulus = extensions.multiStimulus ?? 1;
  const multiMode = extensions.multiMode ?? 'color';
  const multiAudio = extensions.multiAudio ?? 1;
  const selfPaced = extensions.selfPaced ?? false;

  // Trace-specific settings (dynamicRules from spec extensions, timings from UI store)
  const dynamicRules = extensions.dynamicRules ?? false;
  const setDynamicRules = (enabled: boolean) => setModeSetting('dynamicRules', enabled);
  const dynamicSwipeDirection = extensions.dynamicSwipeDirection ?? false;
  const setDynamicSwipeDirection = (enabled: boolean) =>
    setModeSetting('dynamicSwipeDirection', enabled);
  const sequentialTrace = (extensions as { sequentialTrace?: boolean }).sequentialTrace ?? false;
  const setSequentialTrace = (enabled: boolean) => setModeSetting('sequentialTrace', enabled);
  const mindfulTiming = (
    extensions as {
      mindfulTiming?: {
        enabled?: boolean;
        positionDurationMs?: number;
        positionToleranceMs?: number;
        writingDurationMs?: number;
        writingToleranceMs?: number;
      };
    }
  ).mindfulTiming;
  const mindfulTimingEnabled = mindfulTiming?.enabled ?? false;
  const mindfulPositionDurationMs = mindfulTiming?.positionDurationMs ?? 3000;
  const mindfulPositionToleranceMs = mindfulTiming?.positionToleranceMs ?? 200;
  const mindfulWritingDurationMs = mindfulTiming?.writingDurationMs ?? 2000;
  const mindfulWritingToleranceMs = mindfulTiming?.writingToleranceMs ?? 200;
  const setMindfulTimingEnabled = (enabled: boolean) =>
    setModeSetting('mindfulTimingEnabled', enabled);
  const setMindfulPositionDurationMs = (value: number) =>
    setModeSetting('mindfulPositionDurationMs', Math.max(500, Math.round(value)));
  const setMindfulPositionToleranceMs = (value: number) =>
    setModeSetting('mindfulPositionToleranceMs', Math.max(50, Math.round(value)));
  const setMindfulWritingDurationMs = (value: number) =>
    setModeSetting('mindfulWritingDurationMs', Math.max(500, Math.round(value)));
  const setMindfulWritingToleranceMs = (value: number) =>
    setModeSetting('mindfulWritingToleranceMs', Math.max(50, Math.round(value)));
  const arithmeticEnabled = extensions.arithmeticInterference?.enabled ?? false;
  const setArithmeticEnabled = (enabled: boolean) => setModeSetting('arithmeticEnabled', enabled);
  const dualTrackTrackingDurationMode =
    (modeSettings as { trackingDurationMode?: 'auto' | 'manual' }).trackingDurationMode ?? 'auto';
  const dualTrackTrackingSpeedMode =
    (modeSettings as { trackingSpeedMode?: 'auto' | 'manual' }).trackingSpeedMode ?? 'auto';
  const dualTrackResolvedSettings = normalizeDualTrackResolvedSettings({
    totalObjects: Number(extensions.totalObjects ?? Number.NaN),
    trackingDurationMs: Number(extensions.trackingDurationMs ?? Number.NaN),
    speedPxPerSec: Number(extensions.speedPxPerSec ?? Number.NaN),
    trackingIdentityMode: extensions.trackingIdentityMode as
      | DualTrackResolvedIdentityMode
      | undefined,
    trackingLetterAudioEnabled: extensions.trackingLetterAudioEnabled as boolean | undefined,
    trackingTonesEnabled: extensions.trackingTonesEnabled as boolean | undefined,
    motionComplexity: extensions.motionComplexity as 'smooth' | 'standard' | 'agile',
    crowdingMode: extensions.crowdingMode as 'low' | 'standard' | 'dense',
    focusCrossEnabled: extensions.focusCrossEnabled as boolean | undefined,
  });
  const dualTrackTrackingDurationMs = dualTrackResolvedSettings.trackingDurationMs ?? 0;
  const dualTrackSpeedPxPerSec = dualTrackResolvedSettings.speedPxPerSec ?? 0;
  const dualTrackTotalObjectsMode =
    (modeSettings as { totalObjectsMode?: 'auto' | 'manual' }).totalObjectsMode ?? 'auto';
  const dualTrackTotalObjects = dualTrackResolvedSettings.totalObjects ?? 0;
  const dualTrackPositionIdentityEnabled =
    dualTrackResolvedSettings.trackingIdentityMode === 'position';
  const dualTrackColorIdentityEnabled = dualTrackResolvedSettings.trackingIdentityMode === 'color';
  const dualTrackLetterAudioEnabled = dualTrackResolvedSettings.trackingLetterAudioEnabled;
  const dualTrackImageIdentityEnabled = dualTrackResolvedSettings.trackingIdentityMode === 'image';
  const dualTrackSpatialIdentityEnabled =
    dualTrackResolvedSettings.trackingIdentityMode === 'spatial';
  const dualTrackDigitsIdentityEnabled =
    dualTrackResolvedSettings.trackingIdentityMode === 'digits';
  const dualTrackEmotionsIdentityEnabled =
    dualTrackResolvedSettings.trackingIdentityMode === 'emotions';
  const dualTrackWordsIdentityEnabled = dualTrackResolvedSettings.trackingIdentityMode === 'words';
  const dualTrackTonesEnabled = dualTrackResolvedSettings.trackingTonesEnabled;
  const dualTrackMotionComplexity = dualTrackResolvedSettings.motionComplexity;
  const dualTrackCrowdingMode = dualTrackResolvedSettings.crowdingMode;
  const dualTrackFocusCrossEnabled = dualTrackResolvedSettings.focusCrossEnabled;
  const dualTrackCollisionEnabled =
    (modeSettings as { trackingCollisionEnabled?: boolean }).trackingCollisionEnabled !== false;
  const dualTrackRenderMode =
    alphaEnabled && (extensions.renderMode === 'webgl' || extensions.renderMode === 'webgl3d')
      ? extensions.renderMode
      : 'dom';
  const hybridTrackSessionsPerBlock =
    // biome-ignore lint/suspicious/noExplicitAny: legacy strategy config shape
    (activeJourneyStrategyConfig as any)?.trackSessionsPerBlock ??
    // biome-ignore lint/suspicious/noExplicitAny: legacy mode settings shape
    (modeSettings as any)?.hybridTrackSessionsPerBlock ??
    3;
  const hybridDnbSessionsPerBlock =
    // biome-ignore lint/suspicious/noExplicitAny: legacy strategy config shape
    (activeJourneyStrategyConfig as any)?.dnbSessionsPerBlock ??
    // biome-ignore lint/suspicious/noExplicitAny: legacy mode settings shape
    (modeSettings as any)?.hybridDnbSessionsPerBlock ??
    3;
  const updateHybridTrackSessionsPerBlock = (value: number) =>
    setJourneyStrategyConfig(activeJourneyId, {
      hybrid: {
        ...hybridStrategy,
        trackSessionsPerBlock: Math.max(1, Math.round(value)),
      },
    });
  const updateHybridDnbSessionsPerBlock = (value: number) =>
    setJourneyStrategyConfig(activeJourneyId, {
      hybrid: {
        ...hybridStrategy,
        dnbSessionsPerBlock: Math.max(1, Math.round(value)),
      },
    });
  const corsiDirection = ((modeSettings as { corsiDirection?: 'forward' | 'backward' })
    .corsiDirection ??
    ((extensions as { direction?: string }).direction === 'backward' ? 'backward' : 'forward')) as
    | 'forward'
    | 'backward';
  // Timing settings for cognitive tasks
  const pasatStartIsiMs = Math.round(
    (modeSettings as { pasatStartIsiMs?: number }).pasatStartIsiMs ?? 3000,
  );
  const digitDisplayMs = Math.round(
    (modeSettings as { digitDisplayMs?: number }).digitDisplayMs ?? 800,
  );
  const corsiHighlightMs = Math.round(
    (modeSettings as { corsiHighlightMs?: number }).corsiHighlightMs ?? 700,
  );
  const stroopTimeoutMs = Math.round(
    (modeSettings as { stimulusTimeoutMs?: number }).stimulusTimeoutMs ?? 2500,
  );
  const flankerTimeoutMs = Math.round(
    (modeSettings as { stimulusTimeoutMs?: number }).stimulusTimeoutMs ?? 2000,
  );
  const mentalRotationTimeoutMs = Math.round(
    (modeSettings as { timeoutMs?: number }).timeoutMs ?? 8000,
  );
  const symmetrySpanDisplayMs = Math.round(
    (modeSettings as { positionDisplayMs?: number }).positionDisplayMs ?? 1000,
  );
  const arithmeticInterferenceVariant =
    (
      extensions.arithmeticInterference as
        | { variant?: 'simple' | 'color-cue-2step' | 'grid-cue-chain' }
        | undefined
    )?.variant ?? 'simple';
  const setArithmeticInterferenceVariant = (
    variant: 'simple' | 'color-cue-2step' | 'grid-cue-chain',
  ) => setModeSetting('arithmeticInterferenceVariant', variant);
  const legacyTraceUi: {
    traceIsiMs: number;
    traceStimulusDurationMs: number;
    traceFeedbackDurationMs: number;
    traceRuleDisplayMs: number;
    traceIntervalMs: number;
    traceAdaptiveTimingEnabled: boolean;
    traceWritingInputMethod: 'auto' | 'keyboard' | 'handwriting';
  } = useSettingsStore(
    useShallow((s) => ({
      traceIsiMs: s.ui.traceIsiMs,
      traceStimulusDurationMs: s.ui.traceStimulusDurationMs,
      traceFeedbackDurationMs: s.ui.traceFeedbackDurationMs,
      traceRuleDisplayMs: s.ui.traceRuleDisplayMs,
      traceIntervalMs: s.ui.traceIntervalMs,
      traceAdaptiveTimingEnabled: s.ui.traceAdaptiveTimingEnabled,
      traceWritingInputMethod: s.ui.traceWritingInputMethod,
    })),
  );
  const scopedModeSettings = modeSettings as Record<string, unknown>;
  const traceIsiMs =
    (scopedModeSettings['traceIsiMs'] as number | undefined) ?? legacyTraceUi.traceIsiMs;
  const traceStimulusDurationMs =
    (scopedModeSettings['traceStimulusDurationMs'] as number | undefined) ??
    legacyTraceUi.traceStimulusDurationMs;
  const traceFeedbackDurationMs =
    (scopedModeSettings['traceFeedbackDurationMs'] as number | undefined) ??
    legacyTraceUi.traceFeedbackDurationMs;
  const traceRuleDisplayMs =
    (scopedModeSettings['traceRuleDisplayMs'] as number | undefined) ??
    legacyTraceUi.traceRuleDisplayMs;
  const traceIntervalMs =
    (scopedModeSettings['traceIntervalMs'] as number | undefined) ?? legacyTraceUi.traceIntervalMs;
  const traceAdaptiveTimingEnabled =
    (scopedModeSettings['traceAdaptiveTimingEnabled'] as boolean | undefined) ??
    legacyTraceUi.traceAdaptiveTimingEnabled;
  const traceWritingInputMethod =
    (scopedModeSettings['traceWritingInputMethod'] as
      | 'auto'
      | 'keyboard'
      | 'handwriting'
      | undefined) ?? legacyTraceUi.traceWritingInputMethod;
  const setTraceIsiMs = (value: number) =>
    setModeSetting('traceIsiMs', Math.max(1500, Math.min(10000, value)));
  const setTraceStimulusDurationMs = (value: number) =>
    setModeSetting('traceStimulusDurationMs', Math.max(200, Math.min(5000, value)));
  const setTraceFeedbackDurationMs = (value: number) =>
    setModeSetting('traceFeedbackDurationMs', Math.max(200, Math.min(3000, value)));
  const setTraceRuleDisplayMs = (value: number) =>
    setModeSetting('traceRuleDisplayMs', Math.max(200, Math.min(3000, value)));
  const setTraceIntervalMs = (value: number) =>
    setModeSetting('traceIntervalMs', Math.max(0, Math.min(2000, value)));
  const setTraceAdaptiveTimingEnabled = (enabled: boolean) =>
    setModeSetting('traceAdaptiveTimingEnabled', enabled);
  const setTraceWritingInputMethod = (value: 'auto' | 'keyboard' | 'handwriting') =>
    setModeSetting('traceWritingInputMethod', value);

  // Computed values
  const nLevel = resolvedMode.spec.defaults.nLevel;
  const trialsCount = resolvedMode.spec.defaults.trialsCount;
  const progressionAlgorithm = isProgressionAlgorithmId(resolvedMode.algorithmName)
    ? resolvedMode.algorithmName
    : 'adaptive';
  const activeModalities = resolvedMode.spec.defaults.activeModalities as ModalityId[];
  const rhythmMode = extensions.rhythmMode;

  // Custom mode config (tempo params + generation probabilities)
  // resolveWithSettings() fournit ces valeurs depuis spec.timing/generation
  const intervalSeconds = resolvedMode.spec.timing.intervalMs / 1000;
  const stimulusDurationSeconds = resolvedMode.spec.timing.stimulusDurationMs / 1000;
  const targetProbability = resolvedMode.spec.generation.targetProbability;
  const lureProbability = resolvedMode.spec.generation.lureProbability ?? 0;

  // Mode helpers
  const canConfigure = (key: ConfigurableSettingKey) => configurableSettings.includes(key);
  const isAuto = mode === 'dualnback-classic';
  // Dead game modes (removed from GameMode union) — always false
  const isDualMemo = false as boolean;
  const isDualPlace = false as boolean;
  const isDualPick = false as boolean;
  const isDualTrace = false as boolean;
  const isDualTime = false as boolean;
  const isDualTrack = false as boolean;
  const isUfov = mode === 'ufov';
  const isTower = mode === 'tower';
  const isGridlock = mode === 'gridlock';
  const isCorsiBlock = false as boolean; // dead mode
  const isDigitSpan = mode === 'digit-span';
  const isMemoryMatch = mode === 'memory-match';
  const isLightsOut = mode === 'lights-out';
  const isStroop = mode === 'stroop';
  const isStroopFlex = mode === 'stroop-flex';
  const isFlanker = mode === 'flanker';
  const isGoNoGo = mode === 'go-nogo';
  const isStopSignal = mode === 'stop-signal';
  const isAntisaccade = mode === 'antisaccade';
  const isSimon = mode === 'simon';
  const isAnt = mode === 'ant';
  const isWcst = mode === 'wcst';
  const isPasat = false as boolean; // dead mode
  const isMentalRotation = mode === 'mental-rotation';
  const isVisualSearch = mode === 'visual-search';
  const isTangram = mode === 'tangram';
  const isMirror = mode === 'mirror';
  const isSpotDiff = mode === 'spot-diff';
  const isSymmetrySpan = mode === 'symmetry-span';
  const isReflex = mode === 'reflex';
  const isTaskSwitching = mode === 'task-switching';
  const isCustom = mode === 'custom';
  const isDualnbackClassic = mode === 'dualnback-classic';
  const isBrainWorkshop = mode === 'sim-brainworkshop';
  const isSimulator = isDualnbackClassic || isBrainWorkshop;
  const lockJourneyControlledLevel = isJourneyScope && (isSimulator || isDualTrack);
  const isHybridJourneyScope =
    isJourneyScope && isDualTrack && activeJourneyGameMode === 'dual-track-dnb-hybrid';
  const journeyHasProgress =
    journeyState?.currentStage > 1 ||
    journeyState?.stages?.some(
      // biome-ignore lint/suspicious/noExplicitAny: JourneyState stage shape
      (s: any) =>
        s.validatingSessions > 0 ||
        s.bestScore !== null ||
        (typeof s.progressPct === 'number' && s.progressPct > 0),
    ) ||
    false;
  const lockModalities = isJourneyScope && journeyHasProgress;
  const preserveJourneyPresetKeys =
    lockModalities && isBrainWorkshop
      ? (['activeModalities', 'multiStimulus', 'multiMode', 'multiAudio'] as const)
      : undefined;
  // BrainWorkshop supports color (triple n-back), Dual N-Back Classic doesn't
  const hideColorModality = isDualnbackClassic || isDualMemo || isDualPlace || isDualPick;
  // Image and Arithmetic are Brain Workshop specific modalities
  const hideImageModality = !isBrainWorkshop;
  const hideArithmeticModality = !isBrainWorkshop;
  const mainSectionTitle = isBrainWorkshop
    ? t('settings.brainworkshop.sessionBase')
    : isDualTrack
      ? t('settings.dualTrack.tabBase', 'Base')
      : t('settings.config.main');
  const dualTrackAutoCalibrationSummary = t('settings.dualTrack.autoCalibration', {
    targets: nLevel,
    totalObjects: dualTrackResolvedSettings.totalObjects ?? 0,
    trials: trialsCount,
    trackingSeconds: Math.round(dualTrackTrackingDurationMs / 1000),
    defaultValue:
      '{{targets}} targets -> {{totalObjects}} balls total, {{trials}} trials, {{trackingSeconds}} s tracking.',
  });
  const brainWorkshopDurationMode =
    isBrainWorkshop && modeSettings.trialsCountMode === 'manual' ? 'manual' : 'auto';
  const brainWorkshopUsesManualDuration = isBrainWorkshop && brainWorkshopDurationMode === 'manual';
  const sessionDurationMin = isTower || isGridlock ? 4 : isUfov ? 18 : 5;
  const sessionDurationMax =
    isTower || isGridlock
      ? 24
      : isUfov
        ? 72
        : isMemoryMatch || isLightsOut || isTangram || isMirror || isSpotDiff
          ? 20
          : isStroop ||
              isStroopFlex ||
              isFlanker ||
              isGoNoGo ||
              isStopSignal ||
              isAntisaccade ||
              isSimon ||
              isAnt ||
              isVisualSearch
            ? 160
            : isWcst || isPasat || isMentalRotation
              ? 60
              : isBrainWorkshop
                ? 240
                : 100;
  const sanitizedTrialsCount = Number.isFinite(trialsCount)
    ? Math.max(sessionDurationMin, Math.round(trialsCount))
    : sessionDurationMin;
  const estimatedBrainWorkshopTrials = isBrainWorkshop
    ? (() => {
        const safeNLevel = Number.isFinite(nLevel) ? Math.max(1, Math.round(nLevel)) : 1;
        const safeBase = Number.isFinite(trialsBase) ? trialsBase : 20;
        const safeFactor = Number.isFinite(trialsFactor) ? trialsFactor : 1;
        const safeExponent = Number.isFinite(trialsExponent) ? trialsExponent : 2;
        const computed = Math.round(
          Math.max(1, safeBase + safeFactor * safeNLevel ** safeExponent),
        );
        return Number.isFinite(computed) ? computed : null;
      })()
    : null;
  const displayAutoBrainWorkshopTrials = estimatedBrainWorkshopTrials ?? sanitizedTrialsCount;
  const sessionDurationOptions = useMemo(() => {
    const options = new Set<number>();
    const step = isTower || isGridlock ? 2 : 5;
    for (let count = sessionDurationMin; count <= sessionDurationMax; count += step) {
      options.add(count);
    }
    options.add(sanitizedTrialsCount);
    return Array.from(options).sort((a, b) => a - b);
  }, [isTower, sanitizedTrialsCount, sessionDurationMin, sessionDurationMax]);
  const towerChallengeMode =
    (
      modeSettings as {
        towerChallengeMode?: 'mixed' | 'classic' | 'precision' | 'memory' | 'expert';
      }
    ).towerChallengeMode ?? 'mixed';
  const towerDiscCount = (modeSettings as { towerDiscCount?: 3 | 4 | 5 }).towerDiscCount ?? 3;
  const gridlockProfileId =
    (modeSettings as { gridlockProfileId?: 'rookie' | 'standard' | 'expert' }).gridlockProfileId ??
    'rookie';
  const gridlockSessionVariant =
    (
      modeSettings as {
        gridlockSessionVariant?: 'mixed' | 'classic' | 'precision' | 'memory' | 'timed';
      }
    ).gridlockSessionVariant ?? 'mixed';
  const gridlockTimeLimitMs =
    (modeSettings as { gridlockTimeLimitMs?: number }).gridlockTimeLimitMs ?? 120000;
  const gridlockDifficultyLock =
    (modeSettings as { gridlockDifficultyLock?: string }).gridlockDifficultyLock ?? 'auto';
  const gridlockAssistance =
    (modeSettings as { gridlockAssistance?: string }).gridlockAssistance ?? 'balanced';
  const gridlockShowMoveCounter =
    (modeSettings as { gridlockShowMoveCounter?: boolean }).gridlockShowMoveCounter ?? true;
  const gridlockShowOptimal =
    (modeSettings as { gridlockShowOptimal?: boolean }).gridlockShowOptimal ?? true;
  const gridlockPreviewDuration =
    (modeSettings as { gridlockPreviewDuration?: string }).gridlockPreviewDuration ?? 'auto';
  const gridlockAutoAdvance =
    (modeSettings as { gridlockAutoAdvance?: boolean }).gridlockAutoAdvance ?? true;
  const gridlockShowSolutionOnFail =
    (modeSettings as { gridlockShowSolutionOnFail?: boolean }).gridlockShowSolutionOnFail ?? true;
  const ufovVariant =
    (modeSettings as { ufovVariant?: 'full' | 'central' | 'divided' | 'selective' }).ufovVariant ??
    'full';
  const ufovInitialDisplayMs =
    (modeSettings as { ufovInitialDisplayMs?: number }).ufovInitialDisplayMs ?? 500;
  const ufovDistractorCount =
    (modeSettings as { ufovDistractorCount?: number }).ufovDistractorCount ?? 6;
  const ufovPeripheralRadiusMode =
    (
      modeSettings as {
        ufovPeripheralRadiusMode?: 'near' | 'standard' | 'wide';
      }
    ).ufovPeripheralRadiusMode ?? 'standard';
  const brainWorkshopHasArithmetic = activeModalities.includes('arithmetic');
  const brainWorkshopHasCombination =
    activeModalities.includes('visvis') ||
    activeModalities.includes('visaudio') ||
    activeModalities.includes('audiovis');
  const brainWorkshopHasColorAndImage =
    activeModalities.includes('color') && activeModalities.includes('image');
  const forbidsBrainWorkshopMultiStimulus =
    brainWorkshopHasArithmetic || brainWorkshopHasCombination || brainWorkshopHasColorAndImage;
  const forbidsBrainWorkshopMultiAudio = brainWorkshopHasArithmetic || brainWorkshopHasCombination;

  const hasTempoTab = !isBrainWorkshop && (isDualTrack || isDualTrace || isCustom);
  const hasGeneratorTab = !isBrainWorkshop && (isDualPlace || isDualPick || isCustom);
  const hasAdvancedTab =
    !isBrainWorkshop &&
    (isGridlock ||
      (alphaEnabled && (isAuto || isDualMemo || isDualPlace || isDualPick)) ||
      isDualMemo ||
      isDualPlace ||
      isDualTrace);

  const availableModeTabs = useMemo(() => {
    const tabs: Array<'base' | 'tempo' | 'generator' | 'advanced'> = ['base'];
    if (hasTempoTab) tabs.push('tempo');
    if (hasGeneratorTab) tabs.push('generator');
    if (hasAdvancedTab) tabs.push('advanced');
    return tabs;
  }, [hasAdvancedTab, hasGeneratorTab, hasTempoTab]);

  // Reset tabs to default when mode changes; clamp to valid tab when available tabs change.
  // Merged from three separate effects to avoid cascading setState calls.
  useEffect(() => {
    if (isBrainWorkshop) {
      setBrainWorkshopTab('essentials');
    } else {
      setModeSettingsTab((prev) => {
        if (!availableModeTabs.includes(prev)) return availableModeTabs[0] ?? 'base';
        return 'base';
      });
    }
  }, [mode, isBrainWorkshop, availableModeTabs]);

  const forcedBwTab = forcedTab ? (forcedTab === 'base' ? 'essentials' : forcedTab) : undefined;
  const activeBwTab = forcedBwTab ?? brainWorkshopTab;
  const activeModeTab = forcedTab ?? modeSettingsTab;
  const hideTabs = Boolean(forcedTab);

  // Mode colors
  const modeColors = MODE_COLORS[mode] ?? {
    bg: 'bg-slate-50 dark:bg-slate-500/10',
    border: 'border-slate-200 dark:border-slate-500/30',
    text: 'text-slate-700 dark:text-slate-300',
    textLight: 'text-slate-600 dark:text-slate-400',
  };

  // Setters
  const setNLevel = (v: number) => setModeSetting('nLevel', v);
  const setCorsiDirection = (v: 'forward' | 'backward') => setModeSetting('corsiDirection', v);
  const setTrialsCount = (v: number) =>
    setModeSetting('trialsCount', Math.max(sessionDurationMin, Math.round(v)));
  const setProgressionAlgorithm = (v: ProgressionAlgorithmId) => setModeSetting('algorithm', v);
  const setRhythmMode = (v: 'self-paced' | 'timed') => setModeSetting('rhythmMode', v);

  const enforcedBrainWorkshopModalitiesCount = (() => {
    if (!isBrainWorkshop) return null;
    const activePresetId = isJourneyScope ? journeyActivePresetId : freeTrainingActivePresetId;
    if (activePresetId === FREE_TRAINING_RECOMMENDED_PRESET_ID) return 2;
    if (activePresetId === FREE_TRAINING_TRI_PRESET_ID) return 3;
    if (activePresetId === FREE_TRAINING_QUAD_PRESET_ID) return 4;
    return null;
  })();
  const isBrainWorkshopComboEnforced = enforcedBrainWorkshopModalitiesCount !== null;

  const BW_COMBINATION_GROUP: ModalityId[] = ['visvis', 'visaudio', 'audiovis'];

  const toggleModality = (m: ModalityId) => {
    if (interactionsLocked) return;
    const current = activeModalities;

    if (isBrainWorkshopComboEnforced) {
      const allowed = new Set<ModalityId>(BRAINWORKSHOP_COMBO_MODALITIES);
      if (!allowed.has(m)) return;

      // Enforce exact-size combinations for BW built-in presets:
      // - Dual N-Back: exactly 2 modalities
      // - Tri N-Back: exactly 3 modalities
      // - Quad N-Back: exactly 4 modalities
      //
      // Interaction model:
      // - Clicking an active modality doesn't remove it (would break the count),
      //   but moves it to the end so the user can "protect" it from replacement.
      // - Clicking an inactive modality replaces the oldest (first) modality when at the limit.
      const currentAllowed = current.filter((x) => allowed.has(x));
      const targetCount = enforcedBrainWorkshopModalitiesCount ?? 2;

      if (currentAllowed.includes(m)) {
        setModeSetting('activeModalities', [...currentAllowed.filter((x) => x !== m), m]);
        return;
      }

      if (currentAllowed.length < targetCount) {
        setModeSetting('activeModalities', [...currentAllowed, m]);
        return;
      }

      setModeSetting('activeModalities', [...currentAllowed.slice(1), m]);
      return;
    }

    // Modalités combinées BW : toujours togglées en groupe
    if (BW_COMBINATION_GROUP.includes(m)) {
      const hasAnyCombo = BW_COMBINATION_GROUP.some((c) => current.includes(c));
      if (hasAnyCombo) {
        // Désactiver tout le groupe (garder audio — l'utilisateur peut l'avoir voulu)
        setModeSetting(
          'activeModalities',
          current.filter((x) => !BW_COMBINATION_GROUP.includes(x)),
        );
      } else {
        // Activer tout le groupe + forcer audio
        const withoutCombo = current.filter((x) => !BW_COMBINATION_GROUP.includes(x));
        const withAudio = withoutCombo.includes('audio')
          ? withoutCombo
          : [...withoutCombo, 'audio'];
        setModeSetting('activeModalities', [...withAudio, ...BW_COMBINATION_GROUP]);
      }
      return;
    }

    if (current.includes(m)) {
      if (current.length > 1) {
        setModeSetting(
          'activeModalities',
          current.filter((x) => x !== m),
        );
      }
      return;
    }

    setModeSetting('activeModalities', [...current, m]);
  };

  // Normalize BW modalities when a built-in BW preset is selected, so we always
  // end up with a valid 2/3/4-modality combination among position/audio/color/image.
  // useEffectEvent keeps the normalization body out of the dep array so the effect
  // only re-fires when enforcedBrainWorkshopModalitiesCount actually changes.
  const normalizeBwModalities = useEffectEvent(() => {
    if (!isBrainWorkshopComboEnforced) return;
    if (interactionsLocked) return;

    const allowed = new Set<ModalityId>(BRAINWORKSHOP_COMBO_MODALITIES);
    const targetCount = enforcedBrainWorkshopModalitiesCount ?? 2;
    const currentAllowed = activeModalities.filter((x) => allowed.has(x));
    const next: ModalityId[] = [...currentAllowed.slice(0, targetCount)];
    for (const m of BRAINWORKSHOP_COMBO_MODALITIES) {
      if (next.length >= targetCount) break;
      if (!next.includes(m)) next.push(m);
    }

    const isSameLength = next.length === activeModalities.length;
    const isSameOrder = isSameLength && next.every((m, i) => activeModalities[i] === m);
    if (isSameOrder) return;

    setModeSetting('activeModalities', next);
  });

  useEffect(() => {
    normalizeBwModalities();
  }, [enforcedBrainWorkshopModalitiesCount]);

  return (
    <>
      <UpgradeDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        source="mode_settings"
      />
      {isBrainWorkshop ? (
        <div
          className={cn(
            'surface-card-typography bg-card border border-border/50 rounded-2xl overflow-hidden mt-2',
            interactionsLocked && 'pointer-events-none opacity-80',
          )}
        >
          <Tabs
            value={activeBwTab}
            onValueChange={
              hideTabs
                ? undefined
                : (v) => setBrainWorkshopTab(v as 'essentials' | 'tempo' | 'generator' | 'advanced')
            }
            className="w-full"
          >
            {!hideTabs ? (
              <>
                <TabsList className="w-full rounded-none border-0 bg-transparent p-2">
                  <TabsTrigger value="essentials" className="flex-1 rounded-xl font-semibold">
                    {t('settings.brainworkshop.sessionBase')}
                  </TabsTrigger>
                  <TabsTrigger value="tempo" className="flex-1 rounded-xl font-semibold">
                    {t('settings.brainworkshop.tempo')}
                  </TabsTrigger>
                  <TabsTrigger value="generator" className="flex-1 rounded-xl font-semibold">
                    {t('settings.brainworkshop.generator')}
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="flex-1 rounded-xl font-semibold">
                    {t('settings.config.advanced')}
                  </TabsTrigger>
                </TabsList>

                <div className="w-full h-px bg-border/20" />
              </>
            ) : null}

            <TabsContent value="essentials" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
              {activeBwTab === 'essentials' ? (
                <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-4'}>
                  {showPresets && (
                    <SettingBlock hideTabs={hideTabs}>
                      {isJourneyScope ? (
                        <JourneyPresetSelector
                          journeyId={activeJourneyId}
                          mode={mode}
                          locked={lockModalities}
                          preserveKeys={preserveJourneyPresetKeys}
                        />
                      ) : (
                        <FreeTrainingPresetSelector
                          mode={mode}
                          onPresetApplied={() => {
                            setBrainWorkshopTab('essentials');
                          }}
                        />
                      )}
                    </SettingBlock>
                  )}
                  <SettingBlock hideTabs={hideTabs}>
                    <NLevelSelect
                      value={
                        isSimulator && maxAchievedLevelForMode !== null
                          ? Math.max(maxAchievedLevelForMode, nLevel)
                          : nLevel
                      }
                      onChange={setNLevel}
                      disabled={!canConfigure('nLevel') || (isJourneyScope && isSimulator)}
                      onUpgradeClick={() => setShowUpgradeDialog(true)}
                      labelKey={
                        isSimulator ? 'settings.config.currentNLevel' : 'settings.config.nLevel'
                      }
                      descriptionKey="settings.config.nLevelDesc"
                      minLevel={isDualTrace ? 0 : 1}
                    />
                  </SettingBlock>

                  {canConfigure('activeModalities') && (
                    <SettingBlock hideTabs={hideTabs}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {t('settings.config.modalities')}
                          </div>
                          <span className="shrink-0">
                            <InfoSheet iconSize={12}>
                              {isBrainWorkshopComboEnforced
                                ? t(
                                    'settings.brainworkshop.modalitiesComboHint',
                                    'This profile requires exactly {{count}} active modalities.',
                                    { count: enforcedBrainWorkshopModalitiesCount ?? 2 },
                                  )
                                : t('stats.tooltips.modalitiesDesc')}
                            </InfoSheet>
                          </span>
                        </div>
                        <ModalityMixer
                          activeModalities={activeModalities}
                          onToggle={toggleModality}
                          disabled={!canConfigure('activeModalities') || lockModalities}
                          linkedGroupIds={
                            !isBrainWorkshopComboEnforced ? BW_COMBINATION_GROUP : undefined
                          }
                          hiddenModalities={[
                            ...(hideColorModality ? ['color'] : []),
                            ...(hideImageModality ? ['image'] : []),
                            ...(isBrainWorkshopComboEnforced ? ['arithmetic'] : []),
                            ...(!isBrainWorkshop || isBrainWorkshopComboEnforced
                              ? ['visvis', 'visaudio', 'audiovis']
                              : []),
                          ]}
                        />
                        {!isBrainWorkshopComboEnforced && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('settings.brainworkshop.combinationGroupHint')}
                          </p>
                        )}
                      </div>
                    </SettingBlock>
                  )}

                  {(canConfigure('trialsCount') || isBrainWorkshop) && (
                    <SettingBlock hideTabs={hideTabs}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {t('settings.config.sessionDuration')}
                          </p>
                          <span className="shrink-0">
                            <InfoSheet iconSize={12}>
                              {!brainWorkshopUsesManualDuration
                                ? t('settings.brainworkshop.sessionDurationAuto')
                                : t('settings.config.sessionDurationDesc')}
                            </InfoSheet>
                          </span>
                        </div>

                        <div className="grid grid-cols-[1.2fr_1fr] gap-2">
                          <Select
                            value={brainWorkshopDurationMode}
                            onValueChange={(value) => {
                              const nextMode = value === 'manual' ? 'manual' : 'auto';
                              if (nextMode === 'manual') {
                                const suggested = Math.max(
                                  sessionDurationMin,
                                  displayAutoBrainWorkshopTrials,
                                );
                                setModeSettingFor(mode, 'trialsCount', suggested);
                              }
                              setModeSettingFor(mode, 'trialsCountMode', nextMode);
                            }}
                          >
                            <SelectTrigger className="h-11 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">
                                {t('settings.brainworkshop.sessionDurationModeAuto')}
                              </SelectItem>
                              <SelectItem value="manual">
                                {t('settings.brainworkshop.sessionDurationModeManual')}
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          {brainWorkshopUsesManualDuration && canConfigure('trialsCount') ? (
                            <Select
                              value={String(trialsCount)}
                              onValueChange={(v) =>
                                setTrialsCount(Math.max(sessionDurationMin, Number(v)))
                              }
                            >
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {sessionDurationOptions.map((count) => (
                                  <SelectItem key={count} value={String(count)}>
                                    {count} {t('settings.config.trials')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-foreground">
                              {displayAutoBrainWorkshopTrials} {t('settings.config.trials')}
                            </div>
                          )}
                        </div>
                      </div>
                    </SettingBlock>
                  )}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="tempo" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
              {activeBwTab === 'tempo' ? (
                <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.custom.interval')}
                      labelRight={
                        <InfoSheet iconSize={12}>{t('settings.custom.intervalHint')}</InfoSheet>
                      }
                      value={intervalSeconds}
                      onChange={(v) => {
                        setModeSetting('intervalSeconds', v);
                        if (stimulusDurationSeconds > v) {
                          setModeSetting('stimulusDurationSeconds', v);
                        }
                      }}
                      min={0.5}
                      max={5}
                      step={0.1}
                      suffix="s"
                      colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      trackClass="bg-slate-200 dark:bg-slate-500/30"
                      accentClass="accent-slate-500"
                    />
                  </SettingBlock>

                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.custom.stimulusDuration')}
                      labelRight={
                        <InfoSheet iconSize={12}>
                          {t(
                            'settings.custom.stimulusDurationHint',
                            'Display duration of each stimulus',
                          )}
                        </InfoSheet>
                      }
                      value={stimulusDurationSeconds}
                      onChange={(v) =>
                        setModeSetting('stimulusDurationSeconds', Math.min(v, intervalSeconds))
                      }
                      min={0.2}
                      max={3}
                      step={0.1}
                      suffix="s"
                      colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      trackClass="bg-slate-200 dark:bg-slate-500/30"
                      accentClass="accent-slate-500"
                    />
                  </SettingBlock>

                  <SettingBlock hideTabs={hideTabs}>
                    <Toggle
                      label={t('settings.brainworkshop.selfPaced')}
                      labelRight={
                        <InfoSheet iconSize={12}>
                          {t(
                            'settings.brainworkshop.selfPacedDesc',
                            'Advance manually (Enter) instead of timer',
                          )}
                        </InfoSheet>
                      }
                      checked={selfPaced}
                      onChange={(enabled) => setModeSettingFor(mode, 'selfPaced', enabled)}
                      activeColor="audio"
                    />
                  </SettingBlock>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="generator" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
              {activeBwTab === 'generator' ? (
                <div className={hideTabs ? 'space-y-0' : 'space-y-4'}>
                  <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                    <SettingBlock hideTabs={hideTabs}>
                      <EditableSlider
                        label={t('settings.brainworkshop.guaranteedMatch')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.guaranteedMatchHint',
                              'Force a correct match (stage 1, 12.5% by default)',
                            )}
                          </InfoSheet>
                        }
                        value={Number((guaranteedMatchProbability * 100).toFixed(2))}
                        onChange={(v) =>
                          setModeSettingFor(mode, 'guaranteedMatchProbability', v / 100)
                        }
                        min={0}
                        max={100}
                        step={12.5}
                        suffix="%"
                        colorClass="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        trackClass="bg-emerald-200 dark:bg-emerald-500/30"
                        accentClass="accent-emerald-500"
                      />
                    </SettingBlock>

                    <SettingBlock hideTabs={hideTabs}>
                      <EditableSlider
                        label={t('settings.brainworkshop.interference')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.interferenceHint',
                              'Near-miss stimuli (stage 2, 12.5% by default)',
                            )}
                          </InfoSheet>
                        }
                        value={Number((interferenceProbability * 100).toFixed(2))}
                        onChange={(v) =>
                          setModeSettingFor(mode, 'interferenceProbability', v / 100)
                        }
                        min={0}
                        max={100}
                        step={12.5}
                        suffix="%"
                        colorClass="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        trackClass="bg-amber-200 dark:bg-amber-500/30"
                        accentClass="accent-amber-500"
                      />
                    </SettingBlock>

                    <SettingBlock hideTabs={hideTabs}>
                      <Toggle
                        label={t('settings.brainworkshop.variableNBack')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.variableNBackDesc',
                              'Le N varie pendant la session (distribution beta)',
                            )}
                          </InfoSheet>
                        }
                        checked={variableNBack}
                        onChange={(enabled) => setModeSettingFor(mode, 'variableNBack', enabled)}
                        activeColor="visual"
                      />
                    </SettingBlock>

                    <SettingBlock hideTabs={hideTabs}>
                      <Toggle
                        label={t('settings.brainworkshop.crabBack')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.crabBackDesc',
                              'Le N oscille: 1-3-5-1-3-5... (pour 3-back)',
                            )}
                          </InfoSheet>
                        }
                        checked={crabBackMode}
                        onChange={(enabled) => setModeSettingFor(mode, 'crabBackMode', enabled)}
                        activeColor="audio"
                      />
                    </SettingBlock>
                  </div>

                  <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                    {/* Reuse existing BW multi-stimulus section structure */}
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.brainworkshop.multiStimulus')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.multiStimulusDesc',
                              'Number of simultaneous positions (1-4)',
                            )}
                          </InfoSheet>
                        }
                      >
                        <Select
                          value={String(multiStimulus)}
                          onValueChange={(v) =>
                            setModeSettingFor(mode, 'multiStimulus', Number(v) as 1 | 2 | 3 | 4)
                          }
                          disabled={forbidsBrainWorkshopMultiStimulus || lockModalities}
                        >
                          <SelectTrigger
                            className={`w-16 h-10 ${
                              forbidsBrainWorkshopMultiStimulus || lockModalities
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map((c) => (
                              <SelectItem key={c} value={String(c)}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </SettingRow>
                      {forbidsBrainWorkshopMultiStimulus && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          {brainWorkshopHasArithmetic
                            ? t(
                                'settings.brainworkshop.multiStimulusArithmeticDisabled',
                                'Multi-stimulus disabled: incompatible with arithmetic (BW protocol).',
                              )
                            : brainWorkshopHasCombination
                              ? t(
                                  'settings.brainworkshop.multiStimulusCombinationDisabled',
                                  'Multi-stimulus disabled: incompatible with combined modes (BW protocol).',
                                )
                              : t(
                                  'settings.brainworkshop.multiStimulusColorImageDisabled',
                                  'Multi-stimulus disabled: incompatible with Color + Image together (BW protocol).',
                                )}
                        </p>
                      )}
                      {!forbidsBrainWorkshopMultiStimulus &&
                        multiStimulus > 1 &&
                        !activeModalities.includes('color') &&
                        !activeModalities.includes('image') && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t(
                              'settings.brainworkshop.multiStimulusHint',
                              'Tip: to get Vis. buttons (G/H/J/K) like Brain Workshop, enable Color or Image in modalities. In multi-stimulus, they will be replaced by Vis. 1–4.',
                            )}
                          </p>
                        )}
                    </SettingBlock>

                    {multiStimulus > 1 && (
                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.brainworkshop.multiMode')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.brainworkshop.multiModeDesc',
                                'Comment distinguer les stimuli multiples',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={multiMode}
                            onValueChange={(v) =>
                              setModeSettingFor(mode, 'multiMode', v as 'color' | 'image')
                            }
                            disabled={lockModalities}
                          >
                            <SelectTrigger className="w-24 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="color">
                                {t('settings.brainworkshop.multiModeColor')}
                              </SelectItem>
                              <SelectItem value="image">
                                {t('settings.brainworkshop.multiModeImage')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>
                    )}

                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.brainworkshop.multiAudio')}
                        labelRight={
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.multiAudioDesc',
                              'Number of simultaneous sounds (1-2)',
                            )}
                          </InfoSheet>
                        }
                      >
                        <Select
                          value={String(multiAudio)}
                          onValueChange={(v) =>
                            setModeSettingFor(mode, 'multiAudio', Number(v) as 1 | 2)
                          }
                          disabled={forbidsBrainWorkshopMultiAudio || lockModalities}
                        >
                          <SelectTrigger
                            className={`w-16 h-10 ${
                              forbidsBrainWorkshopMultiAudio || lockModalities
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2].map((c) => (
                              <SelectItem key={c} value={String(c)}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </SettingRow>
                      {forbidsBrainWorkshopMultiAudio && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          {brainWorkshopHasArithmetic
                            ? t(
                                'settings.brainworkshop.multiAudioArithmeticDisabled',
                                'Multi-audio disabled: incompatible with arithmetic (BW protocol).',
                              )
                            : t(
                                'settings.brainworkshop.multiAudioCombinationDisabled',
                                'Multi-audio disabled: incompatible with combined modes (BW protocol).',
                              )}
                        </p>
                      )}
                    </SettingBlock>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="advanced" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
              {activeBwTab === 'advanced' ? (
                <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.brainworkshop.trialsBase')}
                      labelRight={
                        <InfoSheet iconSize={12}>
                          {t(
                            'settings.brainworkshop.trialsBaseHint',
                            'Base count before adding N² (default: 20)',
                          )}
                        </InfoSheet>
                      }
                      value={trialsBase}
                      onChange={(v) => setModeSettingFor(mode, 'trialsBase', v)}
                      min={10}
                      max={50}
                      step={5}
                      colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      trackClass="bg-slate-200 dark:bg-slate-500/30"
                      accentClass="accent-slate-500"
                    />
                  </SettingBlock>

                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.brainworkshop.trialsFactor')}
                      labelRight={
                        <InfoSheet iconSize={12}>
                          {t(
                            'settings.brainworkshop.trialsFactorHint',
                            'N^exponent multiplier (default: 1)',
                          )}
                        </InfoSheet>
                      }
                      value={trialsFactor}
                      onChange={(v) => setModeSettingFor(mode, 'trialsFactor', v)}
                      min={0}
                      max={3}
                      step={0.5}
                      colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      trackClass="bg-slate-200 dark:bg-slate-500/30"
                      accentClass="accent-slate-500"
                    />
                  </SettingBlock>

                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.brainworkshop.trialsExponent')}
                      labelRight={
                        <InfoSheet iconSize={12}>
                          {t(
                            'settings.brainworkshop.trialsExponentHint',
                            'Power of N (default: 2 → N²)',
                          )}
                        </InfoSheet>
                      }
                      value={trialsExponent}
                      onChange={(v) => setModeSettingFor(mode, 'trialsExponent', v)}
                      min={1}
                      max={3}
                      step={0.5}
                      colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      trackClass="bg-slate-200 dark:bg-slate-500/30"
                      accentClass="accent-slate-500"
                    />
                  </SettingBlock>

                  <SettingBlock hideTabs={hideTabs}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                          {t('settings.brainworkshop.arithmeticDifficulty')}
                        </p>
                        <span className="shrink-0">
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.arithmeticDifficultyDesc',
                              'Choose the allowed operations in calculations.',
                            )}
                          </InfoSheet>
                        </span>
                      </div>

                      <Select
                        value={String(arithmeticDifficulty)}
                        onValueChange={(v) => {
                          const parsed = Number(v);
                          const next =
                            Number.isFinite(parsed) && parsed >= 1 && parsed <= 4
                              ? (parsed as 1 | 2 | 3 | 4)
                              : 4;
                          setModeSettingFor(mode, 'arithmeticDifficulty', next);
                        }}
                      >
                        <SelectTrigger className="w-full h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">
                            {t('settings.brainworkshop.arithmeticLevel1')}
                          </SelectItem>
                          <SelectItem value="2">
                            {t('settings.brainworkshop.arithmeticLevel2')}
                          </SelectItem>
                          <SelectItem value="3">
                            {t('settings.brainworkshop.arithmeticLevel3')}
                          </SelectItem>
                          <SelectItem value="4">
                            {t('settings.brainworkshop.arithmeticLevel4')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </SettingBlock>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {!isBrainWorkshop && (
        <div
          className={cn(
            'surface-card-typography bg-card border border-border/50 rounded-2xl overflow-hidden mt-2',
            interactionsLocked && 'pointer-events-none opacity-80',
          )}
        >
          <Tabs
            value={activeModeTab}
            onValueChange={
              hideTabs
                ? undefined
                : (v) => setModeSettingsTab(v as 'base' | 'tempo' | 'generator' | 'advanced')
            }
            className="w-full"
          >
            {!hideTabs ? (
              <>
                <TabsList className="w-full rounded-none border-0 bg-transparent p-2">
                  <TabsTrigger value="base" className="flex-1 rounded-xl font-semibold">
                    {mainSectionTitle}
                  </TabsTrigger>
                  {hasTempoTab && (
                    <TabsTrigger value="tempo" className="flex-1 rounded-xl font-semibold">
                      {isDualTrack
                        ? t('settings.dualTrack.tabMotion', 'Motion')
                        : t('settings.brainworkshop.tempo')}
                    </TabsTrigger>
                  )}
                  {hasGeneratorTab && (
                    <TabsTrigger value="generator" className="flex-1 rounded-xl font-semibold">
                      {t('settings.brainworkshop.generator')}
                    </TabsTrigger>
                  )}
                  {hasAdvancedTab && (
                    <TabsTrigger value="advanced" className="flex-1 rounded-xl font-semibold">
                      {t('settings.config.advanced')}
                    </TabsTrigger>
                  )}
                </TabsList>

                <div className="w-full h-px bg-border/20" />
              </>
            ) : null}

            <TabsContent value="base" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
              {activeModeTab === 'base' && isDualTime ? (
                <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-4'}>
                  {/* Trials count */}
                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.time.trialsCount', 'Trials count')}
                      value={trialsCount}
                      min={3}
                      max={30}
                      step={1}
                      onChange={setTrialsCount}
                    />
                  </SettingBlock>

                  {/* Target duration */}
                  <SettingBlock hideTabs={hideTabs}>
                    <EditableSlider
                      label={t('settings.time.targetDuration', 'Target duration (ms)')}
                      value={
                        (modeSettings as { timeTargetDurationMs?: number }).timeTargetDurationMs ??
                        1000
                      }
                      min={500}
                      max={5000}
                      step={100}
                      onChange={(v: number) => setModeSetting('timeTargetDurationMs', v)}
                    />
                  </SettingBlock>

                  {/* Slider shape */}
                  <SettingBlock hideTabs={hideTabs}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {t('settings.time.sliderShape', 'Slider shape')}
                      </span>
                      <SettingsSegmentedControl
                        value={
                          ((modeSettings as { timeSliderShape?: string }).timeSliderShape ??
                            'line') as 'line' | 'circle'
                        }
                        options={[
                          { value: 'line', label: t('settings.time.shapeLine', 'Line') },
                          { value: 'circle', label: t('settings.time.shapeCircle', 'Circle') },
                        ]}
                        onChange={(shape) => setModeSetting('timeSliderShape', shape)}
                      />
                    </div>
                  </SettingBlock>

                  {/* Slider direction */}
                  <SettingBlock hideTabs={hideTabs}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {t('settings.time.direction', 'Direction')}
                      </span>
                      <SettingsSegmentedControl
                        value={
                          ((modeSettings as { timeSliderDirection?: string }).timeSliderDirection ??
                            'normal') as 'normal' | 'reverse'
                        }
                        options={(['normal', 'reverse'] as const).map((dir) => {
                          const shape =
                            (modeSettings as { timeSliderShape?: string }).timeSliderShape ??
                            'line';
                          const label =
                            dir === 'normal'
                              ? shape === 'circle'
                                ? t('settings.time.dirClockwise', 'Clockwise')
                                : t('settings.time.dirLeftRight', 'L → R')
                              : shape === 'circle'
                                ? t('settings.time.dirCounterClockwise', 'Counter-clockwise')
                                : t('settings.time.dirRightLeft', 'R → L');
                          return { value: dir, label };
                        })}
                        onChange={(dir) => setModeSetting('timeSliderDirection', dir)}
                      />
                    </div>
                  </SettingBlock>

                  {/* Estimation toggle */}
                  <SettingBlock hideTabs={hideTabs}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {t('settings.time.estimation', 'Time estimation')}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setModeSetting(
                            'timeEstimationEnabled',
                            !(
                              (modeSettings as { timeEstimationEnabled?: boolean })
                                .timeEstimationEnabled ?? true
                            ),
                          )
                        }
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          ((modeSettings as { timeEstimationEnabled?: boolean })
                            .timeEstimationEnabled ?? true)
                            ? 'bg-amber-500'
                            : 'bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                            ((modeSettings as { timeEstimationEnabled?: boolean })
                              .timeEstimationEnabled ?? true)
                              ? 'translate-x-6'
                              : 'translate-x-1',
                          )}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(
                        'settings.time.estimationDesc',
                        'Ask the player to estimate the duration after each slide',
                      )}
                    </p>
                  </SettingBlock>
                </div>
              ) : activeModeTab === 'base' ? (
                <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-4'}>
                  {/* ================================================================
		                SIMPLE SETTINGS - Always visible
		                ================================================================ */}

                  {/* Presets (Free vs Journey) */}
                  {showPresets && (
                    <SettingBlock hideTabs={hideTabs}>
                      {isJourneyScope ? (
                        <JourneyPresetSelector
                          journeyId={activeJourneyId}
                          mode={mode}
                          locked={lockModalities}
                          preserveKeys={preserveJourneyPresetKeys}
                        />
                      ) : (
                        <FreeTrainingPresetSelector
                          mode={mode}
                          onPresetApplied={() => {
                            setModeSettingsTab('base');
                          }}
                        />
                      )}
                    </SettingBlock>
                  )}

                  {/* N-Level (hidden for dual-track in journey scope — calibration controls it) */}
                  {!isTower &&
                    !isGridlock &&
                    !isStroop &&
                    !isFlanker &&
                    !isPasat &&
                    !isMentalRotation &&
                    !isVisualSearch &&
                    !isReflex &&
                    !isTaskSwitching &&
                    !(isDualTrack && isJourneyScope) && (
                      <SettingBlock hideTabs={hideTabs}>
                        <NLevelSelect
                          value={
                            isSimulator && maxAchievedLevelForMode !== null
                              ? Math.max(maxAchievedLevelForMode, nLevel)
                              : nLevel
                          }
                          onChange={setNLevel}
                          disabled={!canConfigure('nLevel') || lockJourneyControlledLevel}
                          onUpgradeClick={() => setShowUpgradeDialog(true)}
                          labelKey={
                            isDualTrack
                              ? 'settings.dualTrack.targetsLabel'
                              : isCorsiBlock || isDigitSpan
                                ? 'settings.corsi.startSpan'
                                : isSymmetrySpan
                                  ? 'settings.symmetrySpan.startSetSize'
                                  : isMemoryMatch
                                    ? 'settings.memoryMatch.gridSize'
                                    : isLightsOut
                                      ? 'settings.lightsOut.gridSize'
                                      : isTangram
                                        ? 'settings.tangram.difficulty'
                                        : isMirror
                                          ? 'settings.mirror.axis'
                                          : isSpotDiff
                                            ? 'settings.spotDiff.difficulty'
                                            : isSimulator
                                              ? 'settings.config.currentNLevel'
                                              : 'settings.config.nLevel'
                          }
                          descriptionKey={
                            isDualTrack
                              ? 'settings.dualTrack.targetsHint'
                              : isCorsiBlock || isDigitSpan
                                ? 'settings.corsi.startSpanDesc'
                                : isSymmetrySpan
                                  ? 'settings.symmetrySpan.startSetSizeDesc'
                                  : isMemoryMatch
                                    ? 'settings.memoryMatch.gridSizeDesc'
                                    : isLightsOut
                                      ? 'settings.lightsOut.gridSizeDesc'
                                      : isTangram
                                        ? 'settings.tangram.difficultyDesc'
                                        : isMirror
                                          ? 'settings.mirror.axisDesc'
                                          : isSpotDiff
                                            ? 'settings.spotDiff.difficultyDesc'
                                            : 'settings.config.nLevelDesc'
                          }
                          minLevel={
                            isDualTrace
                              ? 0
                              : isCorsiBlock || isDigitSpan || isSymmetrySpan || isLightsOut
                                ? 2
                                : 1
                          }
                          maxLevel={
                            isDualTrack
                              ? 5
                              : isMemoryMatch
                                ? 4
                                : isLightsOut
                                  ? 5
                                  : isDigitSpan
                                    ? 9
                                    : isTangram || isMirror || isSpotDiff
                                      ? 3
                                      : isSymmetrySpan
                                        ? 7
                                        : 10
                          }
                          formatLevel={
                            isMemoryMatch
                              ? (l: number) =>
                                  ({
                                    1: '2×3 (3 pairs)',
                                    2: '3×4 (6 pairs)',
                                    3: '4×4 (8 pairs)',
                                    4: '4×5 (10 pairs)',
                                  })[l] ?? `${l}`
                              : isLightsOut
                                ? (l: number) => `${l}×${l}`
                                : isTangram
                                  ? (l: number) =>
                                      ({
                                        1: t('settings.tangram.level1', '3-4 pieces'),
                                        2: t('settings.tangram.level2', '5-6 pieces'),
                                        3: t('settings.tangram.level3', '6-7 pieces'),
                                      })[l] ?? `${l}`
                                  : isMirror
                                    ? (l: number) =>
                                        ({
                                          1: t('settings.mirror.vertical', 'Vertical'),
                                          2: t('settings.mirror.horizontal', 'Horizontal'),
                                          3: t('settings.mirror.central', 'Central'),
                                        })[l] ?? `${l}`
                                    : isSpotDiff
                                      ? (l: number) =>
                                          ({
                                            1: t('settings.spotDiff.level1', '4×4 (2 diffs)'),
                                            2: t('settings.spotDiff.level2', '5×5 (3 diffs)'),
                                            3: t('settings.spotDiff.level3', '5×5 (4 diffs)'),
                                          })[l] ?? `${l}`
                                      : undefined
                          }
                        />
                        {isDualTrack && (
                          <DualTrackBaseSettingsSection
                            wrapInBlock={false}
                            hideTabs={hideTabs}
                            isHybridJourneyScope={isHybridJourneyScope}
                            hybridTrackSessionsPerBlock={hybridTrackSessionsPerBlock}
                            hybridDnbSessionsPerBlock={hybridDnbSessionsPerBlock}
                            onHybridTrackSessionsPerBlockChange={updateHybridTrackSessionsPerBlock}
                            onHybridDnbSessionsPerBlockChange={updateHybridDnbSessionsPerBlock}
                            positionIdentityEnabled={dualTrackPositionIdentityEnabled}
                            colorIdentityEnabled={dualTrackColorIdentityEnabled}
                            letterAudioEnabled={dualTrackLetterAudioEnabled}
                            imageIdentityEnabled={dualTrackImageIdentityEnabled}
                            spatialIdentityEnabled={dualTrackSpatialIdentityEnabled}
                            digitsIdentityEnabled={dualTrackDigitsIdentityEnabled}
                            emotionsIdentityEnabled={dualTrackEmotionsIdentityEnabled}
                            wordsIdentityEnabled={dualTrackWordsIdentityEnabled}
                            tonesEnabled={dualTrackTonesEnabled}
                            focusCrossEnabled={dualTrackFocusCrossEnabled}
                            onTrackingIdentityModeChange={(value) =>
                              setModeSetting('trackingIdentityMode', value)
                            }
                            onTrackingLetterAudioEnabledChange={(value) =>
                              setModeSetting('trackingLetterAudioEnabled', value)
                            }
                            onTrackingTonesEnabledChange={(value) =>
                              setModeSetting('trackingTonesEnabled', value)
                            }
                            onFocusCrossEnabledChange={(value) =>
                              setModeSetting('trackingFocusCrossEnabled', value)
                            }
                            autoCalibrationSummary={dualTrackAutoCalibrationSummary}
                          />
                        )}
                        {isCorsiBlock && canConfigure('corsiDirection') && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">
                                {t('settings.corsi.direction', 'Direction')}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t(
                                  'settings.corsi.directionDesc',
                                  'Replay the sequence in the same order or in reverse order.',
                                )}
                              </p>
                            </div>
                            <SettingsSegmentedControl
                              value={corsiDirection}
                              options={[
                                {
                                  value: 'forward',
                                  label: t('settings.corsi.forward', 'Forward'),
                                },
                                {
                                  value: 'backward',
                                  label: t('settings.corsi.backward', 'Backward'),
                                },
                              ]}
                              onChange={(value) =>
                                setCorsiDirection(value as 'forward' | 'backward')
                              }
                            />
                          </div>
                        )}
                      </SettingBlock>
                    )}

                  {/* Dual Track modalities — shown even when nLevel is hidden (journey scope) */}
                  {isDualTrack && isJourneyScope && (
                    <DualTrackBaseSettingsSection
                      hideTabs={hideTabs}
                      isHybridJourneyScope={isHybridJourneyScope}
                      hybridTrackSessionsPerBlock={hybridTrackSessionsPerBlock}
                      hybridDnbSessionsPerBlock={hybridDnbSessionsPerBlock}
                      onHybridTrackSessionsPerBlockChange={updateHybridTrackSessionsPerBlock}
                      onHybridDnbSessionsPerBlockChange={updateHybridDnbSessionsPerBlock}
                      positionIdentityEnabled={dualTrackPositionIdentityEnabled}
                      colorIdentityEnabled={dualTrackColorIdentityEnabled}
                      letterAudioEnabled={dualTrackLetterAudioEnabled}
                      imageIdentityEnabled={dualTrackImageIdentityEnabled}
                      spatialIdentityEnabled={dualTrackSpatialIdentityEnabled}
                      digitsIdentityEnabled={dualTrackDigitsIdentityEnabled}
                      emotionsIdentityEnabled={dualTrackEmotionsIdentityEnabled}
                      wordsIdentityEnabled={dualTrackWordsIdentityEnabled}
                      tonesEnabled={dualTrackTonesEnabled}
                      focusCrossEnabled={dualTrackFocusCrossEnabled}
                      onTrackingIdentityModeChange={(value) =>
                        setModeSetting('trackingIdentityMode', value)
                      }
                      onTrackingLetterAudioEnabledChange={(value) =>
                        setModeSetting('trackingLetterAudioEnabled', value)
                      }
                      onTrackingTonesEnabledChange={(value) =>
                        setModeSetting('trackingTonesEnabled', value)
                      }
                      onFocusCrossEnabledChange={(value) =>
                        setModeSetting('trackingFocusCrossEnabled', value)
                      }
                      autoCalibrationSummary={dualTrackAutoCalibrationSummary}
                    />
                  )}

                  {/* ── Mode-specific timing settings ── */}

                  {/* PASAT: starting pace */}
                  {isPasat && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.pasat.startPace', 'Starting pace')}
                        description={t(
                          'settings.pasat.startPaceDesc',
                          'Time between numbers at the start. Pace increases with correct answers.',
                        )}
                      >
                        <EditableSlider
                          label={`${(pasatStartIsiMs / 1000).toFixed(1)}s`}
                          value={pasatStartIsiMs}
                          min={1500}
                          max={5000}
                          step={500}
                          onChange={(v: number) => setModeSetting('pasatStartIsiMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Digit Span: digit display speed */}
                  {isDigitSpan && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.digitSpan.displaySpeed', 'Digit speed')}
                        description={t(
                          'settings.digitSpan.displaySpeedDesc',
                          'How long each digit is shown. Slower is easier for beginners.',
                        )}
                      >
                        <EditableSlider
                          label={`${(digitDisplayMs / 1000).toFixed(1)}s`}
                          value={digitDisplayMs}
                          min={400}
                          max={2000}
                          step={100}
                          onChange={(v: number) => setModeSetting('digitDisplayMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Corsi Block: highlight duration */}
                  {isCorsiBlock && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.corsi.highlightSpeed', 'Highlight speed')}
                        description={t(
                          'settings.corsi.highlightSpeedDesc',
                          'How long each block lights up. Slower is easier for beginners.',
                        )}
                      >
                        <EditableSlider
                          label={`${(corsiHighlightMs / 1000).toFixed(1)}s`}
                          value={corsiHighlightMs}
                          min={400}
                          max={1500}
                          step={100}
                          onChange={(v: number) => setModeSetting('corsiHighlightMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Symmetry Span: position display duration */}
                  {isSymmetrySpan && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.symmetrySpan.displaySpeed', 'Position speed')}
                        description={t(
                          'settings.symmetrySpan.displaySpeedDesc',
                          'How long each position is highlighted. Slower is easier for beginners.',
                        )}
                      >
                        <EditableSlider
                          label={`${(symmetrySpanDisplayMs / 1000).toFixed(1)}s`}
                          value={symmetrySpanDisplayMs}
                          min={500}
                          max={2000}
                          step={100}
                          onChange={(v: number) => setModeSetting('positionDisplayMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Stroop: response timeout */}
                  {(isStroop || isStroopFlex) && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.stroop.responseTime', 'Response time')}
                        description={t(
                          'settings.stroop.responseTimeDesc',
                          'Time allowed to respond. Longer is easier for beginners.',
                        )}
                      >
                        <EditableSlider
                          label={`${(stroopTimeoutMs / 1000).toFixed(1)}s`}
                          value={stroopTimeoutMs}
                          min={1500}
                          max={6000}
                          step={500}
                          onChange={(v: number) => setModeSetting('stimulusTimeoutMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Flanker: response timeout */}
                  {isFlanker && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.flanker.responseTime', 'Response time')}
                        description={t(
                          'settings.flanker.responseTimeDesc',
                          'Time allowed to respond. Longer is easier for beginners.',
                        )}
                      >
                        <EditableSlider
                          label={`${(flankerTimeoutMs / 1000).toFixed(1)}s`}
                          value={flankerTimeoutMs}
                          min={1500}
                          max={6000}
                          step={500}
                          onChange={(v: number) => setModeSetting('stimulusTimeoutMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Mental Rotation: response timeout */}
                  {isMentalRotation && (
                    <SettingBlock hideTabs={hideTabs}>
                      <SettingRow
                        label={t('settings.mentalRotation.responseTime', 'Response time')}
                        description={t(
                          'settings.mentalRotation.responseTimeDesc',
                          'Time allowed to respond per trial. Longer is easier.',
                        )}
                      >
                        <EditableSlider
                          label={`${(mentalRotationTimeoutMs / 1000).toFixed(0)}s`}
                          value={mentalRotationTimeoutMs}
                          min={5000}
                          max={20000}
                          step={1000}
                          onChange={(v: number) => setModeSetting('timeoutMs', v)}
                        />
                      </SettingRow>
                    </SettingBlock>
                  )}

                  {/* Modalities */}
                  {canConfigure('activeModalities') && (
                    <SettingBlock hideTabs={hideTabs}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {t('settings.config.modalities')}
                          </div>
                          <span className="shrink-0">
                            <InfoSheet iconSize={12}>
                              {isBrainWorkshopComboEnforced
                                ? t(
                                    'settings.brainworkshop.modalitiesComboHint',
                                    'This profile requires exactly {{count}} active modalities.',
                                    { count: enforcedBrainWorkshopModalitiesCount ?? 2 },
                                  )
                                : t('stats.tooltips.modalitiesDesc')}
                            </InfoSheet>
                          </span>
                        </div>
                        <ModalityMixer
                          activeModalities={activeModalities}
                          onToggle={toggleModality}
                          disabled={!canConfigure('activeModalities') || lockModalities}
                          hiddenModalities={[
                            ...(hideColorModality ? ['color'] : []),
                            ...(hideImageModality ? ['image'] : []),
                            ...(hideArithmeticModality ? ['arithmetic'] : []),
                            ...(!isBrainWorkshop ? ['visvis', 'visaudio', 'audiovis'] : []),
                          ]}
                        />
                      </div>
                    </SettingBlock>
                  )}

                  {/* Session Length */}
                  {(canConfigure('trialsCount') || isBrainWorkshop) && (
                    <SettingBlock hideTabs={hideTabs}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {t(
                              isMemoryMatch
                                ? 'settings.memoryMatch.boards'
                                : isLightsOut || isTangram
                                  ? 'settings.lightsOut.puzzles'
                                  : isSpotDiff
                                    ? 'settings.spotDiff.rounds'
                                    : isMirror
                                      ? 'settings.mirror.patterns'
                                      : 'settings.config.sessionDuration',
                            )}
                          </p>
                          <span className="shrink-0">
                            <InfoSheet iconSize={12}>
                              {t(
                                isMemoryMatch
                                  ? 'settings.memoryMatch.boardsDesc'
                                  : isLightsOut || isTangram
                                    ? 'settings.lightsOut.puzzlesDesc'
                                    : isSpotDiff
                                      ? 'settings.spotDiff.roundsDesc'
                                      : isMirror
                                        ? 'settings.mirror.patternsDesc'
                                        : 'settings.config.sessionDurationDesc',
                              )}
                            </InfoSheet>
                          </span>
                        </div>

                        <Select
                          value={String(trialsCount)}
                          onValueChange={(v) =>
                            setTrialsCount(Math.max(sessionDurationMin, Number(v)))
                          }
                        >
                          <SelectTrigger className="w-full h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sessionDurationOptions.map((count) => (
                              <SelectItem key={count} value={String(count)}>
                                {count}{' '}
                                {t(
                                  isMemoryMatch
                                    ? 'settings.memoryMatch.boards'
                                    : isLightsOut || isTangram
                                      ? 'settings.lightsOut.puzzles'
                                      : isSpotDiff
                                        ? 'settings.spotDiff.rounds'
                                        : isMirror
                                          ? 'settings.mirror.patterns'
                                          : 'settings.config.trials',
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </SettingBlock>
                  )}

                  {isTower && (
                    <>
                      <SettingsGroupHeader
                        title={t('settings.tower.groupPuzzles', 'Puzzles')}
                        description={t(
                          'settings.tower.groupPuzzlesDesc',
                          'Set the tower size and type of challenges for the session.',
                        )}
                      />
                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.tower.elements', 'Elements')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.tower.elementsDesc',
                                'Choose the size of the puzzle: 3 for classic, 4 or 5 for harder planning.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={String(towerDiscCount)}
                            onValueChange={(value) =>
                              setModeSetting('towerDiscCount', Number(value) as 3 | 4 | 5)
                            }
                          >
                            <SelectTrigger className="w-28 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                              <SelectItem value="5">5</SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.tower.sessionVariant', 'Session variant')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.tower.sessionVariantDesc',
                                'Choose a classic-only block or force memory/precision/expert rounds.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={towerChallengeMode}
                            onValueChange={(value) =>
                              setModeSetting(
                                'towerChallengeMode',
                                value as 'mixed' | 'classic' | 'precision' | 'memory' | 'expert',
                              )
                            }
                          >
                            <SelectTrigger className="w-40 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mixed">
                                {t('settings.tower.variantMixed', 'Mixed')}
                              </SelectItem>
                              <SelectItem value="classic">
                                {t('settings.tower.variantClassic', 'Classic only')}
                              </SelectItem>
                              <SelectItem value="memory">
                                {t('settings.tower.variantMemory', 'Memory')}
                              </SelectItem>
                              <SelectItem value="precision">
                                {t('settings.tower.variantPrecision', 'Precision')}
                              </SelectItem>
                              <SelectItem value="expert">
                                {t('settings.tower.variantExpert', 'Expert')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>
                    </>
                  )}

                  {isGridlock && (
                    <>
                      <SettingsGroupHeader
                        title={t('settings.gridlock.groupSession', 'Session')}
                        description={t(
                          'settings.gridlock.groupSessionDesc',
                          'Overall session structure: profile, variant, duration and initial preview.',
                        )}
                      />
                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.gridlock.profile', 'Difficulty profile')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.gridlock.profileDesc',
                                'Controls the difficulty curve within a session. Rookie stays easy, Standard ramps up, Expert starts hard.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={gridlockProfileId}
                            onValueChange={(value) =>
                              setModeSetting(
                                'gridlockProfileId',
                                value as 'rookie' | 'standard' | 'expert',
                              )
                            }
                          >
                            <SelectTrigger className="w-36 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rookie">
                                {t('settings.gridlock.profileRookie', 'Rookie')}
                              </SelectItem>
                              <SelectItem value="standard">
                                {t('settings.gridlock.profileStandard', 'Standard')}
                              </SelectItem>
                              <SelectItem value="expert">
                                {t('settings.gridlock.profileExpert', 'Expert')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.gridlock.sessionVariant', 'Session variant')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.gridlock.sessionVariantDesc',
                                'Mixed follows a progressive schedule. Other options force a single challenge type for the whole session.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={gridlockSessionVariant}
                            onValueChange={(value) =>
                              setModeSetting(
                                'gridlockSessionVariant',
                                value as 'mixed' | 'classic' | 'precision' | 'memory' | 'timed',
                              )
                            }
                          >
                            <SelectTrigger className="w-40 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mixed">
                                {t('settings.gridlock.variantMixed', 'Mixed')}
                              </SelectItem>
                              <SelectItem value="classic">
                                {t('settings.gridlock.variantClassic', 'Classic')}
                              </SelectItem>
                              <SelectItem value="precision">
                                {t('settings.gridlock.variantPrecision', 'Precision')}
                              </SelectItem>
                              <SelectItem value="memory">
                                {t('settings.gridlock.variantMemory', 'Memory')}
                              </SelectItem>
                              <SelectItem value="timed">
                                {t('settings.gridlock.variantTimed', 'Timed')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.gridlock.timeLimit', 'Time limit per puzzle')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.gridlock.timeLimitDesc',
                                'Maximum time allowed for each puzzle. Set to "Off" for unlimited time.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={String(gridlockTimeLimitMs)}
                            onValueChange={(value) =>
                              setModeSetting('gridlockTimeLimitMs', Number(value))
                            }
                          >
                            <SelectTrigger className="w-28 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">
                                {t('settings.gridlock.timeLimitOff', 'Off')}
                              </SelectItem>
                              <SelectItem value="60000">
                                {t('settings.gridlock.timeLimit1min', '1 min')}
                              </SelectItem>
                              <SelectItem value="90000">
                                {t('settings.gridlock.timeLimit1_5min', '1.5 min')}
                              </SelectItem>
                              <SelectItem value="120000">
                                {t('settings.gridlock.timeLimit2min', '2 min')}
                              </SelectItem>
                              <SelectItem value="180000">
                                {t('settings.gridlock.timeLimit3min', '3 min')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.gridlock.previewDuration', 'Preview duration')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.gridlock.previewDurationDesc',
                                'How long the board is shown before play starts. Auto adapts to puzzle complexity.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={gridlockPreviewDuration}
                            onValueChange={(value) =>
                              setModeSetting('gridlockPreviewDuration', value)
                            }
                          >
                            <SelectTrigger className="w-28 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">
                                {t('settings.gridlock.previewAuto', 'Auto')}
                              </SelectItem>
                              <SelectItem value="off">
                                {t('settings.gridlock.previewOff', 'Off')}
                              </SelectItem>
                              <SelectItem value="short">
                                {t('settings.gridlock.previewShort', 'Short (1.5s)')}
                              </SelectItem>
                              <SelectItem value="medium">
                                {t('settings.gridlock.previewMedium', 'Medium (3s)')}
                              </SelectItem>
                              <SelectItem value="long">
                                {t('settings.gridlock.previewLong', 'Long (6s)')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>
                    </>
                  )}

                  {isUfov && (
                    <>
                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.ufov.sessionVariant', 'UFOV block')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.ufov.sessionVariantDesc',
                                'Train the full 3-part UFOV sequence or focus on one subtask: central identification, divided attention, or selective attention with distractors.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <Select
                            value={ufovVariant}
                            onValueChange={(value) =>
                              setModeSetting(
                                'ufovVariant',
                                value as 'full' | 'central' | 'divided' | 'selective',
                              )
                            }
                          >
                            <SelectTrigger className="w-40 h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">
                                {t('settings.ufov.variantFull', 'Full')}
                              </SelectItem>
                              <SelectItem value="central">
                                {t('settings.ufov.variantCentral', 'Central')}
                              </SelectItem>
                              <SelectItem value="divided">
                                {t('settings.ufov.variantDivided', 'Divided')}
                              </SelectItem>
                              <SelectItem value="selective">
                                {t('settings.ufov.variantSelective', 'Selective')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </SettingRow>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <EditableSlider
                          label={t('settings.ufov.startSpeed', 'Starting display (ms)')}
                          value={Math.max(80, Math.round(ufovInitialDisplayMs))}
                          min={80}
                          max={500}
                          step={10}
                          onChange={(value: number) =>
                            setModeSetting('ufovInitialDisplayMs', value)
                          }
                        />
                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                          {t(
                            'settings.ufov.startSpeedDesc',
                            'Starting exposure before the staircase tightens or relaxes. Lower = harder from the first trial.',
                          )}
                        </p>
                      </SettingBlock>

                      <SettingBlock hideTabs={hideTabs}>
                        <SettingRow
                          label={t('settings.ufov.peripheralDistance', 'Peripheral distance')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.ufov.peripheralDistanceDesc',
                                'Controls how far the peripheral target sits from the center. Wide is harder.',
                              )}
                            </InfoSheet>
                          }
                        >
                          <SettingsSegmentedControl
                            value={ufovPeripheralRadiusMode}
                            options={[
                              { value: 'near', label: t('settings.ufov.distanceNear', 'Near') },
                              {
                                value: 'standard',
                                label: t('settings.ufov.distanceStandard', 'Standard'),
                              },
                              { value: 'wide', label: t('settings.ufov.distanceWide', 'Wide') },
                            ]}
                            onChange={(value) =>
                              setModeSetting(
                                'ufovPeripheralRadiusMode',
                                value as 'near' | 'standard' | 'wide',
                              )
                            }
                          />
                        </SettingRow>
                      </SettingBlock>

                      {(ufovVariant === 'full' || ufovVariant === 'selective') && (
                        <SettingBlock hideTabs={hideTabs}>
                          <EditableSlider
                            label={t('settings.ufov.distractors', 'Selective distractors')}
                            value={Math.max(2, Math.round(ufovDistractorCount))}
                            min={2}
                            max={7}
                            step={1}
                            onChange={(value: number) =>
                              setModeSetting('ufovDistractorCount', value)
                            }
                          />
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {t(
                              'settings.ufov.distractorsDesc',
                              'Number of peripheral distractors shown in selective-attention trials.',
                            )}
                          </p>
                        </SettingBlock>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </TabsContent>

            {hasTempoTab && (
              <TabsContent value="tempo" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
                {activeModeTab === 'tempo' ? (
                  <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                    {isDualTrack && (
                      <SettingBlock hideTabs={hideTabs}>
                        <div className="space-y-3">
                          {alphaEnabled ? (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {t('settings.dualTrack.renderMode', 'Renderer')}
                              </span>
                              <SettingsSegmentedControl
                                value={dualTrackRenderMode}
                                options={[
                                  {
                                    value: 'dom',
                                    label: t('settings.dualTrack.renderDom', 'Classic'),
                                  },
                                  {
                                    value: 'webgl',
                                    label: t('settings.dualTrack.render25d', '2.5D'),
                                  },
                                  {
                                    value: 'webgl3d',
                                    label: t('settings.dualTrack.render3d', '3D'),
                                  },
                                ]}
                                onChange={(renderMode) =>
                                  setModeSetting(
                                    'renderMode',
                                    renderMode as 'dom' | 'webgl' | 'webgl3d',
                                  )
                                }
                              />
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t('settings.dualTrack.crowdingMode', 'Proximity')}
                            </span>
                            <SettingsSegmentedControl
                              value={dualTrackCrowdingMode}
                              options={[
                                {
                                  value: 'low',
                                  label: t('settings.dualTrack.crowdingLow', 'Low'),
                                },
                                {
                                  value: 'standard',
                                  label: t('settings.dualTrack.crowdingStandard', 'Standard'),
                                },
                                {
                                  value: 'dense',
                                  label: t('settings.dualTrack.crowdingDense', 'Dense'),
                                },
                              ]}
                              onChange={(crowdingMode) =>
                                setModeSetting('crowdingMode', crowdingMode)
                              }
                            />
                          </div>

                          <Toggle
                            label={t('settings.dualTrack.collision', 'Collision entre billes')}
                            description={t(
                              'settings.dualTrack.collisionDesc',
                              'Les billes rebondissent les unes sur les autres au lieu de se chevaucher.',
                            )}
                            checked={dualTrackCollisionEnabled}
                            onChange={(value) => setModeSetting('trackingCollisionEnabled', value)}
                          />

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t('settings.dualTrack.speedMode', 'Speed')}
                            </span>
                            <SettingsSegmentedControl
                              value={dualTrackTrackingSpeedMode}
                              options={[
                                {
                                  value: 'auto',
                                  label: t('settings.dualTrack.speedAuto', 'Auto'),
                                },
                                {
                                  value: 'manual',
                                  label: t('settings.dualTrack.speedManual', 'Manual'),
                                },
                              ]}
                              onChange={(speedMode) =>
                                setModeSetting('trackingSpeedMode', speedMode)
                              }
                            />
                          </div>

                          {dualTrackTrackingSpeedMode === 'manual' && (
                            <EditableSlider
                              label={t('settings.dualTrack.speedLabel', 'Speed (px/s)')}
                              value={Math.max(80, Math.round(dualTrackSpeedPxPerSec || 160))}
                              min={80}
                              max={260}
                              step={10}
                              onChange={(v: number) => setModeSetting('trackingSpeedPxPerSec', v)}
                            />
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t('settings.dualTrack.totalObjectsMode', 'Number of balls')}
                            </span>
                            <SettingsSegmentedControl
                              value={dualTrackTotalObjectsMode}
                              options={[
                                {
                                  value: 'auto',
                                  label: t('settings.dualTrack.totalObjectsAuto', 'Auto'),
                                },
                                {
                                  value: 'manual',
                                  label: t('settings.dualTrack.totalObjectsManual', 'Manual'),
                                },
                              ]}
                              onChange={(totalObjectsMode) =>
                                setModeSetting('totalObjectsMode', totalObjectsMode)
                              }
                            />
                          </div>

                          {dualTrackTotalObjectsMode === 'manual' && (
                            <EditableSlider
                              label={t('settings.dualTrack.totalObjectsLabel', 'Total balls')}
                              value={Math.max(4, Math.round(dualTrackTotalObjects || 8))}
                              min={4}
                              max={20}
                              step={1}
                              onChange={(v: number) => setModeSetting('totalObjects', v)}
                            />
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t('settings.dualTrack.motionComplexity', 'Motion complexity')}
                            </span>
                            <SettingsSegmentedControl
                              value={dualTrackMotionComplexity}
                              options={[
                                {
                                  value: 'smooth',
                                  label: t('settings.dualTrack.motionSmooth', 'Smooth'),
                                },
                                {
                                  value: 'standard',
                                  label: t('settings.dualTrack.motionStandard', 'Standard'),
                                },
                                {
                                  value: 'agile',
                                  label: t('settings.dualTrack.motionAgile', 'Agile'),
                                },
                              ]}
                              onChange={(motionComplexity) =>
                                setModeSetting('motionComplexity', motionComplexity)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t('settings.dualTrack.durationMode', 'Tracking duration')}
                            </span>
                            <SettingsSegmentedControl
                              value={dualTrackTrackingDurationMode}
                              options={[
                                {
                                  value: 'auto',
                                  label: t('settings.dualTrack.durationAuto', 'Auto'),
                                },
                                {
                                  value: 'manual',
                                  label: t('settings.dualTrack.durationManual', 'Manual'),
                                },
                              ]}
                              onChange={(durationMode) =>
                                setModeSetting('trackingDurationMode', durationMode)
                              }
                            />
                          </div>

                          <EditableSlider
                            label={t(
                              'settings.dualTrack.highlightSpacing',
                              'Highlight speed (ms between targets)',
                            )}
                            value={Math.round(
                              (modeSettings as { highlightSpacingMs?: number })
                                .highlightSpacingMs ?? 1500,
                            )}
                            min={600}
                            max={2000}
                            step={50}
                            onChange={(v: number) => setModeSetting('highlightSpacingMs', v)}
                          />

                          {dualTrackRenderMode === 'dom' && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {t('settings.dualTrack.depthMode', 'Depth')}
                              </span>
                              <SettingsSegmentedControl
                                value={
                                  ((modeSettings as { depthMode?: 'flat' | '2.5d' }).depthMode ??
                                    'flat') as 'flat' | '2.5d'
                                }
                                options={[
                                  {
                                    value: 'flat',
                                    label: t('settings.dualTrack.depthFlat', 'Flat'),
                                  },
                                  {
                                    value: '2.5d',
                                    label: t('settings.dualTrack.depth25d', '2.5D'),
                                  },
                                ]}
                                onChange={(depthMode) =>
                                  setModeSetting('depthMode', depthMode as 'flat' | '2.5d')
                                }
                              />
                            </div>
                          )}

                          {dualTrackTrackingDurationMode === 'manual' && (
                            <EditableSlider
                              label={t(
                                'settings.dualTrack.durationLabel',
                                'Tracking duration (ms)',
                              )}
                              value={Math.max(
                                3000,
                                Math.round(dualTrackTrackingDurationMs || 5000),
                              )}
                              min={3000}
                              max={15000}
                              step={500}
                              onChange={(v: number) => setModeSetting('trackingDurationMs', v)}
                            />
                          )}
                        </div>
                      </SettingBlock>
                    )}
                    {isDualTrace && (
                      <>
                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.trace.rhythmMode')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t('settings.trace.rhythmModeDesc')}
                              </InfoSheet>
                            }
                          >
                            <Select
                              value={rhythmMode}
                              onValueChange={(v) => setRhythmMode(v as 'self-paced' | 'timed')}
                            >
                              <SelectTrigger className="w-32 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="timed">{t('settings.trace.timed')}</SelectItem>
                                <SelectItem value="self-paced">
                                  {t('settings.trace.selfPaced')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.trace.adaptiveTiming')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t('settings.trace.adaptiveTimingDesc')}
                              </InfoSheet>
                            }
                            checked={traceAdaptiveTimingEnabled}
                            onChange={setTraceAdaptiveTimingEnabled}
                            activeColor="visual"
                          />
                        </SettingBlock>

                        {rhythmMode === 'timed' && (
                          <SettingBlock hideTabs={hideTabs}>
                            <EditableSlider
                              label={t('settings.trace.isi')}
                              labelRight={
                                <InfoSheet iconSize={12}>{t('settings.trace.isiHint')}</InfoSheet>
                              }
                              value={traceIsiMs / 1000}
                              onChange={(v) => setTraceIsiMs(v * 1000)}
                              min={1.5}
                              max={10}
                              step={0.5}
                              suffix="s"
                              colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                              trackClass="bg-teal-200 dark:bg-teal-500/30"
                              accentClass="accent-teal-500"
                            />
                          </SettingBlock>
                        )}

                        {rhythmMode === 'self-paced' && (
                          <>
                            <SettingBlock hideTabs={hideTabs}>
                              <EditableSlider
                                label={t('settings.trace.stimulusDuration')}
                                value={traceStimulusDurationMs / 1000}
                                onChange={(v) => setTraceStimulusDurationMs(v * 1000)}
                                min={0.2}
                                max={5}
                                step={0.1}
                                suffix="s"
                                colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                trackClass="bg-teal-200 dark:bg-teal-500/30"
                                accentClass="accent-teal-500"
                              />
                            </SettingBlock>
                            <SettingBlock hideTabs={hideTabs}>
                              <EditableSlider
                                label={t('settings.trace.feedbackDuration')}
                                value={traceFeedbackDurationMs / 1000}
                                onChange={(v) => setTraceFeedbackDurationMs(v * 1000)}
                                min={0.2}
                                max={3}
                                step={0.1}
                                suffix="s"
                                colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                trackClass="bg-teal-200 dark:bg-teal-500/30"
                                accentClass="accent-teal-500"
                              />
                            </SettingBlock>
                            <SettingBlock hideTabs={hideTabs}>
                              <EditableSlider
                                label={t('settings.trace.ruleDisplay')}
                                value={traceRuleDisplayMs / 1000}
                                onChange={(v) => setTraceRuleDisplayMs(v * 1000)}
                                min={0.2}
                                max={3}
                                step={0.1}
                                suffix="s"
                                colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                trackClass="bg-teal-200 dark:bg-teal-500/30"
                                accentClass="accent-teal-500"
                              />
                            </SettingBlock>
                            <SettingBlock hideTabs={hideTabs}>
                              <EditableSlider
                                label={t('settings.trace.blankInterval')}
                                value={traceIntervalMs / 1000}
                                onChange={(v) => setTraceIntervalMs(v * 1000)}
                                min={0}
                                max={2}
                                step={0.25}
                                suffix="s"
                                colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                                trackClass="bg-slate-200 dark:bg-slate-500/30"
                                accentClass="accent-slate-500"
                              />
                            </SettingBlock>
                          </>
                        )}
                      </>
                    )}

                    {isCustom && (
                      <>
                        <SettingBlock hideTabs={hideTabs}>
                          <EditableSlider
                            label={t('settings.custom.interval')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t('settings.custom.intervalHint')}
                              </InfoSheet>
                            }
                            value={intervalSeconds}
                            onChange={(v) => {
                              setModeSetting('intervalSeconds', v);
                              if (stimulusDurationSeconds >= v) {
                                setModeSetting(
                                  'stimulusDurationSeconds',
                                  Math.round((v - 0.1) * 10) / 10,
                                );
                              }
                            }}
                            min={1.5}
                            max={10}
                            step={0.5}
                            suffix="s"
                            colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                            trackClass="bg-slate-200 dark:bg-slate-500/30"
                            accentClass="accent-slate-500"
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <EditableSlider
                            label={t('settings.custom.stimulusDuration')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.custom.stimulusDurationHint',
                                  'Display duration of each stimulus',
                                )}
                              </InfoSheet>
                            }
                            value={stimulusDurationSeconds}
                            onChange={(v) =>
                              setModeSetting(
                                'stimulusDurationSeconds',
                                Math.min(v, Math.round((intervalSeconds - 0.1) * 10) / 10),
                              )
                            }
                            min={0.2}
                            max={3}
                            step={0.1}
                            suffix="s"
                            colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                            trackClass="bg-slate-200 dark:bg-slate-500/30"
                            accentClass="accent-slate-500"
                          />
                        </SettingBlock>
                      </>
                    )}
                  </div>
                ) : null}
              </TabsContent>
            )}

            {hasGeneratorTab && (
              <TabsContent value="generator" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
                {activeModeTab === 'generator' ? (
                  <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                    {(isDualPlace || isDualPick) && (
                      <>
                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.placementMode')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.placementModeDesc',
                                  "L'ordre dans lequel placer les stimuli",
                                )}
                              </InfoSheet>
                            }
                            colorTheme="visual"
                          >
                            <Select
                              value={placementOrderMode}
                              onValueChange={(v) =>
                                setModeSettingFor(
                                  mode,
                                  'placementOrderMode',
                                  v as 'free' | 'random' | 'oldestFirst' | 'newestFirst',
                                )
                              }
                            >
                              <SelectTrigger className="w-32 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="free">{t('settings.placement.free')}</SelectItem>
                                <SelectItem value="random">
                                  {t('settings.placement.random')}
                                </SelectItem>
                                <SelectItem value="oldestFirst">
                                  {t('settings.placement.oldestFirst')}
                                </SelectItem>
                                <SelectItem value="newestFirst">
                                  {t('settings.placement.newestFirst')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t(
                              'settings.experimental.flowHideFilledCards',
                              'Hide placed stimuli',
                            )}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.experimental.flowHideFilledCardsDesc',
                                  'Hide stimuli after placement',
                                )}
                              </InfoSheet>
                            }
                            checked={hideFilledCards}
                            onChange={(enabled) =>
                              setModeSettingFor(mode, 'hideFilledCards', enabled)
                            }
                            activeColor="visual"
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.flow.noRepetitions')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.flow.noRepetitionsDesc',
                                  'Prevent consecutive identical stimuli',
                                )}
                              </InfoSheet>
                            }
                            checked={noRepetitions}
                            onChange={(enabled) =>
                              setModeSettingFor(mode, 'noRepetitions', enabled)
                            }
                            activeColor="visual"
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.dualPick.distractors')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.dualPick.distractorsDesc',
                                  'Decoy stimuli outside temporal window',
                                )}
                              </InfoSheet>
                            }
                          >
                            <Select
                              value={String(distractorCount)}
                              onValueChange={(v) =>
                                setModeSettingFor(mode, 'distractorCount', Number(v))
                              }
                            >
                              <SelectTrigger className="w-20 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 1, 2, 3, 4].map((c) => (
                                  <SelectItem key={c} value={String(c)}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>

                        {distractorCount > 0 && (
                          <SettingBlock hideTabs={hideTabs}>
                            <SettingRow
                              label={t('settings.dualPick.distractorSource')}
                              labelRight={
                                <InfoSheet iconSize={12}>
                                  {t(
                                    'settings.dualPick.distractorSourceDesc',
                                    'Old stimuli = proactive interference',
                                  )}
                                </InfoSheet>
                              }
                            >
                              <Select
                                value={distractorSource}
                                onValueChange={(v) =>
                                  setModeSettingFor(
                                    mode,
                                    'distractorSource',
                                    v as 'random' | 'proactive',
                                  )
                                }
                              >
                                <SelectTrigger className="w-28 h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="random">
                                    {t('settings.dualPick.random')}
                                  </SelectItem>
                                  <SelectItem value="proactive">
                                    {t('settings.dualPick.proactive')}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </SettingRow>
                          </SettingBlock>
                        )}
                      </>
                    )}

                    {isCustom && (
                      <>
                        <SettingBlock hideTabs={hideTabs}>
                          <EditableSlider
                            label={t('settings.custom.targetProbability')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.custom.targetProbabilityHint',
                                  'Target stimulus frequency (N-back match)',
                                )}
                              </InfoSheet>
                            }
                            value={Math.round(targetProbability * 100)}
                            onChange={(v) => setModeSetting('targetProbability', v / 100)}
                            min={10}
                            max={60}
                            step={5}
                            suffix="%"
                            colorClass="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            trackClass="bg-emerald-200 dark:bg-emerald-500/30"
                            accentClass="accent-emerald-500"
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <EditableSlider
                            label={t('settings.custom.lureProbability')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.custom.lureProbabilityHint',
                                  'Decoy frequency (misleading stimuli)',
                                )}
                              </InfoSheet>
                            }
                            value={Math.round(lureProbability * 100)}
                            onChange={(v) => setModeSetting('lureProbability', v / 100)}
                            min={0}
                            max={30}
                            step={5}
                            suffix="%"
                            colorClass="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            trackClass="bg-amber-200 dark:bg-amber-500/30"
                            accentClass="accent-amber-500"
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.trace.writingInput')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.trace.writingInputDesc',
                                  'Auto : clavier sur ordinateur, manuscrit sur mobile. Peut etre change a tout moment.',
                                )}
                              </InfoSheet>
                            }
                          >
                            <Select
                              value={traceWritingInputMethod}
                              onValueChange={(v) =>
                                setTraceWritingInputMethod(v as 'auto' | 'keyboard' | 'handwriting')
                              }
                            >
                              <SelectTrigger className="w-28 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">{t('common.auto')}</SelectItem>
                                <SelectItem value="keyboard">
                                  {t('trace.settings.inputKeyboard')}
                                </SelectItem>
                                <SelectItem value="handwriting">
                                  {t('trace.settings.inputHandwriting')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>
                      </>
                    )}
                  </div>
                ) : null}
              </TabsContent>
            )}

            {hasAdvancedTab && (
              <TabsContent value="advanced" className={hideTabs ? 'mt-0 p-0' : 'mt-0 p-4'}>
                {activeModeTab === 'advanced' ? (
                  <div className={hideTabs ? 'divide-y divide-border px-4' : 'space-y-3'}>
                    {isGridlock && (
                      <>
                        <SettingsGroupHeader
                          title={t(
                            'settings.gridlock.groupDifficulty',
                            'Difficulty and assistance',
                          )}
                          description={t(
                            'settings.gridlock.groupDifficultyDesc',
                            'Adjust puzzle difficulty and the level of help available during solving.',
                          )}
                        />
                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.gridlock.difficultyLock', 'Difficulty lock')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.difficultyLockDesc',
                                  'Force all puzzles to a specific difficulty tier instead of following the profile curve.',
                                )}
                              </InfoSheet>
                            }
                          >
                            <Select
                              value={gridlockDifficultyLock}
                              onValueChange={(value) =>
                                setModeSetting('gridlockDifficultyLock', value)
                              }
                            >
                              <SelectTrigger className="w-36 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">
                                  {t('settings.gridlock.difficultyAuto', 'Auto (profile)')}
                                </SelectItem>
                                <SelectItem value="beginner">
                                  {t('settings.gridlock.difficultyBeginner', 'Beginner')}
                                </SelectItem>
                                <SelectItem value="easy">
                                  {t('settings.gridlock.difficultyEasy', 'Easy')}
                                </SelectItem>
                                <SelectItem value="medium">
                                  {t('settings.gridlock.difficultyMedium', 'Medium')}
                                </SelectItem>
                                <SelectItem value="hard">
                                  {t('settings.gridlock.difficultyHard', 'Hard')}
                                </SelectItem>
                                <SelectItem value="expert">
                                  {t('settings.gridlock.difficultyExpert', 'Expert')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <SettingRow
                            label={t('settings.gridlock.assistance', 'Assistance level')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.assistanceDesc',
                                  'Scales hint, undo and reset budgets. Generous gives 1.5×, Strict gives 0.5×.',
                                )}
                              </InfoSheet>
                            }
                          >
                            <Select
                              value={gridlockAssistance}
                              onValueChange={(value) => setModeSetting('gridlockAssistance', value)}
                            >
                              <SelectTrigger className="w-36 h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="generous">
                                  {t('settings.gridlock.assistanceGenerous', 'Generous')}
                                </SelectItem>
                                <SelectItem value="balanced">
                                  {t('settings.gridlock.assistanceBalanced', 'Balanced')}
                                </SelectItem>
                                <SelectItem value="strict">
                                  {t('settings.gridlock.assistanceStrict', 'Strict')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </SettingRow>
                        </SettingBlock>

                        <SettingsGroupHeader
                          title={t('settings.gridlock.groupAids', 'In-game aids')}
                          description={t(
                            'settings.gridlock.groupAidsDesc',
                            'Choose what information is visible during play and what happens after a failure.',
                          )}
                        />
                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.gridlock.showMoveCounter', 'Show move counter')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.showMoveCounterDesc',
                                  'Display your current move count and budget during play.',
                                )}
                              </InfoSheet>
                            }
                            checked={gridlockShowMoveCounter}
                            onChange={(enabled) =>
                              setModeSetting('gridlockShowMoveCounter', enabled)
                            }
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.gridlock.showOptimal', 'Show optimal moves')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.showOptimalDesc',
                                  'Display the optimal number of moves for the current puzzle.',
                                )}
                              </InfoSheet>
                            }
                            checked={gridlockShowOptimal}
                            onChange={(enabled) => setModeSetting('gridlockShowOptimal', enabled)}
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.gridlock.autoAdvance', 'Auto-advance')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.autoAdvanceDesc',
                                  'Automatically go to the next puzzle after solving. When off, tap "Next" to proceed.',
                                )}
                              </InfoSheet>
                            }
                            checked={gridlockAutoAdvance}
                            onChange={(enabled) => setModeSetting('gridlockAutoAdvance', enabled)}
                          />
                        </SettingBlock>

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t('settings.gridlock.showSolution', 'Show solution on fail')}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.gridlock.showSolutionDesc',
                                  'Play the optimal solution when you run out of time or moves.',
                                )}
                              </InfoSheet>
                            }
                            checked={gridlockShowSolutionOnFail}
                            onChange={(enabled) =>
                              setModeSetting('gridlockShowSolutionOnFail', enabled)
                            }
                          />
                        </SettingBlock>
                      </>
                    )}

                    {alphaEnabled &&
                      (isAuto || isDualMemo || isDualPlace || isDualPick || isDualTrack) && (
                        <SettingBlock hideTabs={hideTabs}>
                          <ProgressionSelect
                            algorithm={progressionAlgorithm}
                            onAlgorithmChange={setProgressionAlgorithm}
                            sessionCount={sessionCount}
                          />
                        </SettingBlock>
                      )}

                    {alphaEnabled && (isAuto || isDualMemo) && (
                      <div
                        className={`p-3 ${modeColors.bg} border ${modeColors.border} rounded-xl`}
                      >
                        <div className={`text-xs ${modeColors.text}`}>
                          {t('settings.config.adaptiveInfo')}
                        </div>
                      </div>
                    )}

                    {isDualMemo && (
                      <SettingBlock hideTabs={hideTabs}>
                        <Toggle
                          label={t('settings.experimental.randomFillOrder')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.experimental.randomFillOrderDesc',
                                'Fill slots in random order (anti-chunking)',
                              )}
                            </InfoSheet>
                          }
                          checked={randomFillOrder}
                          onChange={(enabled) =>
                            setModeSettingFor(
                              mode,
                              'fillOrderMode',
                              enabled ? 'random' : 'sequential',
                            )
                          }
                          activeColor="visual"
                        />
                      </SettingBlock>
                    )}

                    {isDualPlace && (
                      <SettingBlock hideTabs={hideTabs}>
                        <Toggle
                          label={t('settings.experimental.trialColorCoding')}
                          labelRight={
                            <InfoSheet iconSize={12}>
                              {t(
                                'settings.experimental.trialColorCodingDesc',
                                'Each trial has a distinct color',
                              )}
                            </InfoSheet>
                          }
                          checked={trialColorCoding}
                          onChange={(enabled) =>
                            setModeSettingFor(mode, 'trialColorCoding', enabled)
                          }
                          activeColor="visual"
                        />
                      </SettingBlock>
                    )}

                    {isDualTrace && (
                      <>
                        {activeModalities.length > 1 && (
                          <SettingBlock hideTabs={hideTabs}>
                            <Toggle
                              label={t('settings.trace.dynamicRules')}
                              labelRight={
                                <InfoSheet iconSize={12}>
                                  {t(
                                    'settings.trace.dynamicRulesDesc',
                                    'Active modalities vary per trial',
                                  )}
                                </InfoSheet>
                              }
                              checked={dynamicRules}
                              onChange={setDynamicRules}
                              activeColor="audio"
                            />
                          </SettingBlock>
                        )}

                        {activeModalities.includes('position') && (
                          <SettingBlock hideTabs={hideTabs}>
                            <Toggle
                              label={t('settings.trace.dynamicSwipeDirection')}
                              labelRight={
                                <InfoSheet iconSize={12}>
                                  {t(
                                    'settings.trace.dynamicSwipeDirectionDesc',
                                    'Swipe direction changes every trial (position only)',
                                  )}
                                </InfoSheet>
                              }
                              checked={dynamicSwipeDirection}
                              onChange={setDynamicSwipeDirection}
                              activeColor="visual"
                            />
                          </SettingBlock>
                        )}

                        {rhythmMode === 'self-paced' && (
                          <SettingBlock hideTabs={hideTabs}>
                            <Toggle
                              label={t('settings.trace.sequentialTrace', 'Sequential swipes')}
                              labelRight={
                                <InfoSheet iconSize={12}>
                                  {t(
                                    'settings.trace.sequentialTraceDesc',
                                    'N step-by-step swipes instead of a direct swipe (T→T-N)',
                                  )}
                                </InfoSheet>
                              }
                              checked={sequentialTrace}
                              onChange={setSequentialTrace}
                              activeColor="visual"
                            />
                          </SettingBlock>
                        )}

                        {alphaEnabled && rhythmMode === 'self-paced' && !sequentialTrace && (
                          <>
                            <SettingBlock hideTabs={hideTabs}>
                              <Toggle
                                label={t('settings.trace.mindfulTiming', 'Mindful timing')}
                                labelRight={
                                  <InfoSheet iconSize={12}>
                                    {t(
                                      'settings.trace.mindfulTimingDesc',
                                      'Require a precise duration for swipes, holds and writing.',
                                    )}
                                  </InfoSheet>
                                }
                                checked={mindfulTimingEnabled}
                                onChange={setMindfulTimingEnabled}
                                activeColor="visual"
                              />
                            </SettingBlock>

                            {mindfulTimingEnabled && (
                              <>
                                <SettingBlock hideTabs={hideTabs}>
                                  <EditableSlider
                                    label={t(
                                      'settings.trace.mindfulPositionDuration',
                                      'Gesture / hold target',
                                    )}
                                    value={mindfulPositionDurationMs / 1000}
                                    onChange={(v) => setMindfulPositionDurationMs(v * 1000)}
                                    min={1}
                                    max={6}
                                    step={0.1}
                                    suffix="s"
                                    colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    trackClass="bg-teal-200 dark:bg-teal-500/30"
                                    accentClass="accent-teal-500"
                                  />
                                </SettingBlock>

                                <SettingBlock hideTabs={hideTabs}>
                                  <EditableSlider
                                    label={t(
                                      'settings.trace.mindfulPositionTolerance',
                                      'Gesture tolerance',
                                    )}
                                    value={mindfulPositionToleranceMs}
                                    onChange={setMindfulPositionToleranceMs}
                                    min={50}
                                    max={1000}
                                    step={50}
                                    suffix="ms"
                                    colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    trackClass="bg-teal-200 dark:bg-teal-500/30"
                                    accentClass="accent-teal-500"
                                  />
                                </SettingBlock>

                                <SettingBlock hideTabs={hideTabs}>
                                  <EditableSlider
                                    label={t(
                                      'settings.trace.mindfulWritingDuration',
                                      'Writing target',
                                    )}
                                    value={mindfulWritingDurationMs / 1000}
                                    onChange={(v) => setMindfulWritingDurationMs(v * 1000)}
                                    min={0.5}
                                    max={6}
                                    step={0.1}
                                    suffix="s"
                                    colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    trackClass="bg-teal-200 dark:bg-teal-500/30"
                                    accentClass="accent-teal-500"
                                  />
                                </SettingBlock>

                                <SettingBlock hideTabs={hideTabs}>
                                  <EditableSlider
                                    label={t(
                                      'settings.trace.mindfulWritingTolerance',
                                      'Writing tolerance',
                                    )}
                                    value={mindfulWritingToleranceMs}
                                    onChange={setMindfulWritingToleranceMs}
                                    min={50}
                                    max={1000}
                                    step={50}
                                    suffix="ms"
                                    colorClass="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    trackClass="bg-teal-200 dark:bg-teal-500/30"
                                    accentClass="accent-teal-500"
                                  />
                                </SettingBlock>
                              </>
                            )}
                          </>
                        )}

                        <SettingBlock hideTabs={hideTabs}>
                          <Toggle
                            label={t(
                              'settings.trace.arithmeticInterference',
                              'Arithmetic interference',
                            )}
                            labelRight={
                              <InfoSheet iconSize={12}>
                                {t(
                                  'settings.trace.arithmeticInterferenceDesc',
                                  'Mental math between stimulus and response',
                                )}
                              </InfoSheet>
                            }
                            checked={arithmeticEnabled}
                            onChange={setArithmeticEnabled}
                            activeColor="audio"
                          />
                        </SettingBlock>

                        {arithmeticEnabled && (
                          <SettingBlock hideTabs={hideTabs}>
                            <div className="space-y-3">
                              <div className="flex items-center gap-1 min-w-0">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                                  {t(
                                    'settings.trace.arithmeticInterferenceVariant',
                                    'Interference type',
                                  )}
                                </p>
                                <span className="shrink-0">
                                  <InfoSheet iconSize={12}>
                                    {t(
                                      'settings.trace.arithmeticInterferenceVariantDesc',
                                      'Classic or V/N variant in 2 steps',
                                    )}
                                  </InfoSheet>
                                </span>
                              </div>

                              <Select
                                value={arithmeticInterferenceVariant}
                                onValueChange={(v) =>
                                  setArithmeticInterferenceVariant(
                                    v as 'simple' | 'color-cue-2step' | 'grid-cue-chain',
                                  )
                                }
                              >
                                <SelectTrigger className="w-full h-11">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="simple">
                                    {t('settings.trace.arithVariantSimple')}
                                  </SelectItem>
                                  <SelectItem value="color-cue-2step">
                                    {t('settings.trace.arithVariantVN')}
                                  </SelectItem>
                                  <SelectItem value="grid-cue-chain">
                                    {t('settings.trace.arithVariantGrid')}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </SettingBlock>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      {false && isBrainWorkshop && (
        <>
          <Section title={t('settings.brainworkshop.tempo')}>
            <Card className="space-y-3">
              <SettingBlock hideTabs={hideTabs}>
                <EditableSlider
                  label={t('settings.custom.interval')}
                  labelRight={
                    <InfoSheet iconSize={12}>{t('settings.custom.intervalHint')}</InfoSheet>
                  }
                  value={intervalSeconds}
                  onChange={(v) => {
                    setModeSetting('intervalSeconds', v);
                    if (stimulusDurationSeconds > v) {
                      setModeSetting('stimulusDurationSeconds', v);
                    }
                  }}
                  min={0.5}
                  max={5}
                  step={0.1}
                  suffix="s"
                  colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                  trackClass="bg-slate-200 dark:bg-slate-500/30"
                  accentClass="accent-slate-500"
                />
              </SettingBlock>

              <SettingBlock hideTabs={hideTabs}>
                <EditableSlider
                  label={t('settings.custom.stimulusDuration')}
                  labelRight={
                    <InfoSheet iconSize={12}>
                      {t(
                        'settings.custom.stimulusDurationHint',
                        'Display duration of each stimulus',
                      )}
                    </InfoSheet>
                  }
                  value={stimulusDurationSeconds}
                  onChange={(v) =>
                    setModeSetting('stimulusDurationSeconds', Math.min(v, intervalSeconds))
                  }
                  min={0.2}
                  max={3}
                  step={0.1}
                  suffix="s"
                  colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                  trackClass="bg-slate-200 dark:bg-slate-500/30"
                  accentClass="accent-slate-500"
                />
              </SettingBlock>

              <SettingBlock hideTabs={hideTabs}>
                <Toggle
                  label={t('settings.brainworkshop.selfPaced')}
                  labelRight={
                    <InfoSheet iconSize={12}>
                      {t(
                        'settings.brainworkshop.selfPacedDesc',
                        'Advance manually (Enter) instead of timer',
                      )}
                    </InfoSheet>
                  }
                  checked={selfPaced}
                  onChange={(enabled) => setModeSettingFor(mode, 'selfPaced', enabled)}
                  activeColor="audio"
                />
              </SettingBlock>
            </Card>
          </Section>

          <Section
            title={t('settings.brainworkshop.generator')}
            action={
              <button
                type="button"
                onClick={() => setBrainWorkshopGeneratorOpen((v) => !v)}
                className="ml-auto inline-flex items-center gap-2 h-7 px-2 rounded-lg text-xxs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                aria-expanded={brainWorkshopGeneratorOpen}
              >
                <span>
                  {brainWorkshopGeneratorOpen ? t('common.collapse') : t('common.expand')}
                </span>
                <CaretDown
                  size={14}
                  weight="bold"
                  className={cn(
                    'transition-transform duration-200',
                    brainWorkshopGeneratorOpen ? 'rotate-180' : '',
                  )}
                  aria-hidden="true"
                />
              </button>
            }
          >
            {brainWorkshopGeneratorOpen ? (
              <Card className="space-y-3">
                <SettingBlock hideTabs={hideTabs}>
                  <EditableSlider
                    label={t('settings.brainworkshop.guaranteedMatch')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.guaranteedMatchHint',
                          'Force a correct match (stage 1, 12.5% by default)',
                        )}
                      </InfoSheet>
                    }
                    value={Number((guaranteedMatchProbability * 100).toFixed(2))}
                    onChange={(v) => setModeSettingFor(mode, 'guaranteedMatchProbability', v / 100)}
                    min={0}
                    max={100}
                    step={12.5}
                    suffix="%"
                    colorClass="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    trackClass="bg-emerald-200 dark:bg-emerald-500/30"
                    accentClass="accent-emerald-500"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <EditableSlider
                    label={t('settings.brainworkshop.interference')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.interferenceHint',
                          'Near-miss stimuli (stage 2, 12.5% by default)',
                        )}
                      </InfoSheet>
                    }
                    value={Number((interferenceProbability * 100).toFixed(2))}
                    onChange={(v) => setModeSettingFor(mode, 'interferenceProbability', v / 100)}
                    min={0}
                    max={100}
                    step={12.5}
                    suffix="%"
                    colorClass="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    trackClass="bg-amber-200 dark:bg-amber-500/30"
                    accentClass="accent-amber-500"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <Toggle
                    label={t('settings.brainworkshop.variableNBack')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.variableNBackDesc',
                          'Le N varie pendant la session (distribution beta)',
                        )}
                      </InfoSheet>
                    }
                    checked={variableNBack}
                    onChange={(enabled) => setModeSettingFor(mode, 'variableNBack', enabled)}
                    activeColor="visual"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <Toggle
                    label={t('settings.brainworkshop.crabBack')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.crabBackDesc',
                          'Le N oscille: 1-3-5-1-3-5... (pour 3-back)',
                        )}
                      </InfoSheet>
                    }
                    checked={crabBackMode}
                    onChange={(enabled) => setModeSettingFor(mode, 'crabBackMode', enabled)}
                    activeColor="audio"
                  />
                </SettingBlock>
              </Card>
            ) : null}
          </Section>

          <Section title={t('settings.brainworkshop.multiStimulus')}>
            <Card className="space-y-3">
              <SettingBlock hideTabs={hideTabs}>
                <SettingRow
                  label={t('settings.brainworkshop.multiStimulus')}
                  labelRight={
                    <InfoSheet iconSize={12}>
                      {t(
                        'settings.brainworkshop.multiStimulusDesc',
                        'Number of simultaneous positions (1-4)',
                      )}
                    </InfoSheet>
                  }
                >
                  <Select
                    value={String(multiStimulus)}
                    onValueChange={(v) =>
                      setModeSettingFor(mode, 'multiStimulus', Number(v) as 1 | 2 | 3 | 4)
                    }
                    disabled={forbidsBrainWorkshopMultiStimulus || lockModalities}
                  >
                    <SelectTrigger
                      className={`w-16 h-10 ${
                        forbidsBrainWorkshopMultiStimulus || lockModalities
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((c) => (
                        <SelectItem key={c} value={String(c)}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                {forbidsBrainWorkshopMultiStimulus && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {brainWorkshopHasArithmetic
                      ? t(
                          'settings.brainworkshop.multiStimulusArithmeticDisabled',
                          'Multi-stimulus disabled: incompatible with arithmetic (BW protocol).',
                        )
                      : brainWorkshopHasCombination
                        ? t(
                            'settings.brainworkshop.multiStimulusCombinationDisabled',
                            'Multi-stimulus disabled: incompatible with combined modes (BW protocol).',
                          )
                        : t(
                            'settings.brainworkshop.multiStimulusColorImageDisabled',
                            'Multi-stimulus disabled: incompatible with Color + Image together (BW protocol).',
                          )}
                  </p>
                )}
                {!forbidsBrainWorkshopMultiStimulus &&
                  multiStimulus > 1 &&
                  !activeModalities.includes('color') &&
                  !activeModalities.includes('image') && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(
                        'settings.brainworkshop.multiStimulusHint',
                        'Tip: to get Vis. buttons (G/H/J/K) like Brain Workshop, enable Color or Image in modalities. In multi-stimulus, they will be replaced by Vis. 1–4.',
                      )}
                    </p>
                  )}
              </SettingBlock>

              {multiStimulus > 1 && (
                <SettingBlock hideTabs={hideTabs}>
                  <SettingRow
                    label={t('settings.brainworkshop.multiMode')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.multiModeDesc',
                          'Comment distinguer les stimuli multiples',
                        )}
                      </InfoSheet>
                    }
                  >
                    <Select
                      value={multiMode}
                      onValueChange={(v) =>
                        setModeSettingFor(mode, 'multiMode', v as 'color' | 'image')
                      }
                      disabled={lockModalities}
                    >
                      <SelectTrigger className="w-24 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="color">
                          {t('settings.brainworkshop.multiModeColor')}
                        </SelectItem>
                        <SelectItem value="image">
                          {t('settings.brainworkshop.multiModeImage')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                </SettingBlock>
              )}

              <SettingBlock hideTabs={hideTabs}>
                <SettingRow
                  label={t('settings.brainworkshop.multiAudio')}
                  labelRight={
                    <InfoSheet iconSize={12}>
                      {t(
                        'settings.brainworkshop.multiAudioDesc',
                        'Number of simultaneous sounds (1-2)',
                      )}
                    </InfoSheet>
                  }
                >
                  <Select
                    value={String(multiAudio)}
                    onValueChange={(v) => setModeSettingFor(mode, 'multiAudio', Number(v) as 1 | 2)}
                    disabled={forbidsBrainWorkshopMultiAudio || lockModalities}
                  >
                    <SelectTrigger
                      className={`w-16 h-10 ${
                        forbidsBrainWorkshopMultiAudio || lockModalities
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2].map((c) => (
                        <SelectItem key={c} value={String(c)}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                {forbidsBrainWorkshopMultiAudio && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {brainWorkshopHasArithmetic
                      ? t(
                          'settings.brainworkshop.multiAudioArithmeticDisabled',
                          'Multi-audio disabled: incompatible with arithmetic (BW protocol).',
                        )
                      : t(
                          'settings.brainworkshop.multiAudioCombinationDisabled',
                          'Multi-audio disabled: incompatible with combined modes (BW protocol).',
                        )}
                  </p>
                )}
              </SettingBlock>
            </Card>
          </Section>

          <Section
            title={t('settings.config.advanced')}
            action={
              <button
                type="button"
                onClick={() => setBrainWorkshopAdvancedOpen((v) => !v)}
                className="ml-auto inline-flex items-center gap-2 h-7 px-2 rounded-lg text-xxs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                aria-expanded={brainWorkshopAdvancedOpen}
              >
                <span>{brainWorkshopAdvancedOpen ? t('common.collapse') : t('common.expand')}</span>
                <CaretDown
                  size={14}
                  weight="bold"
                  className={cn(
                    'transition-transform duration-200',
                    brainWorkshopAdvancedOpen ? 'rotate-180' : '',
                  )}
                  aria-hidden="true"
                />
              </button>
            }
          >
            {brainWorkshopAdvancedOpen ? (
              <Card className="space-y-3">
                <SettingBlock hideTabs={hideTabs}>
                  <EditableSlider
                    label={t('settings.brainworkshop.trialsBase')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.trialsBaseHint',
                          'Base count before adding N² (default: 20)',
                        )}
                      </InfoSheet>
                    }
                    value={trialsBase}
                    onChange={(v) => setModeSettingFor(mode, 'trialsBase', v)}
                    min={10}
                    max={50}
                    step={5}
                    colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    trackClass="bg-slate-200 dark:bg-slate-500/30"
                    accentClass="accent-slate-500"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <EditableSlider
                    label={t('settings.brainworkshop.trialsFactor')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.trialsFactorHint',
                          'N^exponent multiplier (default: 1)',
                        )}
                      </InfoSheet>
                    }
                    value={trialsFactor}
                    onChange={(v) => setModeSettingFor(mode, 'trialsFactor', v)}
                    min={0}
                    max={3}
                    step={0.5}
                    colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    trackClass="bg-slate-200 dark:bg-slate-500/30"
                    accentClass="accent-slate-500"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <EditableSlider
                    label={t('settings.brainworkshop.trialsExponent')}
                    labelRight={
                      <InfoSheet iconSize={12}>
                        {t(
                          'settings.brainworkshop.trialsExponentHint',
                          'Power of N (default: 2 → N²)',
                        )}
                      </InfoSheet>
                    }
                    value={trialsExponent}
                    onChange={(v) => setModeSettingFor(mode, 'trialsExponent', v)}
                    min={1}
                    max={3}
                    step={0.5}
                    colorClass="bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    trackClass="bg-slate-200 dark:bg-slate-500/30"
                    accentClass="accent-slate-500"
                  />
                </SettingBlock>

                <SettingBlock hideTabs={hideTabs}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 rounded-xl shrink-0 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                        <Gauge size={18} weight="regular" />
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                          {t('settings.brainworkshop.arithmeticDifficulty')}
                        </p>
                        <span className="shrink-0">
                          <InfoSheet iconSize={12}>
                            {t(
                              'settings.brainworkshop.arithmeticDifficultyDesc',
                              'Choose the allowed operations in calculations.',
                            )}
                          </InfoSheet>
                        </span>
                      </div>
                    </div>

                    <Select
                      value={String(arithmeticDifficulty)}
                      onValueChange={(v) => {
                        const parsed = Number(v);
                        const next =
                          Number.isFinite(parsed) && parsed >= 1 && parsed <= 4
                            ? (parsed as 1 | 2 | 3 | 4)
                            : 4;
                        setModeSettingFor(mode, 'arithmeticDifficulty', next);
                      }}
                    >
                      <SelectTrigger className="w-full h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">
                          {t('settings.brainworkshop.arithmeticLevel1')}
                        </SelectItem>
                        <SelectItem value="2">
                          {t('settings.brainworkshop.arithmeticLevel2')}
                        </SelectItem>
                        <SelectItem value="3">
                          {t('settings.brainworkshop.arithmeticLevel3')}
                        </SelectItem>
                        <SelectItem value="4">
                          {t('settings.brainworkshop.arithmeticLevel4')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </SettingBlock>
              </Card>
            ) : null}
          </Section>
        </>
      )}
    </>
  );
}
