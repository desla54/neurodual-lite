/**
 * ProgressionTab - XP, badges, and level progression display
 *
 * Simple wrapper around ProgressionView component with loading/error states.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Warning, Medal } from '@phosphor-icons/react';
import { ProgressionView } from '../../progression';
import { useProgression } from '../../hooks';

export interface ProgressionTabProps {
  /** Hide premium reward milestones (timeline + next milestone preview) */
  showRewardMilestones?: boolean;
}

export function ProgressionTab({ showRewardMilestones = true }: ProgressionTabProps): ReactNode {
  const { t } = useTranslation();
  const { progression, isLoading, error } = useProgression();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
          <Medal size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
          <Warning size={32} className="text-destructive" />
        </div>
        <p className="text-sm text-destructive">
          {t('stats.progression.error', { message: error.message })}
        </p>
      </div>
    );
  }

  if (!progression) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 opacity-60">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
          <Medal size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('stats.progression.noProgression')}</p>
        <p className="text-xs text-muted-foreground">{t('stats.progression.noProgressionHint')}</p>
      </div>
    );
  }

  const labels = {
    title: t('stats.progression.title'),
    level: t('stats.progression.level'),
    totalXP: t('stats.progression.totalXP'),
    sessions: t('stats.progression.sessions'),
    badges: t('stats.progression.badges'),
    nextMilestone: t('stats.progression.nextMilestone'),
    milestoneTimeline: t('stats.progression.milestoneTimeline'),
    categories: {
      consistency: t('stats.progression.categories.consistency'),
      performance: t('stats.progression.categories.performance'),
      resilience: t('stats.progression.categories.resilience'),
      exploration: t('stats.progression.categories.exploration'),
      milestone: t('stats.progression.categories.milestone'),
      cognitive: t('stats.progression.categories.cognitive'),
    },
  };

  return (
    <div>
      <ProgressionView
        progression={progression}
        labels={labels}
        showRewardMilestones={showRewardMilestones}
      />
    </div>
  );
}
