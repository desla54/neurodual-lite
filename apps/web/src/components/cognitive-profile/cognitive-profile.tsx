/**
 * CognitiveProfile — report-like profile sheet.
 *
 * Design rules applied:
 * - profile reads like a personal revision sheet rather than a dashboard
 * - identity, action, overview, and modality sections are clearly separated
 * - only the action card carries a stronger accent color
 * - report surfaces reuse the woven paper language from end-of-session reports
 */

import {
  AVATARS,
  Avatar,
  Hatching,
  cn,
  useAuthQuery,
  useMountEffect,
  useEffectiveUserId,
} from '@neurodual/ui';
import { usePowerSyncWatch } from '../../hooks/use-powersync-watch';
import {
  ArrowsClockwise,
  ArrowsOutCardinal,
  BookOpenText,
  Brain,
  Eye,
  Fingerprint,
  GearSix,
  GridNine,
  Minus,
  MusicNote,
  NumberSquareEight,
  Palette,
  PencilLine,
  Play,
  Plus,
  Shapes,
  Smiley,
  TextAa,
  TrendDown,
  TrendUp,
  X,
  type IconProps,
} from '@phosphor-icons/react';
import {
  getActiveGameModeConfigs,
  getGameModeConfig,
  getCalibrationProgress,
  getCurrentCalibrationStep,
  isCalibrationCompleteWithExclusions,
  pickNextTrainingSession,
  buildCalibrationPlayConfig,
  getCalibrationStepScore,
  getSharedModalityLevel,
  getModalityEvidenceStatus,
  CALIBRATION_MODALITY_LABELS,
  type CalibrationModality,
  type ModalityEvidenceStatus,
  CALIBRATION_MAX_LEVEL,
  CALIBRATION_SEQUENCE,
  START_LEVEL,
  type CalibrationGameModeConfig,
} from '@neurodual/logic';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useCalibrationActions } from '../../hooks/use-calibration-actions';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ConfirmationDialog } from '../confirmation-dialog';
import {
  createCalibrationPlayIntent,
  createProfileTrainingPlayIntent,
} from '../../lib/play-intent';
import { useCognitiveProfileProjection } from '../../hooks/use-cognitive-profile-projection';
import { useSettingsStore } from '../../stores/settings-store';

// ─── Game mode icon resolver ─────────────────────────────────────────────────

const GAME_MODE_ICON_MAP: Record<CalibrationGameModeConfig['iconKey'], ComponentType<IconProps>> = {
  brain: Brain,
  eye: Eye,
  fingerprint: Fingerprint,
  'pencil-line': PencilLine,
};

function GameModeIcon({
  config,
  size = 14,
}: {
  config: CalibrationGameModeConfig;
  size?: number;
}): ReactNode {
  const Icon = GAME_MODE_ICON_MAP[config.iconKey];
  return <Icon size={size} weight="duotone" />;
}

// ─── Data ────────────────────────────────────────────────────────────────────

interface ModalityData {
  readonly key: string;
  readonly labelKey: string;
  readonly fallbackLabel: string;
  readonly icon: ComponentType<IconProps>;
  /** Overall score for radar/global (0-100, level + progress combined) */
  readonly primaryScore: number;
  readonly secondaryScore: number;
  /** Progress toward next level for bars (0-100, progressToNext only) */
  readonly primaryProgress: number;
  readonly secondaryProgress: number;
  readonly nLevel: number;
  readonly trend: number;
  readonly evidenceStatus: ModalityEvidenceStatus;
}

type ModalityStatus = 'neutral' | 'strongest' | 'focus';
type ModalityDefinition = Pick<ModalityData, 'key' | 'labelKey' | 'fallbackLabel' | 'icon'>;

/** Empty modality definitions — scores come from calibration store */
/** Ordered by calibration importance (matches CALIBRATION_MODALITIES) */
const MODALITY_DEFS: ModalityDefinition[] = [
  {
    key: 'position',
    labelKey: 'modality.position',
    fallbackLabel: 'Position',
    icon: GridNine,
  },
  {
    key: 'letters',
    labelKey: 'cognitive.modality.letters',
    fallbackLabel: 'Lettres',
    icon: TextAa,
  },
  {
    key: 'color',
    labelKey: 'cognitive.modality.color',
    fallbackLabel: 'Couleurs',
    icon: Palette,
  },
  { key: 'shape', labelKey: 'cognitive.modality.shape', fallbackLabel: 'Formes', icon: Shapes },
  {
    key: 'spatial',
    labelKey: 'modality.spatial',
    fallbackLabel: 'Spatial',
    icon: ArrowsOutCardinal,
  },
  {
    key: 'numbers',
    labelKey: 'cognitive.modality.numbers',
    fallbackLabel: 'Chiffres',
    icon: NumberSquareEight,
  },
  {
    key: 'emotions',
    labelKey: 'cognitive.modality.emotions',
    fallbackLabel: 'Émotions',
    icon: Smiley,
  },
  {
    key: 'semantic',
    labelKey: 'cognitive.modality.semantic',
    fallbackLabel: 'Mots',
    icon: BookOpenText,
  },
  {
    key: 'tones',
    labelKey: 'cognitive.modality.tones',
    fallbackLabel: 'Tonalités',
    icon: MusicNote,
  },
];
const RADAR_ICON_SIZE = 16;

