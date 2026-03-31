/**
 * XP Bar
 *
 * Displays level progress with XP bar and premium milestone markers.
 * Woven Flat design - no shadows, pure flat aesthetic.
 *
 * Milestones:
 * - Level 5: 7 days Premium (Gift icon)
 * - Level 10: 1 month Premium (Trophy icon)
 * - Level 20: 3 months Premium (Trophy icon)
 * - Level 30: Lifetime Access (Crown icon)
 */

import { Crown, Gift, Trophy } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface XPBarProps {
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  className?: string;
}

interface Milestone {
  level: number;
  icon: typeof Gift;
  label: string;
  color: string;
}

// =============================================================================
// Constants
// =============================================================================

const MILESTONES: Milestone[] = [
  { level: 5, icon: Gift, label: '7j', color: 'text-emerald-500' },
  { level: 10, icon: Trophy, label: '1m', color: 'text-amber-500' },
  { level: 20, icon: Trophy, label: '3m', color: 'text-orange-500' },
  { level: 30, icon: Crown, label: '∞', color: 'text-purple-500' },
];

// Max level for progress bar visualization (beyond 30, milestones are done)
const MAX_DISPLAY_LEVEL = 35;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate position percentage for a level on the progress bar.
 */
function getLevelPosition(level: number): number {
  return Math.min((level / MAX_DISPLAY_LEVEL) * 100, 100);
}

// =============================================================================
// Subcomponents
// =============================================================================

interface MilestoneMarkerProps {
  milestone: Milestone;
  currentLevel: number;
}

function MilestoneMarker({ milestone, currentLevel }: MilestoneMarkerProps): ReactNode {
  const { t } = useTranslation();
  const isUnlocked = currentLevel >= milestone.level;
  const position = getLevelPosition(milestone.level);
  const Icon = milestone.icon;

  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
      style={{ left: `${position}%` }}
    >
      {/* Marker dot on the bar */}
      <div
        className={cn(
          'relative w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center transition-all',
          isUnlocked ? 'bg-primary border-primary' : 'bg-secondary border-border',
        )}
      >
        <Icon
          size={8}
          className={cn(
            isUnlocked ? 'text-primary-foreground' : milestone.color,
            'transition-colors sm:w-[10px] sm:h-[10px]',
          )}
        />
      </div>

      {/* Label below */}
      <span
        className={cn(
          'absolute top-7 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap sm:hidden',
          isUnlocked ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        N{milestone.level}
      </span>
      <span
        className={cn(
          'absolute top-7 text-xxs font-bold uppercase tracking-wider whitespace-nowrap hidden sm:block',
          isUnlocked ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {t('progression.levelShort', { level: milestone.level, defaultValue: 'Lv. {{level}}' })}
      </span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function XPBar({ level, xpInLevel, xpForNextLevel, className }: XPBarProps): ReactNode {
  const { t } = useTranslation();
  // Progress within current level (0-100%)
  const levelProgress = xpForNextLevel > 0 ? (xpInLevel / xpForNextLevel) * 100 : 100;
  const nextLevel = level + 1;

  // Global progress across all levels (for milestone visualization)
  const globalProgress =
    getLevelPosition(level) + (levelProgress / 100) * (100 / MAX_DISPLAY_LEVEL);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Level Display - Woven Style */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Level Circle - Elegant, no shadow */}
          <div className="relative">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary">
              <span className="text-2xl font-bold italic text-primary">{level}</span>
            </div>
            {/* Decorative hatched ring */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20 scale-110" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t('stats.simple.currentLevel', 'Current level')}
            </p>
          </div>
        </div>

        {/* Next level */}
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t('progression.nextLevel', 'Next level')}
          </p>
          <p className="text-sm text-foreground font-semibold">N{nextLevel}</p>
        </div>
      </div>
      <p className="text-3xs text-muted-foreground font-medium uppercase tracking-wider text-right">
        {xpInLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
      </p>

      {/* Progress Bar with Milestones */}
      <div className="relative pt-2 pb-8">
        {/* Background bar */}
        <div className="relative h-3 bg-secondary rounded-full overflow-visible border border-border">
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(globalProgress, 100)}%` }}
          />

          {/* Milestone markers */}
          {MILESTONES.map((milestone) => (
            <MilestoneMarker key={milestone.level} milestone={milestone} currentLevel={level} />
          ))}
        </div>
      </div>
    </div>
  );
}
