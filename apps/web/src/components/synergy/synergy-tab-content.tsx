import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// useNavigate moved to home play card
import { Brain, Eye, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Disclosure,
  EditableSlider,
  DrawerSheet,
  cn,
} from '@neurodual/ui';
import { useStore } from 'zustand';
// Play logic moved to home play card
import { SettingsSegmentedControl } from '../../pages/settings/components';
import { ModalityMixer } from '../../pages/settings/sections/mode/plugins/shared/modality-mixer';
import {
  getRemainingSynergyLoops,
  useSynergyStore,
  type SynergyConfig,
} from '../../stores/synergy-store';
import { SynergyLoopReport } from './synergy-loop-report';

type NbackModality = SynergyConfig['nbackModality'];
type DualTrackMotionComplexity = SynergyConfig['dualTrackMotionComplexity'];
type DualTrackCrowdingMode = SynergyConfig['dualTrackCrowdingMode'];
type DualTrackSpeedPreset = 'slow' | 'medium' | 'fast';
type DifficultyPreset = 'easy' | 'medium' | 'hard';

const DUAL_TRACK_SPEED_PRESETS: Record<DualTrackSpeedPreset, number> = {
  slow: 120,
  medium: 160,
  fast: 220,
};

const DIFFICULTY_PRESETS: Record<DifficultyPreset, Partial<SynergyConfig>> = {
  easy: {
    dualTrackTrackingSpeedPxPerSec: 120,
    dualTrackCrowdingMode: 'low',
    dualTrackMotionComplexity: 'smooth',
    dualTrackTotalObjects: null,
    dualTrackBallsOffset: -3,
  },
  medium: {
    dualTrackTrackingSpeedPxPerSec: 160,
    dualTrackCrowdingMode: 'standard',
    dualTrackMotionComplexity: 'standard',
    dualTrackTotalObjects: null,
    dualTrackBallsOffset: -1,
  },
  hard: {
    dualTrackTrackingSpeedPxPerSec: 220,
    dualTrackCrowdingMode: 'dense',
    dualTrackMotionComplexity: 'agile',
    dualTrackTotalObjects: null,
    dualTrackBallsOffset: 0,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function detectDifficultyPreset(config: SynergyConfig): DifficultyPreset | null {
  for (const [key, preset] of Object.entries(DIFFICULTY_PRESETS) as [
    DifficultyPreset,
    Partial<SynergyConfig>,
  ][]) {
    const match = Object.entries(preset).every(([k, v]) => config[k as keyof SynergyConfig] === v);
    if (match) return key;
  }
  return null;
}

function speedValueToPreset(value: number): DualTrackSpeedPreset {
  const entries = Object.entries(DUAL_TRACK_SPEED_PRESETS) as [DualTrackSpeedPreset, number][];
  let closestPreset: DualTrackSpeedPreset = 'medium';
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [preset, presetValue] of entries) {
    const distance = Math.abs(value - presetValue);
    if (distance < closestDistance) {
      closestPreset = preset;
      closestDistance = distance;
    }
  }

  return closestPreset;
}

function CycleDiagram({
  topNode,
  bottomNode,
  centerNode,
  arrowColor,
}: {
  topNode: ReactNode;
  bottomNode: ReactNode;
  centerNode?: ReactNode;
  arrowColor: string;
}): ReactNode {
  return (
    <div className="relative h-[230px] w-[300px]">
      <svg className="absolute inset-0" width="300" height="230" viewBox="0 0 300 230" fill="none">
        <defs>
          <marker
            id="synergy-arrow"
            markerWidth="14"
            markerHeight="14"
            refX="1"
            refY="7"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0,0 14,7 0,14" fill={arrowColor} />
          </marker>
        </defs>
        <path
          d="M250 40 C310 80, 310 150, 250 190"
          stroke={arrowColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          markerEnd="url(#synergy-arrow)"
        />
        <path
          d="M50 190 C-10 150, -10 80, 40 40"
          stroke={arrowColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          markerEnd="url(#synergy-arrow)"
        />
      </svg>

      <div className="absolute left-1/2 top-0 -translate-x-1/2">{topNode}</div>
      {centerNode ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {centerNode}
        </div>
      ) : null}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">{bottomNode}</div>
    </div>
  );
}

function LoopProgressRing({
  current,
  total,
  half,
  remaining,
  size = 56,
  strokeWidth = 3,
}: {
  current: number;
  total: number;
  half: boolean;
  remaining: number;
  size?: number;
  strokeWidth?: number;
}): ReactNode {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const steps = total * 2;
  const completedSteps = current * 2 + (half ? 1 : 0);
  const progress = steps > 0 ? completedSteps / steps : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.15)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--woven-correct))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-black leading-none tabular-nums text-foreground">
          {remaining}
        </span>
      </div>
    </div>
  );
}