// ─── Animated Number ─────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }): ReactNode {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = value / 75;
    const id = setInterval(() => {
      current += step;
      if (current >= value) {
        setDisplay(value);
        clearInterval(id);
      } else {
        setDisplay(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <>{display}</>;
}

// ─── Dot Rating ──────────────────────────────────────────────────────────────

function DotRating({ value }: { value: number }): ReactNode {
  return (
    <div className="flex gap-1">
      {Array.from({ length: CALIBRATION_MAX_LEVEL }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'size-1.5 rounded-full transition-colors duration-300',
            i < value ? 'bg-foreground' : 'bg-muted-foreground/20',
          )}
          style={{ transitionDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

// ─── Dual Progress Bar ───────────────────────────────────────────────────────

/** Resolve bar fill class locally so Tailwind can scan it (packages/logic strings are invisible to the scanner). */
const BAR_FILL_CLASS: Record<string, string> = {
  'dual-track': 'bg-foreground/50',
  nback: 'bg-foreground/70',
  'dual-trace': 'bg-foreground/70',
};

function DualProgressBar({
  primaryValue,
  secondaryValue,
  delay = 0,
}: {
  primaryValue: number;
  secondaryValue: number;
  delay?: number;
}): ReactNode {
  const [pw, setPw] = useState(0);
  const [sw, setSw] = useState(0);
  const [primaryConfig, secondaryConfig] = getActiveGameModeConfigs();

  useEffect(() => {
    const t1 = setTimeout(() => setPw(primaryValue), 100 + delay);
    const t2 = setTimeout(() => setSw(secondaryValue), 200 + delay);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [primaryValue, secondaryValue, delay]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <GameModeIcon config={primaryConfig} />
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-woven-border/60 bg-woven-bg/65">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-1000 ease-out',
              BAR_FILL_CLASS[primaryConfig.id] ?? 'bg-foreground/50',
            )}
            style={{ width: `${pw}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <GameModeIcon config={secondaryConfig} />
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-woven-border/60 bg-woven-bg/65">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-1000 ease-out',
              BAR_FILL_CLASS[secondaryConfig.id] ?? 'bg-foreground/70',
            )}
            style={{ width: `${sw}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Circular Score ──────────────────────────────────────────────────────────

function CircularScore({ score, size = 110 }: { score: number; size?: number }): ReactNode {
  const { t } = useTranslation();
  const [animScore, setAnimScore] = useState(0);
  const strokeWidth = 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const id = setTimeout(() => setAnimScore(score), 200);
    return () => clearTimeout(id);
  }, [score]);

  const offset = circumference - (animScore / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-[1200ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums leading-none text-foreground">
          {score > 0 ? <AnimatedNumber value={score} /> : '—'}
        </span>
        <span className="mt-1 text-[9px] font-medium tracking-wider uppercase text-muted-foreground">
          {t('cognitive.scoreLabel', 'Score')}
        </span>
      </div>
    </div>
  );
}

// ─── Radar Chart ─────────────────────────────────────────────────────────────

function RadarChart({ data, size = 170 }: { data: ModalityData[]; size?: number }): ReactNode {
  const center = size / 2;
  const radius = size / 2 - 24;
  const angleStep = (2 * Math.PI) / data.length;
  const [progress, setProgress] = useState(0);
  const frameRef = useRef(0);

  useMountEffect(() => {
    let start: number | null = null;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 1200, 1);
      setProgress(p);
      if (p < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  });

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * radius * progress;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const avgScores = data.map((d) => Math.round((d.primaryScore + d.secondaryScore) / 2));
  const gridLevels = [25, 50, 75, 100];
  const points = avgScores.map((s, i) => getPoint(i, s));
  const pathD = `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}Z`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => {
        const pts = data.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const r = (level / 100) * radius;
          return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
        });
        return (
          <polygon
            key={level}
            points={pts.join(' ')}
            fill="none"
            stroke="hsl(var(--muted-foreground) / 0.2)"
            strokeWidth={0.5}
          />
        );
      })}
      {data.map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(angle)}
            y2={center + radius * Math.sin(angle)}
            stroke="hsl(var(--muted-foreground) / 0.2)"
            strokeWidth={0.5}
          />
        );
      })}
      <path
        d={pathD}
        fill="hsl(var(--foreground) / 0.14)"
        stroke="hsl(var(--foreground) / 0.5)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {points.map((p, i) => {
        if (!data[i]) return null;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="hsl(var(--foreground))"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
          />
        );
      })}
      {data.map((d, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const labelR = radius + 14;
        const x = center + labelR * Math.cos(angle) - RADAR_ICON_SIZE / 2;
        const y = center + labelR * Math.sin(angle) - RADAR_ICON_SIZE / 2;
        const Icon = d.icon;
        return (
          <foreignObject key={i} x={x} y={y} width={RADAR_ICON_SIZE} height={RADAR_ICON_SIZE}>
            <Icon size={RADAR_ICON_SIZE} weight="duotone" className="text-muted-foreground" />
          </foreignObject>
        );
      })}
    </svg>
  );
}

