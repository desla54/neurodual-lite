/**
 * ReportXPSummary - Compact XP display (1-line summary)
 *
 * Shows:
 * - XP earned this session
 * - Mini progress bar toward next level
 * - Current level
 *
 * Full breakdown available in the accordion.
 */

import { type ReactNode, useRef } from 'react';
import { Star, Confetti } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
import { LEVEL_THRESHOLDS, type XPBreakdown } from '@neurodual/logic';
import { useProgression } from '../../hooks/use-progression';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportXPSummaryProps {
  readonly sessionId: string;
  readonly xpBreakdown: XPBreakdown;
  readonly leveledUp: boolean;
  readonly newLevel: number;
  readonly labels: ReportLabels;
}

// =============================================================================
// Component
// =============================================================================

export function ReportXPSummary({
  sessionId,
  xpBreakdown,
  leveledUp,
  newLevel,
  labels,
}: ReportXPSummaryProps): ReactNode {
  const { progression, isLoading } = useProgression();
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

  if (isLoading || !stableProgression) return null;

  const currentLevel = stableProgression.level ?? 1;
  const totalXP = stableProgression.totalXP ?? 0;

  // Calculate progress toward next level
  const currentLevelXP = LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
  const nextLevelXP = LEVEL_THRESHOLDS[currentLevel] ?? currentLevelXP + 100;
  const xpIntoLevel = totalXP - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const progressPercent = Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));

  return (
    <div
      className={cn(
        'w-full p-4 rounded-2xl border transition-all',
        leveledUp
          ? 'bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-amber-500/20 border-amber-500/50'
          : 'bg-surface border-border',
      )}
    >
      <div className="flex items-center gap-4">
        {/* XP Earned */}
        <div className="flex items-center gap-2">
          {leveledUp ? (
            <Confetti size={24} weight="fill" className="text-amber-500" />
          ) : (
            <Star size={24} weight="fill" className="text-primary" />
          )}
          <span
            className={cn(
              'text-xl font-bold tabular-nums',
              leveledUp ? 'text-amber-600' : 'text-primary',
            )}
          >
            +{xpBreakdown.total}
          </span>
          <span className="text-sm text-muted-foreground">XP</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                leveledUp ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-primary',
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Level indicator */}
        <div className="text-right">
          {leveledUp ? (
            <span className="text-sm font-bold text-amber-600">
              {labels.xpLevelReached?.replace('{level}', String(newLevel)) ?? `Level ${newLevel}!`}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {labels.level?.replace('{level}', String(currentLevel)) ?? `Level ${currentLevel}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
