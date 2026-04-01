'use client';

/**
 * JourneyStageCard - Individual stage card in the journey path
 *
 * Shows:
 * - Lock icon for locked stages
 * - Checkmark for completed stages
 * - Ring highlight for current stage
 * - Progress fill for current stage (bottom to top)
 * - Purple = Réflexe, Amber = Flow, Blue = Rappel
 */

import type { JourneyStageDefinition, JourneyStageProgress } from '@neurodual/logic';

// Lite stubs for removed journey scoring constants
const JOURNEY_MIN_PASSING_SCORE = 0.7;
function getSessionsRequired(_score: number | null): number {
  return 1;
}
import {
  Check,
  Lock,
  Lightning,
  Database,
  MapPin,
  Tag,
  Crosshair,
  Heart,
  HeartBreak,
} from '@phosphor-icons/react';
import { cn } from '../lib/utils';
import { GLASS_SHADOW, GLASS_SHADOW_LG, GLASS_SHADOW_SM } from '../primitives/glass';

export interface JourneyStageCardProps {
  /** Stage definition (static) */
  definition: JourneyStageDefinition;
  /** Stage progress (dynamic) */
  progress: JourneyStageProgress;
  /** Is this the current stage? */
  isCurrent: boolean;
  /** Is the stage accessible to this user? (premium check) */
  isAccessible: boolean;
  /** Specific game mode for simulator journeys (affects icon) */
  gameMode?: 'dualnback-classic' | 'sim-brainworkshop' | 'dual-trace' | string;
  /** Click handler */
  onClick?: () => void;
  /**
   * Strikes (0-2) for BrainWorkshop binary mode.
   * If defined, shows "danger" progress instead of "completion" progress.
   * 3 strikes = DOWN (regression), so max displayed is 2.
   */
  consecutiveStrikes?: number;
  /** Translations */
  labels?: {
    locked?: string;
    pick?: string;
    catch?: string;
    place?: string;
    memo?: string;
    simulator?: string;
  };
  /** Visual emphasis preset */
  emphasis?: 'normal' | 'hero';
  /** Is this the stage immediately after current stage? */
  isNext?: boolean;
  /** Is this stage already passed (left side of current)? */
  isPast?: boolean;
}

/**
 * Calculate progress percentage based on validating sessions and best score.
 * Uses spec-driven thresholds from journey.spec.ts:
 * - EXCELLENT (95%+) → 1 session needed
 * - GOOD (85-94%) → 2 sessions needed
 * - PASSING (80-84%) → 3 sessions needed
 */
function calculateProgress(validatingSessions: number, bestScore: number | null): number {
  if (validatingSessions === 0 || bestScore === null || bestScore < JOURNEY_MIN_PASSING_SCORE) {
    return 0;
  }

  const sessionsNeeded = getSessionsRequired(bestScore);
  if (sessionsNeeded === Infinity) return 0;
  return Math.min(100, Math.round((validatingSessions / sessionsNeeded) * 100));
}