function SettingsCard({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="rounded-xl bg-white/50 px-3 py-2 dark:bg-white/[0.05] subcard-border">
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function SettingsCardRow({ children }: { children: ReactNode }): ReactNode {
  return <div className="py-2 first:pt-0 last:pb-0">{children}</div>;
}

export function SynergyTabContent(): ReactNode {
  const { t } = useTranslation();
  const phase = useStore(useSynergyStore, (state) => state.phase);
  const config = useStore(useSynergyStore, (state) => state.config);
  const loopIndex = useStore(useSynergyStore, (state) => state.loopIndex);
  const stepIndex = useStore(useSynergyStore, (state) => state.stepIndex);
  const sessionResults = useStore(useSynergyStore, (state) => state.sessionResults);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const { reset, setConfig } = useSynergyStore.getState();
  const controlsLocked = phase === 'running';

  const isTrackActive =
    (phase === 'idle' && stepIndex === 0) || (phase === 'running' && stepIndex === 0);
  const isNbackActive = phase === 'running' && stepIndex === 1;

  const handleLoopsChange = useCallback(
    (delta: number) => {
      if (controlsLocked) return;
      setConfig({ totalLoops: clamp(config.totalLoops + delta, 1, 20) });
    },
    [config.totalLoops, controlsLocked, setConfig],
  );

  const handleDualTrackLevelChange = useCallback(
    (value: number) => {
      if (controlsLocked) return;
      const level = clamp(Math.round(value), 1, 5);
      setConfig({ dualTrackNLevel: level, nbackNLevel: level });
    },
    [controlsLocked, setConfig],
  );

  const handleNbackModalityChange = useCallback(
    (value: NbackModality) => {
      if (controlsLocked) return;
      const dualTrackIdentityMode =
        value === 'color'
          ? 'color'
          : value === 'audio'
            ? 'letter'
            : value === 'image'
              ? 'image'
              : 'classic';
      setConfig({ nbackModality: value, dualTrackIdentityMode });
    },
    [controlsLocked, setConfig],
  );

  if (phase === 'complete') {
    return <SynergyLoopReport config={config} sessionResults={sessionResults} onRestart={reset} />;
  }

  return (
    <div className="relative px-4 pb-1 pt-4">
      <div className="flex justify-center">
        <CycleDiagram
          centerNode={
            phase === 'running' ? (
              <LoopProgressRing
                current={loopIndex}
                total={config.totalLoops}
                half={stepIndex === 1}
                remaining={getRemainingSynergyLoops({ config, loopIndex, stepIndex })}
              />
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-card/85 disabled:opacity-30"
                  disabled={config.totalLoops <= 1}
                  onClick={() => handleLoopsChange(-1)}
                >
                  <MinusIcon size={10} />
                </button>
                <span className="min-w-[2ch] text-center text-xl font-black leading-none tabular-nums text-foreground">
                  {t('home.synergyLoops', 'x{{count}}', {
                    count: config.totalLoops,
                  })}
                </span>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-card/85 disabled:opacity-30"
                  disabled={config.totalLoops >= 20}
                  onClick={() => handleLoopsChange(1)}
                >
                  <PlusIcon size={10} />
                </button>
              </div>
            )
          }
          arrowColor={phase === 'running' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
          topNode={
            <div
              className={cn(
                'flex items-center gap-3 whitespace-nowrap rounded-2xl border px-5 py-3 backdrop-blur-xl transition-colors',
                isTrackActive
                  ? 'border-[hsl(var(--woven-correct)/0.3)] bg-[hsl(var(--woven-correct)/0.06)]'
                  : 'border-border/50 bg-card/60',
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                  isTrackActive ? 'bg-[hsl(var(--woven-correct)/0.15)]' : 'bg-muted/60',
                )}
              >
                <Eye
                  size={26}
                  weight="duotone"
                  className={cn(
                    'transition-colors',
                    isTrackActive ? 'text-[hsl(var(--woven-correct))]' : 'text-muted-foreground',
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-sm font-bold transition-colors',
                  isTrackActive ? 'text-[hsl(var(--woven-correct))]' : 'text-muted-foreground',
                )}
              >
                {t('home.synergy.dualTrackTitle', 'Dual Track')}
              </span>
            </div>
          }
          bottomNode={
            <div
              className={cn(
                'flex items-center gap-3 whitespace-nowrap rounded-2xl border px-5 py-3 backdrop-blur-xl transition-colors',
                isNbackActive
                  ? 'border-[hsl(var(--woven-correct)/0.3)] bg-[hsl(var(--woven-correct)/0.06)]'
                  : 'border-border/50 bg-card/60',
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                  isNbackActive ? 'bg-[hsl(var(--woven-correct)/0.15)]' : 'bg-muted/60',
                )}
              >
                <Brain
                  size={26}
                  weight="duotone"
                  className={cn(
                    'transition-colors',
                    isNbackActive ? 'text-[hsl(var(--woven-correct))]' : 'text-muted-foreground',
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-sm font-bold transition-colors',
                  isNbackActive ? 'text-[hsl(var(--woven-correct))]' : 'text-muted-foreground',
                )}
              >
                {t('home.synergy.nbackTitle', 'N-Back')}
              </span>
            </div>
          }
        />
      </div>

      {/* Footer */}
      <div className="px-4 pb-0 pt-8">
        <div className="space-y-2 px-1 pb-0">
          <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
            {phase === 'running' && (
              <button
                type="button"
                className={cn(
                  'home-footer-pill',
                  confirmReset &&
                    'font-semibold !text-destructive !border-destructive/30 hover:!text-destructive/80',
                )}
                onClick={() => {
                  if (confirmReset) {
                    setConfirmReset(false);
                    reset();
                  } else {
                    setConfirmReset(true);
                  }
                }}
                onBlur={() => setConfirmReset(false)}
              >
                {confirmReset
                  ? t('home.synergyResetConfirm', 'Confirm reset?')
                  : t('home.synergyReset', 'Reset')}
              </button>
            )}
            <DrawerSheet
              srTitle={t('home.synergy.loopInfoTitle', 'How it works')}
              trigger={
                <button type="button" className="home-footer-pill">
                  {t('home.synergy.loopInfoTitle', 'How it works')}
                </button>
              }
            >
              <div className="space-y-4 text-muted-foreground typo-body">
                <p>
                  <span className="font-semibold text-foreground">
                    {t('home.synergy.loopInfoIdeaLabel', 'The idea')}
                  </span>
                  {' — '}
                  {t(
                    'home.synergy.loopInfoIdea',
                    'Dual Track (Multiple Object Tracking) trains sustained attention, N-Back trains working memory. By chaining them on the same sensory channel, each task sets the stage for the next: the focus sharpened by Dual Track feeds directly into memorization, and vice versa.',
                  )}
                </p>
                <p>
                  <span className="font-semibold text-foreground">
                    {t('home.synergy.loopInfoChannelLabel', 'One channel')}
                  </span>
                  {' — '}
                  {t(
                    'home.synergy.loopInfoChannel',
                    'Both activities share the same sense: visual (position + colors) or audio (spoken letters). This direct link between tasks encourages transfer from one exercise to the other.',
                  )}
                </p>
                <p>
                  <span className="font-semibold text-foreground">
                    {t('home.synergy.loopInfoFlowLabel', 'The flow')}
                  </span>
                  {' — '}
                  {t(
                    'home.synergy.loopInfoFlow',
                    'You set the number of rounds (1 round = 1 Dual Track + 1 N-Back). Games follow each other seamlessly. Reports are available game by game in your history.',
                  )}
                </p>
              </div>
            </DrawerSheet>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="home-footer-pill"
            >
              {t('home.synergy.settings', 'Settings')}
            </button>
          </div>
        </div>
      </div>
      {/* Play button moved to home play card */}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader className="mb-5 text-left">
            <DialogTitle>{t('home.synergy.settings', 'Settings')}</DialogTitle>
            <DialogDescription>
              {t(
                'home.synergy.settingsDescription',
                'Adjust Dual Track and N-Back together before starting the loop.',
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {/* Top-level controls: level, modality, difficulty */}
            <SettingsCard>
              <SettingsCardRow>
                <EditableSlider
                  label={t('home.synergy.nback.level', 'N-Level')}
                  value={config.dualTrackNLevel}
                  min={1}
                  max={5}
                  step={1}
                  disabled={controlsLocked}
                  onChange={handleDualTrackLevelChange}
                />
              </SettingsCardRow>

              <SettingsCardRow>
                <ModalityMixer
                  activeModalities={[config.nbackModality]}
                  disabled={controlsLocked}
                  hiddenModalities={['arithmetic', 'visvis', 'visaudio', 'audiovis']}
                  onToggle={(modality) => {
                    if (
                      modality === 'position' ||
                      modality === 'audio' ||
                      modality === 'color' ||
                      modality === 'image'
                    ) {
                      handleNbackModalityChange(modality);
                    }
                  }}
                />
              </SettingsCardRow>
            </SettingsCard>

            {!controlsLocked ? (
              <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2">
                <span className="text-sm font-medium text-foreground">
                  {t('home.synergy.difficultyPreset', 'Difficulty')}
                </span>
                <SettingsSegmentedControl<DifficultyPreset | 'custom'>
                  value={detectDifficultyPreset(config) ?? 'custom'}
                  className="w-fit"
                  onChange={(value) => {
                    if (value !== 'custom') setConfig(DIFFICULTY_PRESETS[value]);
                  }}
                  options={[
                    { value: 'easy', label: t('home.synergy.presetEasy', 'Easy') },
                    { value: 'medium', label: t('home.synergy.presetMedium', 'Medium') },
                    { value: 'hard', label: t('home.synergy.presetHard', 'Hard') },
                  ]}
                />
              </div>
            ) : null}
            <Disclosure
              title={t('home.synergy.dualTrackTitle', 'Dual Track')}
              icon={<Eye size={16} weight="duotone" className="text-muted-foreground" />}
              badge={
                controlsLocked ? (
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {t('common.locked', 'Locked')}
                  </span>
                ) : undefined
              }
              lazy
            >
              <div className="space-y-2 px-1 pb-1">
                <SettingsCard>
                  <SettingsCardRow>
                    <EditableSlider
                      label={t('home.synergy.dualTrack.duration', 'Tracking duration')}
                      value={config.dualTrackTrackingDurationMs}
                      min={3000}
                      max={15000}
                      step={500}
                      suffix=" ms"
                      disabled={controlsLocked}
                      onChange={(value) =>
                        setConfig({
                          dualTrackTrackingDurationMs: clamp(Math.round(value), 3000, 15000),
                        })
                      }
                    />
                  </SettingsCardRow>

                  <SettingsCardRow>
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        {t('home.synergy.dualTrack.speed', 'Speed')}
                      </span>
                      <SettingsSegmentedControl<DualTrackSpeedPreset>
                        value={speedValueToPreset(config.dualTrackTrackingSpeedPxPerSec)}
                        disabled={controlsLocked}
                        className="w-fit max-w-full"
                        onChange={(value) =>
                          setConfig({
                            dualTrackTrackingSpeedPxPerSec: DUAL_TRACK_SPEED_PRESETS[value],
                          })
                        }
                        options={[
                          { value: 'slow', label: t('home.synergy.dualTrack.speedSlow', 'Slow') },
                          {
                            value: 'medium',
                            label: t('home.synergy.dualTrack.speedMedium', 'Medium'),
                          },
                          { value: 'fast', label: t('home.synergy.dualTrack.speedFast', 'Fast') },
                        ]}
                      />
                    </div>
                  </SettingsCardRow>

                  <SettingsCardRow>
                    <EditableSlider
                      label={t('home.synergy.dualTrack.rounds', 'Rounds')}
                      value={config.dualTrackTrialsCount}
                      min={3}
                      max={30}
                      step={1}
                      disabled={controlsLocked}
                      onChange={(value) =>
                        setConfig({ dualTrackTrialsCount: clamp(Math.round(value), 3, 30) })
                      }
                    />
                  </SettingsCardRow>

                  <SettingsCardRow>
                    <EditableSlider
                      label={
                        config.dualTrackTotalObjects
                          ? t('home.synergy.dualTrack.totalObjects', 'Balls: {{count}}', {
                              count: config.dualTrackTotalObjects,
                            })
                          : t('home.synergy.dualTrack.totalObjectsAuto', 'Balls: Auto')
                      }
                      value={config.dualTrackTotalObjects ?? 0}
                      min={0}
                      max={20}
                      step={1}
                      disabled={controlsLocked}
                      onChange={(value) =>
                        setConfig({
                          dualTrackTotalObjects:
                            Math.round(value) <= 0 ? null : clamp(Math.round(value), 4, 20),
                        })
                      }
                    />
                  </SettingsCardRow>
                </SettingsCard>

                <SettingsCard>
                  <SettingsCardRow>
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        {t('home.synergy.dualTrack.proximity', 'Proximity')}
                      </span>
                      <SettingsSegmentedControl<DualTrackCrowdingMode>
                        value={config.dualTrackCrowdingMode}
                        disabled={controlsLocked}
                        className="w-fit max-w-full"
                        onChange={(value) => setConfig({ dualTrackCrowdingMode: value })}
                        options={[
                          {
                            value: 'low',
                            label: t('home.synergy.dualTrack.proximityLow', 'Low'),
                          },
                          {
                            value: 'standard',
                            label: t('home.synergy.dualTrack.proximityStandard', 'Standard'),
                          },
                          {
                            value: 'dense',
                            label: t('home.synergy.dualTrack.proximityDense', 'Dense'),
                          },
                        ]}
                      />
                    </div>
                  </SettingsCardRow>

                  <SettingsCardRow>
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        {t('home.synergy.dualTrack.motion', 'Motion complexity')}
                      </span>
                      <SettingsSegmentedControl<DualTrackMotionComplexity>
                        value={config.dualTrackMotionComplexity}
                        disabled={controlsLocked}
                        className="w-fit max-w-full"
                        onChange={(value) => setConfig({ dualTrackMotionComplexity: value })}
                        options={[
                          {
                            value: 'smooth',
                            label: t('home.synergy.dualTrack.motionSmooth', 'Smooth'),
                          },
                          {
                            value: 'standard',
                            label: t('home.synergy.dualTrack.motionStandard', 'Standard'),
                          },
                          {
                            value: 'agile',
                            label: t('home.synergy.dualTrack.motionAgile', 'Agile'),
                          },
                        ]}
                      />
                    </div>
                  </SettingsCardRow>
                </SettingsCard>
              </div>
            </Disclosure>

            <Disclosure
              title={t('home.synergy.nbackTitle', 'N-Back')}
              icon={<Brain size={16} weight="duotone" className="text-muted-foreground" />}
              badge={
                controlsLocked ? (
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {t('common.locked', 'Locked')}
                  </span>
                ) : undefined
              }
              lazy
            >
              <div className="space-y-2 px-1 pb-1">
                <SettingsCard>
                  <SettingsCardRow>
                    <EditableSlider
                      label={t('home.synergy.nback.trials', 'Trials')}
                      value={config.nbackTrialsCount}
                      min={10}
                      max={40}
                      step={1}
                      disabled={controlsLocked}
                      onChange={(value) =>
                        setConfig({ nbackTrialsCount: clamp(Math.round(value), 10, 40) })
                      }
                    />
                  </SettingsCardRow>
                </SettingsCard>
              </div>
            </Disclosure>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
