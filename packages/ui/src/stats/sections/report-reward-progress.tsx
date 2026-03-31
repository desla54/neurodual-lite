/**
 * ReportRewardProgress - XP progress towards next Premium reward
 *
 * Train-to-Own model:
 * - Level 5: 7 days Premium
 * - Level 10: 1 month Premium
 * - Level 20: 3 months Premium
 * - Level 30: Lifetime Premium
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Gift, Crown } from '@phosphor-icons/react';
import { LEVEL_THRESHOLDS, getNextReward } from '@neurodual/logic';
import { useProgression } from '../../hooks/use-progression';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportRewardProgressProps {
  readonly labels: ReportLabels;
}

// =============================================================================
// Helpers
// =============================================================================

function formatXP(xp: number): string {
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(xp >= 10000 ? 0 : 1)}k`;
  }
  return xp.toString();
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

export function ReportRewardProgress({ labels }: ReportRewardProgressProps): ReactNode {
  const { t } = useTranslation();
  const { progression, isLoading } = useProgression();

  // Don't render while loading or if no progression
  if (isLoading || !progression) return null;

  const currentLevel = progression.level;
  const totalXP = progression.totalXP;

  // Get next reward
  const nextReward = getNextReward(currentLevel);

  // If no next reward (level 30+), show achievement message
  if (!nextReward) {
    return (
      <div className="w-full p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Crown size={24} weight="fill" className="text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-800">
              {labels.rewardAllUnlocked ??
                t('stats.unifiedReport.rewards.allUnlocked', 'All rewards unlocked!')}
            </p>
            <p className="text-sm text-amber-600">
              {labels.rewardLifetimeEarned ??
                t(
                  'stats.unifiedReport.rewards.lifetimeEarned',
                  'You have earned lifetime Premium access',
                )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate progress towards next reward level
  const targetLevel = nextReward.requiredLevel;
  const targetXP = LEVEL_THRESHOLDS[targetLevel - 1] ?? 0;

  // Find the XP threshold for the level *before* the first reward milestone
  // This is the "starting point" for the progress bar
  const currentLevelXP = LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;

  // Progress calculation: XP gained since current level / XP needed for target reward level
  const xpProgress = totalXP - currentLevelXP;
  const xpNeeded = targetXP - currentLevelXP;
  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100));

  const durationLabel = getDurationLabel(nextReward.durationDays, labels, t);

  return (
    <div className="w-full p-3 bg-secondary/50 rounded-xl border border-border">
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
  );
}
