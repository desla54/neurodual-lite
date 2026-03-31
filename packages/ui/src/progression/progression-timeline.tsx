/**
 * Progression Timeline
 *
 * A vertical timeline showing all 30 levels with premium milestone markers.
 * Woven Flat design - hatched vertical separator, no shadows.
 *
 * Features:
 * - Visual premium milestones at levels 5, 10, 20, 30
 * - Current level with mini progress bar
 * - Completed levels marked with checkmarks
 * - Future levels grayed but rewards visible (creates desire)
 */

import { getXPForNextLevel, getXPInCurrentLevel } from '@neurodual/logic';
import { Check, Crown, Gift, Trophy } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface ProgressionTimelineProps {
  level: number;
  totalXP: number;
  className?: string;
}

interface LevelDefinition {
  level: number;
  xpRequired: number;
  reward?: {
    icon: typeof Gift;
    labelKey: string;
    descriptionKey: string;
    color: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const PREMIUM_MILESTONES: Record<
  number,
  { icon: typeof Gift; labelKey: string; descriptionKey: string; color: string }
> = {
  5: {
    icon: Gift,
    labelKey: 'rewards.discovery.name',
    descriptionKey: 'rewards.discovery.description',
    color: 'emerald',
  },
  10: {
    icon: Trophy,
    labelKey: 'rewards.engagement.name',
    descriptionKey: 'rewards.engagement.description',
    color: 'amber',
  },
  20: {
    icon: Trophy,
    labelKey: 'rewards.expert.name',
    descriptionKey: 'rewards.expert.description',
    color: 'orange',
  },
  30: {
    icon: Crown,
    labelKey: 'rewards.lifetime.name',
    descriptionKey: 'rewards.lifetime.description',
    color: 'purple',
  },
};

// Generate all 30 levels with their XP requirements
function generateLevels(): LevelDefinition[] {
  const levels: LevelDefinition[] = [];
  for (let i = 1; i <= 30; i++) {
    levels.push({
      level: i,
      xpRequired: getXPForNextLevel(i - 1), // XP needed to reach this level
      reward: PREMIUM_MILESTONES[i],
    });
  }
  return levels;
}

const ALL_LEVELS = generateLevels();

// =============================================================================
// Subcomponents
// =============================================================================

interface LevelNodeProps {
  definition: LevelDefinition;
  currentLevel: number;
  currentXP: number;
  isLast: boolean;
}

function LevelNode({ definition, currentLevel, currentXP, isLast }: LevelNodeProps): ReactNode {
  const { t } = useTranslation();
  const { level, reward } = definition;
  const isCompleted = currentLevel > level;
  const isCurrent = currentLevel === level;
  const isFuture = currentLevel < level;

  // For current level, calculate progress
  const xpInLevel = isCurrent ? getXPInCurrentLevel(currentXP) : 0;
  const xpForNext = isCurrent ? getXPForNextLevel(level) : 0;
  const progress = xpForNext > 0 ? (xpInLevel / xpForNext) * 100 : 0;

  const Icon = reward?.icon;
  const colorClass = reward
    ? {
        emerald: 'bg-emerald-500/10 border-emerald-500 text-emerald-600',
        amber: 'bg-amber-500/10 border-amber-500 text-amber-600',
        orange: 'bg-orange-500/10 border-orange-500 text-orange-600',
        purple: 'bg-purple-500/10 border-purple-500 text-purple-600',
      }[reward.color]
    : '';

  return (
    <div className="relative flex gap-3 sm:gap-4">
      {/* Left: Vertical timeline track */}
      <div className="flex flex-col items-center">
        {/* Node circle */}
        <div
          className={cn(
            'relative z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center transition-all',
            isCompleted && 'bg-primary border-primary',
            isCurrent && 'bg-primary/10 border-primary border-dashed',
            isFuture && 'bg-secondary border-border',
            reward && !isCompleted && !isCurrent && colorClass,
          )}
        >
          {isCompleted ? (
            <Check size={18} className="text-primary-foreground" />
          ) : Icon && !isCurrent ? (
            <Icon size={18} className={cn(isFuture ? 'opacity-50' : '')} />
          ) : (
            <span
              className={cn(
                'text-sm font-bold',
                isCurrent && 'text-primary',
                isFuture && 'text-muted-foreground',
              )}
            >
              {level}
            </span>
          )}
        </div>

        {/* Vertical connector line (hatched/dashed for woven style) */}
        {!isLast && (
          <div
            className={cn(
              'w-0.5 flex-1 min-h-[2rem]',
              isCompleted ? 'bg-primary' : 'border-l-2 border-dashed border-border',
            )}
          />
        )}
      </div>

      {/* Right: Level info */}
      <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Level title */}
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span
                className={cn(
                  'font-semibold text-sm sm:text-base leading-tight',
                  isCompleted && 'text-foreground',
                  isCurrent && 'text-primary',
                  isFuture && 'text-muted-foreground',
                )}
              >
                {t('progression.level', { level })}
              </span>
              {isCompleted && (
                <span className="text-xxs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                  {t('progression.reached')}
                </span>
              )}
              {isCurrent && (
                <span className="text-xxs font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  {t('progression.inProgress')}
                </span>
              )}
            </div>

            {/* Reward info */}
            {reward && (
              <div
                className={cn(
                  'mt-1.5 p-3 rounded-xl border transition-all',
                  isCompleted
                    ? 'bg-primary/5 border-primary/20'
                    : isCurrent
                      ? `bg-${reward.color}-50 border-${reward.color}-200`
                      : 'bg-secondary/50 border-border',
                )}
              >
                <div className="flex items-center gap-2">
                  {Icon && (
                    <Icon
                      size={16}
                      className={cn(
                        isCompleted && 'text-primary',
                        isCurrent && `text-${reward.color}-500`,
                        isFuture && 'text-muted-foreground',
                      )}
                    />
                  )}
                  <span className={cn('font-medium text-sm', isFuture && 'text-muted-foreground')}>
                    {t(reward.labelKey)}
                  </span>
                </div>
                <p
                  className={cn(
                    'text-xs mt-1',
                    isFuture ? 'text-muted-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {t(reward.descriptionKey)}
                </p>
              </div>
            )}

            {/* Current level progress bar */}
            {isCurrent && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{xpInLevel.toLocaleString()} XP</span>
                  <span>{xpForNext.toLocaleString()} XP</span>
                </div>
                <div className="h-2 bg-secondary rounded-full border border-border overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ProgressionTimeline({
  level,
  totalXP,
  className,
}: ProgressionTimelineProps): ReactNode {
  // Only show relevant levels (not all 30 at once)
  // Show: completed levels (collapsed), current, and next 3-5 levels
  const displayLevels = ALL_LEVELS.filter((def) => {
    // Always show milestone levels
    if (def.reward) return true;
    // Show current and nearby levels
    if (def.level >= level - 1 && def.level <= level + 3) return true;
    // Show completed milestone levels
    if (def.level < level && def.reward) return true;
    return false;
  });

  return (
    <div className={cn('', className)}>
      <div className="space-y-0">
        {displayLevels.map((def, index) => (
          <LevelNode
            key={def.level}
            definition={def}
            currentLevel={level}
            currentXP={totalXP}
            isLast={index === displayLevels.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Next Milestone Preview Component
// =============================================================================

export interface NextMilestoneProps {
  level: number;
  totalXP: number;
  className?: string;
}

export function NextMilestonePreview({ level, totalXP, className }: NextMilestoneProps): ReactNode {
  const { t } = useTranslation();
  // Find next premium milestone
  const nextMilestoneLevel = [5, 10, 20, 30].find((m) => m > level);

  if (!nextMilestoneLevel) {
    // All milestones achieved
    return (
      <div
        className={cn(
          'p-4 rounded-xl border bg-purple-500/10 border-purple-500/20 dark:bg-purple-400/10 dark:border-purple-300/20',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <Crown size={24} className="text-purple-600 dark:text-purple-300" />
          <div>
            <p className="font-semibold text-purple-800 dark:text-purple-100">
              {t('rewards.permanentAccessUnlocked')}
            </p>
            <p className="text-sm text-purple-700/80 dark:text-purple-100/80">
              {t('rewards.reachedTheTop')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const milestone = PREMIUM_MILESTONES[nextMilestoneLevel];
  if (!milestone) return null; // Type guard

  const Icon = milestone.icon;

  // Calculate XP needed
  let xpNeeded = 0;
  for (let i = level; i < nextMilestoneLevel; i++) {
    xpNeeded += getXPForNextLevel(i);
  }
  const xpInCurrentLevel = getXPInCurrentLevel(totalXP);
  xpNeeded -= xpInCurrentLevel;

  const colorClasses: string =
    {
      emerald:
        'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:bg-emerald-400/10 dark:border-emerald-300/20 dark:text-emerald-100',
      amber:
        'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:bg-amber-400/10 dark:border-amber-300/20 dark:text-amber-100',
      orange:
        'bg-orange-500/10 border-orange-500/20 text-orange-800 dark:bg-orange-400/10 dark:border-orange-300/20 dark:text-orange-100',
      purple:
        'bg-purple-500/10 border-purple-500/20 text-purple-800 dark:bg-purple-400/10 dark:border-purple-300/20 dark:text-purple-100',
    }[milestone.color] ?? '';

  const iconColorClasses: string =
    {
      emerald: 'text-emerald-600 dark:text-emerald-300',
      amber: 'text-amber-600 dark:text-amber-300',
      orange: 'text-orange-600 dark:text-orange-300',
      purple: 'text-purple-600 dark:text-purple-300',
    }[milestone.color] ?? '';

  return (
    <div className={cn('p-4 rounded-xl border', colorClasses, className)}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="p-2 rounded-lg bg-white/50 dark:bg-white/10">
          <Icon size={20} className={iconColorClasses} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{t(milestone.labelKey)}</p>
          <p className="text-xs opacity-80">{t(milestone.descriptionKey)}</p>
        </div>
        <div className="w-full sm:w-auto flex items-end justify-between sm:block sm:text-right">
          <p className="text-lg font-bold leading-none">{xpNeeded.toLocaleString()}</p>
          <p className="text-3xs uppercase tracking-wider opacity-70">{t('rewards.xpRemaining')}</p>
        </div>
      </div>
    </div>
  );
}