// ─── Modality Card ───────────────────────────────────────────────────────────

function ModalityCard({
  mod,
  index,
  status,
  enabled,
  editing,
  isLastEnabled,
  onToggle,
}: {
  mod: ModalityData;
  index: number;
  status: ModalityStatus;
  enabled: boolean;
  editing: boolean;
  isLastEnabled: boolean;
  onToggle: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = mod.icon;
  const hasCalibratedLevel = mod.nLevel >= START_LEVEL;
  const nextLevel =
    hasCalibratedLevel && mod.nLevel < CALIBRATION_MAX_LEVEL ? mod.nLevel + 1 : null;
  const statusLabel =
    status === 'strongest'
      ? t('cognitive.modality.strongest', 'Point fort')
      : status === 'focus'
        ? t('cognitive.modality.focus', 'À renforcer')
        : null;
  const progressLabel = !hasCalibratedLevel
    ? t('cognitive.modality.pendingLabel', 'À calibrer')
    : nextLevel != null
      ? t('cognitive.modality.progressLabel', 'N-{{level}}', { level: nextLevel })
      : t('cognitive.modality.progressMaxLabel', 'Niveau max');

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-3 first:pt-1.5 last:pb-1.5 transition-opacity duration-200 overflow-hidden',
        status === 'strongest' && enabled && 'rounded-xl bg-woven-bg/65',
        status === 'focus' && enabled && 'rounded-xl bg-woven-bg/45',
        !enabled && 'opacity-40',
      )}
    >
      {/* Toggle — slides in from left when editing */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isLastEnabled}
        onClick={onToggle}
        className={cn(
          'shrink-0 transition-all duration-300 ease-out',
          editing ? 'w-10 opacity-100 mr-0' : 'w-0 opacity-0 -mr-3 pointer-events-none',
          isLastEnabled && 'cursor-not-allowed opacity-30',
        )}
      >
        <span
          className={cn(
            'relative block w-10 h-6 rounded-full transition-colors border shrink-0',
            enabled
              ? 'bg-primary border-primary/40'
              : 'bg-foreground/10 dark:bg-white/[0.10] border-border/60',
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              'absolute top-1 left-1 w-4 h-4 rounded-full bg-background shadow transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      </button>

      {/* Icon in glass circle — same as synergy nodes */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-woven-border/50 bg-woven-bg/70">
        <span className="flex size-6 items-center justify-center">
          <Icon size={21} weight="duotone" className="text-muted-foreground" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {/* Title + status */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">
            {t(mod.labelKey, mod.fallbackLabel)}
          </span>
          <div className="flex items-center gap-2">
            {enabled && statusLabel && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {statusLabel}
              </span>
            )}
            {!enabled && (
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                {t('cognitive.modality.disabledLabel', 'Désactivée')}
              </span>
            )}
            {enabled && mod.trend !== 0 && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
                  mod.trend > 0
                    ? 'text-[hsl(var(--woven-correct))]'
                    : 'text-[hsl(var(--woven-incorrect))]',
                )}
              >
                {mod.trend > 0 ? (
                  <TrendUp size={12} weight="bold" />
                ) : (
                  <TrendDown size={12} weight="bold" />
                )}
                {Math.abs(mod.trend)}%
              </span>
            )}
          </div>
        </div>

        {enabled && (
          <>
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>{t('cognitive.modality.levelLabel', 'Niveau')}</span>
                <DotRating value={mod.nLevel} />
              </div>
              <span>{progressLabel}</span>
            </div>

            {/* Dual bars — progress toward next level */}
            <DualProgressBar
              primaryValue={mod.primaryProgress}
              secondaryValue={mod.secondaryProgress}
              delay={index * 80}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Bar Chart (fallback for < 3 modalities) ─────────────────────────────────

function ModalityBarChart({ data }: { data: ModalityData[] }): ReactNode {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setProgress(1), 200);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="w-full space-y-3">
      {data.map((mod) => {
        const Icon = mod.icon;
        const avg = Math.round((mod.primaryScore + mod.secondaryScore) / 2);
        return (
          <div key={mod.key} className="flex items-center gap-2.5">
            <Icon size={16} weight="duotone" className="text-muted-foreground shrink-0" />
            <span className="w-16 shrink-0 truncate text-[11px] font-medium text-foreground">
              {t(mod.labelKey, mod.fallbackLabel)}
            </span>
            <div className="flex-1 h-3 rounded-full border border-woven-border/60 bg-woven-bg/65 overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/50 transition-[width] duration-1000 ease-out"
                style={{ width: `${avg * progress}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">
              {avg > 0 ? avg : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calibration helpers ─────────────────────────────────────────────────────

const CALIBRATION_MODALITY_ICONS: Record<CalibrationModality, ComponentType<IconProps>> = {
  position: GridNine,
  shape: Shapes,
  color: Palette,
  letters: TextAa,
  spatial: ArrowsOutCardinal,
  numbers: NumberSquareEight,
  emotions: Smiley,
  semantic: BookOpenText,
  tones: MusicNote,
};

function CurrentStepIcon({ modality }: { modality: CalibrationModality }): ReactNode {
  const Icon = CALIBRATION_MODALITY_ICONS[modality];
  if (!Icon) return null;
  return <Icon size={14} weight="duotone" />;
}

// ─── Next Training Card ──────────────────────────────────────────────────────

function NextTrainingCard({
  profileProjection,
  calibrationState,
  navigate,
  excludeModalities,
  onManageModalities,
  isManagingModalities,
}: {
  profileProjection: {
    nextRecommendedSession: import('@neurodual/logic').NextTrainingSession | null;
    recentStepKeys: string[];
  };
  calibrationState: import('@neurodual/logic').CalibrationState;
  navigate: ReturnType<typeof import('react-router').useNavigate>;
  excludeModalities?: readonly string[];
  onManageModalities: () => void;
  isManagingModalities: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const precomputed = profileProjection.nextRecommendedSession;
  const isPrecomputedExcluded = precomputed && excludeModalities?.includes(precomputed.modality);
  const nextSession =
    !precomputed || isPrecomputedExcluded
      ? pickNextTrainingSession(
          calibrationState.results,
          profileProjection.recentStepKeys,
          excludeModalities,
        )
      : precomputed;
  if (!nextSession) return null;

  const modeConfig = getGameModeConfig(nextSession.gameMode);
  const modalityLabel = CALIBRATION_MODALITY_LABELS[nextSession.modality];
  const ModalityIcon = CALIBRATION_MODALITY_ICONS[nextSession.modality];
  if (!ModalityIcon) return null;

  const calConfig = buildCalibrationPlayConfig(
    nextSession.modality,
    nextSession.gameMode,
    nextSession.level,
  );
  if (!calConfig) return null;

  const reasonLabel =
    nextSession.reason === 'weakest'
      ? t('cognitive.training.reasonWeakest', 'Point faible')
      : nextSession.reason === 'catch-up'
        ? t('cognitive.training.reasonCatchUp', 'Rattrapage')
        : nextSession.reason === 'master'
          ? t('cognitive.training.reasonMaster', 'Maîtrise N-5')
          : nextSession.reason === 'training'
            ? t('cognitive.training.reasonTraining', 'Entraînement')
            : t('cognitive.training.reasonMaintain', 'Maintien');

  return (
    <>
      <div className="-mx-2 px-[1px] py-[1px] rounded-2xl overflow-hidden">
        <div className="bg-woven-correct/[0.06] px-4 py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('cognitive.training.label', 'Prochaine session')}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {reasonLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-woven-border/50 bg-woven-bg/70">
              <ModalityIcon size={22} weight="duotone" className="text-foreground/70" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">{modalityLabel}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <GameModeIcon config={modeConfig} size={12} />
                <span>{modeConfig.label}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>N-{nextSession.level}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                navigate(modeConfig.route, { state: createProfileTrainingPlayIntent(calConfig) });
              }}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-95"
            >
              <Play size={20} weight="fill" />
            </button>
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-center">
        <button
          type="button"
          onClick={onManageModalities}
          className="text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          {isManagingModalities
            ? t('cognitive.validateModalities', 'Valider les modalités choisies')
            : t('cognitive.customizeModalities', 'Personnaliser les modalités entraînées')}
        </button>
      </div>
      <Hatching id="profile-training-hatch" className="text-foreground/70" />
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface CognitiveProfileProps {
  readonly onClose?: () => void;
}

export function CognitiveProfile({ onClose }: CognitiveProfileProps): ReactNode {
  const { t } = useTranslation();
  const authState = useAuthQuery();
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const setLocalDisplayName = useSettingsStore((s) => s.setLocalDisplayName);
  const setLocalAvatarId = useSettingsStore((s) => s.setLocalAvatarId);
  const disabledCalibrationModalities = useSettingsStore((s) => s.ui.disabledCalibrationModalities);
  const toggleCalibrationModality = useSettingsStore((s) => s.toggleCalibrationModality);
  const calibrationMaxLevel = useSettingsStore((s) => s.ui.calibrationMaxLevel);
  const setCalibrationMaxLevel = useSettingsStore((s) => s.setCalibrationMaxLevel);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showModalityManager, setShowModalityManager] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const modalitiesSectionRef = useRef<HTMLDivElement>(null);
  const confirmationWord = t('settings.data.confirmationWord', 'SUPPRIMER').toUpperCase();

  const authProfile = authState.status === 'authenticated' ? authState.profile : null;
  const displayName =
    authProfile?.username ?? localDisplayName ?? t('cognitive.defaultName', 'Joueur');
  const avatarId = authProfile?.avatarId ?? localAvatarId ?? 'glasses';
  const userId = useEffectiveUserId();
  const calibrationActions = useCalibrationActions(userId);

  const navigate = useNavigate();
  const profileSessionsQuery = usePowerSyncWatch<{ profile_sessions_count: number }>(
    `SELECT profile_sessions_count FROM user_stats_projection WHERE user_id IN (?, 'local') LIMIT 1`,
    [userId],
  );
  const profileSessionsCount = profileSessionsQuery.data[0]?.profile_sessions_count ?? 0;
  const profileProjection = useCognitiveProfileProjection(userId);
  const calibrationState = profileProjection.calibrationState;
  const calibrationProgress = getCalibrationProgress(
    calibrationState,
    disabledCalibrationModalities,
  );
  const hasStartedCalibration = calibrationState.phase !== 'idle' || calibrationProgress > 0;
  const isCalibrationComplete = isCalibrationCompleteWithExclusions(
    calibrationState,
    disabledCalibrationModalities,
  );
  const currentStep = getCurrentCalibrationStep(calibrationState, disabledCalibrationModalities);
  const nextStepPreview =
    currentStep ??
    CALIBRATION_SEQUENCE.find(
      (s, i) =>
        i >= calibrationState.currentStepIndex &&
        !disabledCalibrationModalities.includes(s.modality),
    ) ??
    null;

  // Build modality data from calibration store (empty until calibrated)
  // Score = mastered level as percentage of max, plus fractional progress toward next
  const [primaryModeConfig, secondaryModeConfig] = getActiveGameModeConfigs();
  const modalities: ModalityData[] = MODALITY_DEFS.map((def) => {
    const primaryKey = `${def.key}:${primaryModeConfig.id}`;
    const secondaryKey = `${def.key}:${secondaryModeConfig.id}`;
    const primaryResult = calibrationState.results[primaryKey];
    const secondaryResult = calibrationState.results[secondaryKey];
    const primaryScore = getCalibrationStepScore(primaryResult);
    const secondaryScore = getCalibrationStepScore(secondaryResult);
    return {
      ...def,
      primaryScore,
      secondaryScore,
      primaryProgress: primaryResult?.progressToNext ?? 0,
      secondaryProgress: secondaryResult?.progressToNext ?? 0,
      nLevel: getSharedModalityLevel(primaryResult, secondaryResult),
      trend: 0,
      evidenceStatus: getModalityEvidenceStatus(
        profileProjection.modalitySources[primaryKey]?.source,
        profileProjection.modalitySources[secondaryKey]?.source,
      ),
    };
  });
  const scoredModalities = modalities
    .map((modality, index) => ({
      index,
      score: Math.round((modality.primaryScore + modality.secondaryScore) / 2),
    }))
    .filter(({ score }) => score > 0);
  const modalityAverages = scoredModalities.map(({ score }) => score);
  // Check if all scores are the same (no meaningful strongest/weakest)
  const hasScores = modalityAverages.length > 0;
  const allScoresEqual = hasScores && new Set(modalityAverages).size <= 1;
  const strongestModalityIndex =
    hasScores && !allScoresEqual
      ? scoredModalities.reduce((bestIndex, entry) => {
          const bestEntry = scoredModalities.find(({ index }) => index === bestIndex);
          const bestScore = bestEntry?.score ?? Number.NEGATIVE_INFINITY;
          return entry.score > bestScore ? entry.index : bestIndex;
        }, scoredModalities[0]?.index ?? -1)
      : -1;
  const focusModalityIndex =
    hasScores && !allScoresEqual
      ? scoredModalities.reduce((focusIndex, entry) => {
          if (entry.index === strongestModalityIndex) return focusIndex;
          if (focusIndex === strongestModalityIndex || focusIndex < 0) return entry.index;
          const focusEntry = scoredModalities.find(({ index }) => index === focusIndex);
          const focusScore = focusEntry?.score ?? Number.POSITIVE_INFINITY;
          return entry.score < focusScore ? entry.index : focusIndex;
        }, -1)
      : -1;
  const activeCalibrationSteps = CALIBRATION_SEQUENCE.filter(
    (s) => !disabledCalibrationModalities.includes(s.modality),
  );
  const completedCalibrationSteps = activeCalibrationSteps.filter((step) => {
    const key = `${step.modality}:${step.gameMode}`;
    return calibrationState.results[key]?.masteredLevel != null;
  }).length;
  const remainingCalibrationSteps = Math.max(
    activeCalibrationSteps.length - completedCalibrationSteps,
    0,
  );
  const globalScore = profileProjection.globalScore;

  const handleCalibrationPlay = useCallback(() => {
    const step = currentStep ?? nextStepPreview;
    if (!step) return;

    const key = `${step.modality}:${step.gameMode}`;
    const stepResult = calibrationState.results[key];
    const currentLevel = stepResult?.currentLevel ?? START_LEVEL;
    const calConfig = buildCalibrationPlayConfig(step.modality, step.gameMode, currentLevel);
    if (!calConfig) return;

    const route = getGameModeConfig(step.gameMode).route;
    navigate(route, { state: createCalibrationPlayIntent(calConfig) });
  }, [calibrationState.results, currentStep, navigate, nextStepPreview]);

  const toggleModalityManager = useCallback(() => {
    setShowModalityManager((prev) => {
      if (!prev) {
        // Opening: scroll to modalities section after toggles render
        setTimeout(() => {
          modalitiesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      return !prev;
    });
  }, []);

  const openModalitiesFromSettings = useCallback(() => {
    setShowSettingsModal(false);
    setShowModalityManager(true);
    setTimeout(() => {
      modalitiesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const openResetDialog = useCallback(() => {
    setResetConfirmText('');
    calibrationActions.clearResetError();
    setShowResetDialog(true);
  }, [calibrationActions]);

  const closeResetDialog = useCallback(() => {
    if (calibrationActions.isResetting) return;
    setShowResetDialog(false);
    setResetConfirmText('');
    calibrationActions.clearResetError();
  }, [calibrationActions]);

  const handleResetProfile = useCallback(async () => {
    await calibrationActions.resetProfile();
    if (!calibrationActions.resetError) {
      closeResetDialog();
    }
  }, [calibrationActions, closeResetDialog]);

  return (
    <div className="relative w-full md:max-w-md lg:max-w-lg md:mx-auto">
      {/* Desktop floating close button (outside frame) */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="hidden md:flex absolute -top-3 -right-3 items-center justify-center p-2 bg-woven-bg text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-20 border border-border shadow-sm"
        >
          <X size={20} />
        </button>
      )}
      {/* ═══ Frame: hatching border like the session report ═══ */}
      <Hatching id="profile-frame-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="profile-frame-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="flex-1 min-w-0">
          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 1: IDENTITY — avatar, name, dominant/focus, stats
          ═══════════════════════════════════════════════════════════════════════ */}
          <div className="px-2 pt-4 pb-0">
            {/* Header row: avatar pinned left, title + close right */}
            <div className="flex items-start gap-3">
              {/* Avatar — pinned like an ID card photo, tap to toggle picker */}
              <button
                type="button"
                onClick={() => setEditingAvatar((v) => !v)}
                className="shrink-0 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm"
                aria-label={t('settings.profile.avatar', 'Avatar')}
              >
                <Hatching id="profile-avatar-top" className="text-foreground/70" />
                <div className="flex items-stretch">
                  <Hatching
                    id="profile-avatar-left"
                    orientation="vertical"
                    className="shrink-0 text-foreground/70"
                  />
                  <div className="p-1.5">
                    <Avatar id={avatarId} size={42} className="border-border/30 bg-background/70" />
                  </div>
                  <Hatching
                    id="profile-avatar-right"
                    orientation="vertical"
                    className="shrink-0 text-foreground/70"
                  />
                </div>
                <Hatching id="profile-avatar-bottom" className="text-foreground/70" />
              </button>

              {/* Title block */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="relative">
                  {/* Mobile close button */}
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label={t('common.close', 'Close')}
                      className="md:hidden absolute top-0 right-0 p-1 text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-10"
                    >
                      <X size={18} />
                    </button>
                  )}
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('cognitive.profileSheetLabel', 'Profil cognitif')}
                  </div>
                  {editingName ? (
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setLocalDisplayName(e.target.value)}
                      onBlur={() => setEditingName(false)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                      maxLength={20}
                      autoFocus
                      className={cn(
                        'mt-1 max-w-[70%] text-xl sm:text-2xl font-black tracking-tight text-foreground leading-tight',
                        'bg-transparent border-b-2 border-primary/30 focus:border-primary/60 outline-none',
                      )}
                    />
                  ) : (
                    <h2
                      className={cn(
                        'mt-1 text-xl sm:text-2xl font-black tracking-tight text-foreground leading-tight cursor-text',
                        onClose && 'pr-10 md:pr-0',
                      )}
                      onClick={() => setEditingName(true)}
                    >
                      {displayName}
                    </h2>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>
                    {isCalibrationComplete
                      ? t('cognitive.profileCalibrated', 'Profil calibré')
                      : hasStartedCalibration
                        ? t('cognitive.profilePending', 'Calibration en cours')
                        : t('cognitive.profileNew', 'Nouveau profil')}
                  </span>
                </div>
              </div>
            </div>

            {/* Inline avatar picker — slides open below the avatar frame */}
            {editingAvatar && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.id}
                    onClick={() => {
                      setLocalAvatarId(avatar.id);
                      setEditingAvatar(false);
                    }}
                    className={cn(
                      'relative aspect-square flex items-center justify-center rounded-xl transition-all duration-200',
                      avatarId === avatar.id
                        ? 'bg-woven-bg ring-2 ring-primary/40 scale-105'
                        : 'bg-woven-bg/40 hover:bg-woven-bg/70 opacity-70 hover:opacity-100',
                    )}
                  >
                    <Avatar
                      id={avatar.id}
                      size={22}
                      className="border-none shadow-none bg-transparent"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                {t('cognitive.profileModalitiesCount', '{{count}}/{{total}} modalités', {
                  count: modalities.length - disabledCalibrationModalities.length,
                  total: modalities.length,
                })}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>
                {t('cognitive.profileSessionsCount', '{{count}} parties', {
                  count: profileSessionsCount,
                })}
              </span>
            </div>
          </div>

          <Hatching id="profile-identity-hatch" className="mt-4 text-foreground/70" />

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 2: CALIBRATION CTA (if not complete)
          ═══════════════════════════════════════════════════════════════════════ */}
          {!isCalibrationComplete && (
            <>
              <div className="-mx-2 px-[1px] py-[1px] rounded-2xl overflow-hidden">
                <div className="bg-[hsl(var(--woven-blue)/0.08)] px-4 py-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t('cognitive.calibrationLabel', 'Calibration')}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t('cognitive.calibrationProgressCount', '{{done}} / {{total}} complétées', {
                        done: completedCalibrationSteps,
                        total: activeCalibrationSteps.length,
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative size-14 shrink-0">
                      <svg width={56} height={56} className="-rotate-90">
                        <circle
                          cx={28}
                          cy={28}
                          r={24}
                          fill="none"
                          stroke="hsl(var(--muted-foreground) / 0.12)"
                          strokeWidth={3}
                        />
                        <circle
                          cx={28}
                          cy={28}
                          r={24}
                          fill="none"
                          stroke="hsl(var(--woven-blue))"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 24}
                          strokeDashoffset={2 * Math.PI * 24 * (1 - calibrationProgress)}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-black tabular-nums text-foreground">
                          {Math.round(calibrationProgress * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-foreground">
                        {remainingCalibrationSteps > 0
                          ? t(
                              'cognitive.remainingCalibrationSteps',
                              'Encore {{count}} étapes avant le parcours',
                              { count: remainingCalibrationSteps },
                            )
                          : t('cognitive.calibrationReady', 'Calibration prête')}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(
                          'cognitive.calibrationReward',
                          'À la fin, le parcours personnalisé se débloque automatiquement.',
                        )}
                      </div>
                      {hasStartedCalibration && nextStepPreview && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>
                            {completedCalibrationSteps + 1}/{activeCalibrationSteps.length}
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span>{getGameModeConfig(nextStepPreview.gameMode).label}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <CurrentStepIcon modality={nextStepPreview.modality} />
                          <span>{CALIBRATION_MODALITY_LABELS[nextStepPreview.modality]}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCalibrationPlay}
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-95"
                    >
                      <Play size={20} weight="fill" />
                    </button>
                  </div>

                  {nextStepPreview && (
                    <div className="mt-3 border-t border-[hsl(var(--woven-blue)/0.18)] pt-3 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t(
                          hasStartedCalibration
                            ? 'cognitive.currentStepLabel'
                            : 'cognitive.nextStepLabel',
                          hasStartedCalibration ? 'Étape actuelle' : 'Étape suivante',
                        )}
                      </span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span>
                        {completedCalibrationSteps + 1}/{activeCalibrationSteps.length}
                      </span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span>{getGameModeConfig(nextStepPreview.gameMode).label}</span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span>{CALIBRATION_MODALITY_LABELS[nextStepPreview.modality]}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Skip calibration + manage modalities */}
              <div className="flex flex-col items-center gap-1.5 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void calibrationActions.skipCalibration()}
                  disabled={calibrationActions.isSkipping}
                  className={cn(
                    'text-[11px] text-muted-foreground/60 transition-colors',
                    calibrationActions.isSkipping
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:text-muted-foreground',
                  )}
                >
                  {t('cognitive.skipCalibration', 'Passer la calibration et commencer au niveau 2')}
                </button>
                <button
                  type="button"
                  onClick={toggleModalityManager}
                  className="text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  {showModalityManager
                    ? t('cognitive.validateModalities', 'Valider les modalités choisies')
                    : t('cognitive.customizeModalities', 'Personnaliser les modalités entraînées')}
                </button>
              </div>

              <Hatching id="profile-calibration-hatch" className="text-foreground/70" />
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 2b: NEXT TRAINING SESSION (when calibration is complete)
          ═══════════════════════════════════════════════════════════════════════ */}
          {isCalibrationComplete && (
            <NextTrainingCard
              profileProjection={profileProjection}
              calibrationState={calibrationState}
              navigate={navigate}
              excludeModalities={disabledCalibrationModalities}
              onManageModalities={toggleModalityManager}
              isManagingModalities={showModalityManager}
            />
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 3: OVERVIEW — Score circle + Radar side by side
          ═══════════════════════════════════════════════════════════════════════ */}
          <div className="px-2 py-6">
            {(() => {
              const enabledModalities = modalities.filter(
                (m) => !disabledCalibrationModalities.includes(m.key),
              );
              const showRadar = enabledModalities.length >= 3;
              return (
                <div className="flex items-stretch">
                  {/* Score circle — left 1/3 */}
                  <div className="w-1/3 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('cognitive.overviewScoreLabel', 'Score global')}
                    </p>
                    <div className="mt-2">
                      <CircularScore score={globalScore} size={100} />
                    </div>
                  </div>

                  <Hatching
                    id="profile-overview-divider"
                    orientation="vertical"
                    className="text-foreground/70"
                  />

                  {/* Radar (3+) or bar chart (1-2) */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('cognitive.repartitionSubLabel', 'Forces par modalité')}
                    </p>
                    {showRadar ? (
                      <div className="mt-2">
                        <RadarChart data={enabledModalities} size={160} />
                      </div>
                    ) : (
                      <div className="mt-2 w-full px-1">
                        <ModalityBarChart data={enabledModalities} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <Hatching id="profile-overview-hatch" className="text-foreground/70" />

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 4: MODALITIES — detailed list
          ═══════════════════════════════════════════════════════════════════════ */}
          <div ref={modalitiesSectionRef} className="px-2 py-6">
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('cognitive.modalitiesSectionLabel', 'Modalités')}
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {t(
                    'cognitive.modalitiesSectionBody',
                    'Lecture détaillée des niveaux acquis et de la progression en cours.',
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground shrink-0">
                <div className="flex items-center gap-1.5">
                  <GameModeIcon config={primaryModeConfig} />
                  <span>{primaryModeConfig.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <GameModeIcon config={secondaryModeConfig} />
                  <span>{secondaryModeConfig.label}</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-border/40">
              {modalities.map((mod, i) => (
                <ModalityCard
                  key={mod.key}
                  mod={mod}
                  index={i}
                  enabled={!disabledCalibrationModalities.includes(mod.key)}
                  editing={showModalityManager}
                  isLastEnabled={
                    !disabledCalibrationModalities.includes(mod.key) &&
                    MODALITY_DEFS.length - disabledCalibrationModalities.length <= 1
                  }
                  onToggle={() => toggleCalibrationModality(mod.key)}
                  status={
                    i === strongestModalityIndex
                      ? 'strongest'
                      : i === focusModalityIndex
                        ? 'focus'
                        : 'neutral'
                  }
                />
              ))}
            </div>

            {/* ── Bottom action row: manage modalities (left) + reset (right) ── */}
            <div className="flex items-center justify-between pt-5 px-1">
              <button
                type="button"
                onClick={() =>
                  showModalityManager ? setShowModalityManager(false) : setShowSettingsModal(true)
                }
                className="text-[11px] text-muted-foreground/55 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline"
              >
                {showModalityManager
                  ? t('cognitive.manageModalitiesDone', 'Terminé')
                  : t('cognitive.settingsOpen', 'Réglages')}
              </button>
              <button
                type="button"
                onClick={openResetDialog}
                disabled={calibrationActions.isResetting}
                className={cn(
                  'text-[11px] text-muted-foreground/55 underline-offset-2 transition-colors',
                  calibrationActions.isResetting
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:text-muted-foreground hover:underline',
                )}
              >
                {t('cognitive.resetProfile', 'Réinitialiser le profil')}
              </button>
            </div>
          </div>
        </div>
        <Hatching
          id="profile-frame-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="profile-frame-bottom" className="text-foreground/70" />
      {showSettingsModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center page-overlay-padding"
        >
          <button
            type="button"
            onClick={() => setShowSettingsModal(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
            aria-label={t('common.close', 'Close')}
          />
          <div className="relative w-full max-w-sm animate-in rounded-2xl border border-border/50 bg-surface/95 p-5 shadow-soft backdrop-blur-xl fade-in zoom-in-95">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GearSix size={18} weight="duotone" className="text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">
                  {t('cognitive.settingsTitle', 'Réglages du profil')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-full transition-colors"
                aria-label={t('common.close', 'Close')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Setting 1: Personnaliser les modalités */}
              <button
                type="button"
                onClick={openModalitiesFromSettings}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-woven-bg/40 px-4 py-3.5 text-left transition-colors hover:bg-woven-bg/70"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t('cognitive.settingsModalities', 'Personnaliser les modalités')}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {t('cognitive.settingsModalitiesDesc', '{{enabled}} / {{total}} actives', {
                      enabled: MODALITY_DEFS.length - disabledCalibrationModalities.length,
                      total: MODALITY_DEFS.length,
                    })}
                  </div>
                </div>
                <span className="text-muted-foreground/50">›</span>
              </button>

              {/* Setting 2: Niveau max */}
              <div className="rounded-xl border border-border/40 bg-woven-bg/40 px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">
                    {t('cognitive.settingsMaxLevel', 'Niveau max')}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalibrationMaxLevel(calibrationMaxLevel - 1)}
                      disabled={calibrationMaxLevel <= 2}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border transition-colors',
                        calibrationMaxLevel <= 2
                          ? 'border-border/30 text-muted-foreground/30 cursor-not-allowed'
                          : 'border-border/60 text-foreground hover:bg-woven-bg/80',
                      )}
                    >
                      <Minus size={14} weight="bold" />
                    </button>
                    <span className="w-8 text-center text-lg font-black tabular-nums text-foreground">
                      {calibrationMaxLevel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalibrationMaxLevel(calibrationMaxLevel + 1)}
                      disabled={calibrationMaxLevel >= 5}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border transition-colors',
                        calibrationMaxLevel >= 5
                          ? 'border-border/30 text-muted-foreground/30 cursor-not-allowed'
                          : 'border-border/60 text-foreground hover:bg-woven-bg/80',
                      )}
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {t('cognitive.settingsMaxLevelHint', 'Niveau max par défaut : 5')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showResetDialog && (
        <ConfirmationDialog
          title={t('cognitive.resetConfirmTitle', 'Réinitialiser le profil ?')}
          description={t(
            'cognitive.resetConfirmDesc',
            'Cette action est irréversible. Tout le profil cognitif, la calibration et la progression associée seront supprimés.',
          )}
          confirmWord={confirmationWord}
          inputValue={resetConfirmText}
          onInputChange={setResetConfirmText}
          onConfirm={() => void handleResetProfile()}
          onCancel={closeResetDialog}
          isLoading={calibrationActions.isResetting}
          error={calibrationActions.resetError}
          confirmLabel={t('cognitive.resetConfirmButton', 'Réinitialiser le profil')}
          loadingLabel={t('cognitive.resetLoading', 'Réinitialisation...')}
          confirmIcon={<ArrowsClockwise size={18} weight="regular" />}
          variant="destructive"
        />
      )}
    </div>
  );
}
