/**
 * Progression View
 *
 * Full progression tab with XP bar, milestone preview, and badge grid.
 * Woven Flat design - no shadows, pure flat aesthetic.
 */

import {
  BADGES,
  getBadgesByCategory,
  getXPForNextLevel,
  getXPInCurrentLevel,
  type BadgeCategory,
  type UserProgression,
} from '@neurodual/logic';
import { cn } from '../lib/utils';
import { BadgeCard } from './badge-card';
import { NextMilestonePreview, ProgressionTimeline } from './progression-timeline';
import { XPBar } from './xp-bar';

export interface ProgressionViewLabels {
  readonly title?: string;
  readonly level?: string;
  readonly totalXP?: string;
  readonly sessions?: string;
  readonly badges?: string;
  readonly nextMilestone?: string;
  readonly milestoneTimeline?: string;
  readonly categories?: Record<BadgeCategory, string>;
}

export interface ProgressionViewProps {
  progression: UserProgression;
  labels?: ProgressionViewLabels;
  className?: string;
  /** Hide premium reward milestones (timeline + next milestone preview) */
  showRewardMilestones?: boolean;
}

const DEFAULT_LABELS: Required<ProgressionViewLabels> = {
  title: 'Progression',
  level: 'Level',
  totalXP: 'Total XP',
  sessions: 'Sessions',
  badges: 'Badges',
  nextMilestone: 'Next milestone',
  milestoneTimeline: 'Premium Path',
  categories: {
    consistency: 'Consistency',
    performance: 'Performance',
    resilience: 'Resilience',
    exploration: 'Exploration',
    milestone: 'Milestones',
    cognitive: 'Neuroscience',
  },
};

const CATEGORY_ORDER: BadgeCategory[] = [
  'milestone',
  'performance',
  'cognitive',
  'consistency',
  'resilience',
  'exploration',
];

export function ProgressionView({
  progression,
  labels = {},
  className,
  showRewardMilestones = true,
}: ProgressionViewProps) {
  const l = {
    ...DEFAULT_LABELS,
    ...labels,
    categories: { ...DEFAULT_LABELS.categories, ...labels?.categories },
  };

  const unlockedBadgeIds = new Set(progression.unlockedBadges.map((b) => b.badgeId));
  const unlockedCount = unlockedBadgeIds.size;
  const totalBadges = BADGES.length;

  return (
    <div className={cn('space-y-8', className)}>
      {/* XP Section - Flat design */}
      <section className="p-6 rounded-2xl bg-surface border border-border">
        <XPBar
          level={progression.level}
          xpInLevel={getXPInCurrentLevel(progression.totalXP)}
          xpForNextLevel={getXPForNextLevel(progression.level)}
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{progression.completedSessions}</p>
            <p className="text-xs text-muted-foreground">{l.sessions}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {progression.totalXP.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">{l.totalXP}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {unlockedCount}/{totalBadges}
            </p>
            <p className="text-xs text-muted-foreground">{l.badges}</p>
          </div>
        </div>
      </section>

      {/* Next Milestone Preview - hidden when rewards disabled */}
      {showRewardMilestones && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            {l.nextMilestone}
          </h3>
          <NextMilestonePreview level={progression.level} totalXP={progression.totalXP} />
        </section>
      )}

      {/* Premium Milestone Timeline - hidden when rewards disabled */}
      {showRewardMilestones && (
        <section className="p-6 rounded-2xl bg-surface border border-border">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
            {l.milestoneTimeline}
          </h3>
          <ProgressionTimeline level={progression.level} totalXP={progression.totalXP} />
        </section>
      )}

      {/* Badges Section */}
      {CATEGORY_ORDER.map((category) => {
        const categoryBadges = getBadgesByCategory(category);
        if (categoryBadges.length === 0) return null;

        return (
          <section key={category}>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              {l.categories[category]}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {categoryBadges.map((badge) => {
                const unlocked = unlockedBadgeIds.has(badge.id);
                const unlockedBadge = progression.unlockedBadges.find(
                  (b) => b.badgeId === badge.id,
                );
                return (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    unlocked={unlocked}
                    unlockedAt={unlockedBadge?.unlockedAt}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
