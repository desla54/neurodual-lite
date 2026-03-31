/**
 * ReportXPSection - Unified XP display for session reports
 *
 * Combines:
 * 1. XP Breakdown from session (base, performance, bonuses)
 * 2. Premium reward progress (Train-to-Own model)
 * 3. Level up indicator
 * 4. New badges earned
 */

import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Gift, Crown, Star, Lightning, Fire, Confetti } from '@phosphor-icons/react';
import {
  LEVEL_THRESHOLDS,
  getNextReward,
  type XPBreakdown,
  type BadgeDefinition,
} from '@neurodual/logic';
import { useProgression } from '../../hooks/use-progression';
import { useBadgeTranslation } from '../../hooks/use-badge-translation';
import { BadgeIcon } from '../../progression';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportXPSectionProps {
  readonly sessionId: string;
  readonly xpBreakdown: XPBreakdown;
  readonly nLevel: number;
  readonly leveledUp: boolean;
  readonly newLevel: number;
  readonly newBadges: readonly BadgeDefinition[];
  readonly labels: ReportLabels;
}

// =============================================================================
// Helpers
// =============================================================================

function formatXP(xp: number | undefined | null): string {
  const value = xp ?? 0;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return value.toString();
}

function getDurationLabel(
  days: number | null,
  labels: ReportLabels,
  t: (key: string, fallback: string) => string,
): string {
  if (days === null)
    return labels.rewardLifetime ?? t('stats.unifiedReport.xp.lifetime', 'Lifetime');
  if (days <= 7) {
    return (
      labels.rewardDays?.replace('{days}', String(days)) ??
      t('stats.unifiedReport.xp.days', '{{days}} days').replace('{{days}}', String(days))
    );
  }
  if (days <= 30) return labels.reward1Month ?? t('stats.unifiedReport.xp.oneMonth', '1 month');
  if (days <= 90)
    return labels.reward3Months ?? t('stats.unifiedReport.xp.threeMonths', '3 months');
  return (
    labels.rewardDays?.replace('{days}', String(days)) ??
    t('stats.unifiedReport.xp.days', '{{days}} days').replace('{{days}}', String(days))
  );
}

// =============================================================================
// Component
// =============================================================================

