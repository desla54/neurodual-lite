/**
 * Social page - Leaderboard / Rankings
 * Currently a placeholder - full implementation coming soon
 */

import { Hatching, PageTransition } from '@neurodual/ui';
import { Trophy, Rocket } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function SocialPage(): ReactNode {
  const { t } = useTranslation();

  return (
    <PageTransition className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto text-center px-4">
        {/* Coming soon card */}
        <div className="surface-card-typography bg-card border border-border/50 rounded-2xl overflow-hidden shadow-[0_2px_16px_-4px_hsl(var(--border)/0.15)]">
          {/* Header with icon */}
          <div className="pt-10 pb-6">
            <div className="w-20 h-20 mx-auto bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center mb-4">
              <Trophy size={40} className="text-amber-600 dark:text-amber-400" weight="duotone" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {t('social.comingSoon.title', 'Rankings')}
            </h2>
          </div>

          {/* Hatching separator */}
          <Hatching id="social-hatch" />

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Rocket size={20} weight="duotone" />
              <span className="font-semibold">{t('social.comingSoon.badge', 'Coming soon')}</span>
            </div>

            <p className="text-muted-foreground text-sm leading-relaxed">
              {t(
                'social.comingSoon.description',
                'Rankings are in development. Soon you will be able to compare your performance with the community, see your percentile, and track your progress.',
              )}
            </p>

            {/* Feature preview list */}
            <div className="pt-4 space-y-2 text-left">
              {[
                t('social.comingSoon.feature1', 'Global ranking by mode and level'),
                t('social.comingSoon.feature2', 'Your percentile vs the community'),
                t('social.comingSoon.feature3', 'Progress history'),
              ].map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