export function JourneyStageCard({
  definition,
  progress,
  isCurrent,
  isAccessible,
  gameMode,
  onClick,
  consecutiveStrikes,
  labels,
  emphasis = 'normal',
  isNext = false,
  isPast = false,
}: JourneyStageCardProps) {
  const { stageId, nLevel, mode } = definition;
  const { status, validatingSessions, bestScore } = progress;
  const isHero = emphasis === 'hero';
  const isBrainWorkshopJourney = gameMode === 'sim-brainworkshop';
  const isDualnbackClassicJourney = gameMode === 'dualnback-classic';
  const progressivePct =
    typeof progress.progressPct === 'number' && Number.isFinite(progress.progressPct)
      ? Math.max(0, Math.min(100, progress.progressPct))
      : null;

  // BrainWorkshop binary mode: show lives remaining (video game style)
  const isBinaryStrikesMode = consecutiveStrikes !== undefined;
  const livesRemaining = isBinaryStrikesMode ? 3 - consecutiveStrikes : 3;

  const simulatorColor = isDualnbackClassicJourney ? ('purple' as const) : ('amber' as const);

  // Mode colors and icons
  const modeConfig = {
    pick: { color: 'emerald' as const, icon: Tag, label: labels?.pick ?? 'Pick' },
    catch: { color: 'purple' as const, icon: Lightning, label: labels?.catch ?? 'Catch' },
    place: { color: 'orange' as const, icon: MapPin, label: labels?.place ?? 'Place' },
    memo: { color: 'blue' as const, icon: Database, label: labels?.memo ?? 'Memo' },
    simulator: {
      color: simulatorColor,
      icon: Crosshair,
      label: labels?.simulator ?? 'Simulator',
    },
  };
  const { color: modeColor, icon: ModeIcon, label: modeLabel } = modeConfig[mode];

  // Status styles
  const isLocked = status === 'locked';
  const isCompleted = status === 'completed';
  const isUnlocked = status === 'unlocked';

  // Progress for current stage (standard mode only, not binary strikes)
  const progressPercent =
    !isBinaryStrikesMode && isCurrent && isUnlocked
      ? progressivePct !== null
        ? Math.round(progressivePct)
        : calculateProgress(validatingSessions, bestScore)
      : 0;
  const showProgress = isCurrent && isUnlocked && !isCompleted && !isBinaryStrikesMode;
  // Binary mode: show lives indicator instead of progress fill
  const showLives = isBinaryStrikesMode && isCurrent && isUnlocked && !isCompleted;

  // Can interact?
  const canInteract = isAccessible && !isLocked && onClick;
  // Show as enabled if unlocked or completed, even without onClick
  const showAsEnabled = isAccessible && (isUnlocked || isCompleted);

  return (
    <div className={cn('flex flex-col items-center', showLives ? 'gap-2' : 'gap-1')}>
      <button
        type="button"
        onClick={canInteract ? onClick : undefined}
        disabled={!showAsEnabled}
        className={cn(
          'relative flex flex-col items-center gap-1.5 p-3 transition-all duration-200',
          // Glass foundation
          'rounded-[1rem] border border-border/50 bg-card',
          GLASS_SHADOW,
          isHero
            ? 'min-w-[96px] w-[96px] sm:min-w-[104px] sm:w-[104px] p-3.5'
            : 'min-w-[84px] w-[84px]',
          isHero && !isCurrent && 'opacity-90',
          isHero && isPast && !isCurrent && 'opacity-65 scale-[0.94]',
          isHero && isNext && !isCurrent && !isPast && 'opacity-100 scale-[1.02]',
          // Status styles
          isLocked && 'opacity-50',
          // Completed: subtle emerald tint on glass
          isCompleted && 'border-emerald-500/35 bg-card',
          // Current stage highlight
          isCurrent && [
            isHero
              ? `scale-[1.06] ${GLASS_SHADOW_LG} border-foreground/70 ring-2 ring-offset-2 ring-offset-background ring-foreground/90`
              : 'ring-2 ring-offset-2 ring-offset-background',
            !isHero && modeColor === 'emerald' && 'ring-emerald-500',
            !isHero && modeColor === 'purple' && 'ring-purple-500',
            !isHero && modeColor === 'orange' && 'ring-orange-500',
            !isHero && modeColor === 'blue' && 'ring-blue-500',
            !isHero && modeColor === 'amber' && 'ring-amber-500',
          ],
          // Interaction
          canInteract &&
            !isCurrent &&
            'cursor-pointer hover:scale-105 hover:border-border/70 hover:bg-muted/30 active:scale-95',
          canInteract && isCurrent && 'cursor-pointer active:scale-[1.03]',
          !canInteract && 'cursor-default',
        )}
      >
        {/* Progress fill overlay (bottom to top) - standard mode only */}
        {showProgress && progressPercent > 0 && (
          <div
            className={cn(
              'absolute left-0 right-0 bottom-0 transition-all duration-500 ease-out',
              'rounded-b-[14px]',
              progressPercent >= 95 && 'rounded-t-[14px]',
              modeColor === 'emerald' && 'bg-emerald-500/15',
              modeColor === 'purple' && 'bg-purple-500/15',
              modeColor === 'orange' && 'bg-orange-500/15',
              modeColor === 'blue' && 'bg-blue-500/15',
              modeColor === 'amber' && 'bg-amber-500/15',
            )}
            style={{ height: `${progressPercent}%` }}
          />
        )}

        {/* Stage number badge */}
        <div
          className={cn(
            isHero
              ? 'absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10'
              : 'absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-10',
            'bg-card border border-border/50',
            GLASS_SHADOW_SM,
            isCompleted && 'bg-emerald-500 text-white border-emerald-500/60',
          )}
        >
          {isCompleted ? <Check size={12} weight="bold" /> : stageId}
        </div>

        {/* Icon */}
        <div
          className={cn(
            isHero
              ? 'relative z-10 w-12 h-12 rounded-xl flex items-center justify-center'
              : 'relative z-10 w-11 h-11 rounded-xl flex items-center justify-center',
            'bg-muted/65 transition-colors',
            isLocked && 'text-muted-foreground',
            !isLocked && modeColor === 'emerald' && 'text-emerald-500 dark:text-emerald-400',
            !isLocked && modeColor === 'purple' && 'text-purple-500 dark:text-purple-400',
            !isLocked && modeColor === 'orange' && 'text-orange-500 dark:text-orange-400',
            !isLocked && modeColor === 'blue' && 'text-blue-500 dark:text-blue-400',
            !isLocked && modeColor === 'amber' && 'text-amber-500 dark:text-amber-400',
            isCompleted && 'text-emerald-500 dark:text-emerald-400',
          )}
        >
          {isLocked ? (
            <Lock size={isHero ? 24 : 22} weight="regular" />
          ) : isCompleted ? (
            <Check size={isHero ? 24 : 22} weight="bold" />
          ) : (
            <ModeIcon size={isHero ? 24 : 22} weight="regular" />
          )}
        </div>

        {/* N-Level */}
        <span
          className={cn(
            'relative z-10 font-bold text-foreground',
            isHero ? 'text-base' : 'text-sm',
          )}
        >
          N-{nLevel}
        </span>

        {/* Mode label — hidden for simulator journeys (same label on every card) */}
        {mode !== 'simulator' && (
          <span
            className={cn(
              'relative z-10 font-medium',
              isHero ? 'text-2xs' : 'text-3xs',
              isLocked && 'text-muted-foreground',
              !isLocked && modeColor === 'emerald' && 'text-emerald-500 dark:text-emerald-400',
              !isLocked && modeColor === 'purple' && 'text-purple-500 dark:text-purple-400',
              !isLocked && modeColor === 'orange' && 'text-orange-500 dark:text-orange-400',
              !isLocked && modeColor === 'blue' && 'text-blue-500 dark:text-blue-400',
              !isLocked && modeColor === 'amber' && 'text-amber-500 dark:text-amber-400',
            )}
          >
            {modeLabel}
          </span>
        )}
      </button>

      {/* Progress indicator below card */}
      {showProgress && !isBrainWorkshopJourney && progressPercent > 0 && (
        <span
          className={cn(
            'text-3xs font-semibold tabular-nums mt-1.5',
            modeColor === 'emerald' && 'text-emerald-500',
            modeColor === 'purple' && 'text-purple-500',
            modeColor === 'orange' && 'text-orange-500',
            modeColor === 'blue' && 'text-blue-500',
            modeColor === 'amber' && 'text-amber-500',
          )}
        >
          {progressPercent}%
        </span>
      )}

      {/* Lives indicator - BrainWorkshop mode (video game style) */}
      {showLives && (
        <div className="flex items-center gap-0.5 mt-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="text-3xs">
              {i < livesRemaining ? (
                <Heart size={12} weight="fill" className="text-destructive" />
              ) : (
                <HeartBreak size={12} weight="regular" className="text-muted-foreground/50" />
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