export function ReportXPSection({
  sessionId,
  xpBreakdown,
  nLevel,
  leveledUp,
  newLevel,
  newBadges,
  labels,
}: ReportXPSectionProps): ReactNode {
  const { t } = useTranslation();
  const { progression, isLoading } = useProgression();
  const { getName } = useBadgeTranslation();
  const frozenRef = useRef<{
    sessionId: string;
    data: NonNullable<ReturnType<typeof useProgression>['progression']>;
  } | null>(null);

  // Freeze progression snapshot per report: capture the first non-null value for each sessionId.
  if (!isLoading && progression) {
    if (!frozenRef.current || frozenRef.current.sessionId !== sessionId) {
      frozenRef.current = { sessionId, data: progression };
    }
  }

  const stableProgression =
    frozenRef.current?.sessionId === sessionId ? frozenRef.current.data : null;

  // Don't render while loading or if no progression snapshot
  if (isLoading || !stableProgression) return null;

  const currentLevel = stableProgression.level ?? 1;
  const totalXP = stableProgression.totalXP ?? 0;
  const nextReward = getNextReward(currentLevel);

  // Calculate progress towards next reward
  const targetLevel = nextReward?.requiredLevel ?? 30;
  const targetXP = LEVEL_THRESHOLDS[targetLevel - 1] ?? 0;
  const currentLevelXP = LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
  const xpProgress = totalXP - currentLevelXP;
  const xpNeeded = targetXP - currentLevelXP;
  const progressPercent =
    xpNeeded > 0 ? Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100)) : 100;
  const durationLabel = nextReward ? getDurationLabel(nextReward.durationDays, labels, t) : '';

  return (
    <div className="w-full space-y-3">
      {/* XP Earned Card */}
      <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl">
        {/* Header with total XP */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Star size={20} weight="fill" className="text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {labels.xpTitle ?? t('stats.unifiedReport.xp.title', 'XP earned')}
            </span>
          </div>
          <span className="text-2xl font-bold text-primary">+{xpBreakdown.total}</span>
        </div>

        {/* Breakdown grid */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{labels.xpBase?.replace('{level}', String(nLevel)) ?? `N${nLevel} Base`}</span>
            <span>+{xpBreakdown.base}</span>
          </div>
          <div className="flex justify-between">
            <span>
              {labels.xpPerformance ?? t('stats.unifiedReport.xp.performance', 'Performance')}
            </span>
            <span>+{xpBreakdown.performance}</span>
          </div>
          <div className="flex justify-between">
            <span>{labels.xpAccuracy ?? t('stats.unifiedReport.xp.accuracy', 'Accuracy')}</span>
            <span>+{xpBreakdown.accuracy}</span>
          </div>
          {xpBreakdown.streakBonus > 0 && (
            <div className="flex justify-between text-accent">
              <span className="flex items-center gap-1">
                <Fire size={12} weight="fill" />
                {labels.xpStreakBonus ?? t('stats.unifiedReport.xp.streak', 'Streak')}
              </span>
              <span>+{xpBreakdown.streakBonus}</span>
            </div>
          )}
          {xpBreakdown.dailyBonus > 0 && (
            <div className="flex justify-between text-accent">
              <span>
                {labels.xpDailyBonus ?? t('stats.unifiedReport.xp.firstToday', 'First today')}
              </span>
              <span>+{xpBreakdown.dailyBonus}</span>
            </div>
          )}
          {xpBreakdown.badgeBonus > 0 && (
            <div className="flex justify-between text-primary">
              <span className="flex items-center gap-1">
                <Trophy size={12} weight="fill" />
                {labels.xpBadgeBonus ?? t('stats.unifiedReport.xp.badge', 'Badge')}
              </span>
              <span>+{xpBreakdown.badgeBonus}</span>
            </div>
          )}
          {xpBreakdown.flowBonus > 0 && (
            <div className="flex justify-between text-purple-500">
              <span className="flex items-center gap-1">
                <Lightning size={12} weight="fill" />
                {labels.xpFlowBonus ?? t('stats.unifiedReport.xp.flow', 'Flow')}
              </span>
              <span>+{xpBreakdown.flowBonus}</span>
            </div>
          )}
          {xpBreakdown.confidenceMultiplier < 1 && (
            <div className="flex justify-between text-orange-500 col-span-2 mt-1 pt-1 border-t border-muted/40">
              <span>
                {labels.xpConfidenceMultiplier ??
                  t('stats.unifiedReport.xp.confidenceMultiplier', 'Confidence')}
              </span>
              <span>×{xpBreakdown.confidenceMultiplier.toFixed(2)}</span>
            </div>
          )}
          {xpBreakdown.dailyCapReached && (
            <div className="col-span-2 mt-1 pt-1 border-t border-muted/40 text-center text-orange-500">
              {labels.xpDailyCapReached ??
                t('stats.unifiedReport.xp.dailyCapReached', 'Daily XP limit reached')}
            </div>
          )}
        </div>

        {/* Level up indicator */}
        {leveledUp && (
          <div className="mt-4 pt-3 border-t border-primary/20 flex items-center justify-center gap-2">
            <Confetti size={20} weight="fill" className="text-primary" />
            <span className="text-lg font-bold text-primary">
              {labels.xpLevelReached?.replace('{level}', String(newLevel)) ??
                `Level ${newLevel} reached!`}
            </span>
          </div>
        )}
      </div>

      {/* Premium Progress Card */}
      {nextReward && (
        <div className="p-3 bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gift size={20} weight="fill" className="text-violet-500" />
              <span className="font-medium text-foreground">
                {labels.rewardNextPass ??
                  t('stats.unifiedReport.rewards.nextPass', 'Next Premium Pass')}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Trophy size={16} weight="fill" className="text-amber-500" />
              <span>{t('stats.advanced.levelShort', { level: targetLevel })}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* XP labels */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatXP(totalXP)} / {formatXP(targetXP)} XP
            </span>
            <span className="text-violet-600 font-medium">
              {durationLabel} {t('stats.unifiedReport.xp.premium', 'Premium')}
            </span>
          </div>

          {/* Remaining XP hint */}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {labels.rewardRemaining?.replace('{xp}', formatXP(targetXP - totalXP)) ??
              `${formatXP(targetXP - totalXP)} XP remaining`}
          </p>
        </div>
      )}

      {/* All rewards unlocked */}
      {!nextReward && (
        <div className="p-5 bg-amber-500/15 rounded-xl border border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Crown size={24} weight="fill" className="text-amber-500" />
            </div>
            <div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                {labels.rewardAllUnlocked ??
                  t('stats.unifiedReport.rewards.allUnlocked', 'All rewards unlocked!')}
              </p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                {labels.rewardLifetimeEarned ??
                  t(
                    'stats.unifiedReport.rewards.lifetimeEarned',
                    'You have earned lifetime Premium access',
                  )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* New Badges */}
      {newBadges.length > 0 && (
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {labels.badgesNewUnlocked ??
              t('stats.unifiedReport.badges.newUnlocked', 'New badges unlocked!')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {newBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full"
              >
                <BadgeIcon iconName={badge.icon} className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium">{getName(badge)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
