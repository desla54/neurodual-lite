/**
 * GuidedTimeline - Affiche les N derniers stimuli pour aider l'utilisateur
 *
 * Utilisé en mode guidé pour visualiser l'historique.
 * Le mode miroir duplique la timeline inversée au-dessus.
 *
 * When trialColorCoding is enabled, each trial keeps its assigned color
 * as it moves through the timeline (N → N-1 → N-2 → ...).
 * Colors use a minimal palette (nLevel + 2 colors) to avoid adjacent duplicates.
 */

import type { Trial } from '@neurodual/logic';
import { memo, useState } from 'react';
import { cn } from '../lib/utils';
import { TimelineCard } from './timeline-card';
import { getTrialBorderColorForNLevel } from './trial-colors';
import { useMountEffect } from '../hooks';

// =============================================================================
// Types
// =============================================================================

interface GuidedTimelineProps {
  trials: Trial[];
  nLevel: number;
  mirrorMode?: boolean;
  /** Enable trial color coding - colors follow trials through timeline */
  trialColorCoding?: boolean;
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Legacy colors for non-color-coded mode */
const CYCLE_COLORS = ['green', 'orange', 'red', 'blue'] as const;

const BORDER_COLOR_KEYS = ['green', 'orange', 'red', 'blue', 'slate'] as const;

// =============================================================================
// Component
// =============================================================================

export const GuidedTimeline = memo(function GuidedTimeline({
  trials,
  nLevel,
  mirrorMode = false,
  trialColorCoding = false,
  className,
}: GuidedTimelineProps) {
  // Adaptation aux petits écrans
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useMountEffect(() => {
    const check = () => setIsSmallScreen(window.innerWidth < 375);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  });

  const cardSpacing = isSmallScreen ? 52 : 76;
  const currentIndex = trials.length - 1;

  // Slots à afficher: du plus ancien (N) au plus récent (0)
  const slotsToCheck = Array.from({ length: nLevel + 1 }, (_, i) => i).reverse();

  const getCardProps = (distFromCurrent: number, isMirrored: boolean) => {
    const targetIndex = currentIndex - distFromCurrent;
    const trial = targetIndex >= 0 ? trials[targetIndex] : null;
    const isCurrent = distFromCurrent === 0;

    // Color logic: when trialColorCoding is enabled, use the trial-aware colors
    // that follow each trial through the timeline
    let borderColorKey: (typeof BORDER_COLOR_KEYS)[number] = 'slate';
    let borderColorClass: string | undefined;

    if (targetIndex >= 0) {
      if (trialColorCoding) {
        // Use the N-level aware color system - color follows the trial
        borderColorClass = getTrialBorderColorForNLevel(targetIndex, nLevel);
      } else {
        // Legacy: cycle colors based on position (not trial-aware)
        const numColors = nLevel + 1;
        const colorKey = CYCLE_COLORS[targetIndex % numColors] ?? 'slate';
        borderColorKey = borderKeyFrom(colorKey);
      }
    }

    // Positionnement
    const direction = isMirrored ? 1 : -1;
    const translateX = direction * distFromCurrent * cardSpacing;
    const zIndex = 10 - distFromCurrent;
    const opacity = Math.max(0.6, 1 - distFromCurrent * 0.15);
    const scale = isCurrent ? 1.05 : 1.0;
    const label = distFromCurrent === 0 ? 'N' : `N-${distFromCurrent}`;

    return {
      trial,
      isCurrent,
      borderColorKey,
      borderColorClass,
      translateX,
      zIndex,
      opacity,
      scale,
      label,
    };
  };

  const renderRow = (isMirrored: boolean) => (
    <div className="relative h-20 xs:h-28 w-full flex items-end justify-center pb-1">
      {slotsToCheck.map((dist) => {
        const props = getCardProps(dist, isMirrored);
        return (
          <div
            key={`${isMirrored ? 'mirror-' : ''}${dist}`}
            className="absolute transition-[transform,opacity] duration-500 ease-in-out will-change-transform"
            style={{
              transform: `translateX(${props.translateX}px) scale(${props.scale})${isMirrored ? ' scaleX(-1)' : ''}`,
              zIndex: props.zIndex,
              opacity: props.trial ? props.opacity : 0.3,
            }}
          >
            <TrialCard
              trial={props.trial ?? null}
              borderColorKey={props.borderColorKey}
              borderColorClass={props.borderColorClass}
              isCurrent={props.isCurrent}
              label={props.label}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        'relative w-full flex flex-col items-center justify-center select-none gap-1 xs:gap-2',
        mirrorMode ? 'h-44 xs:h-60' : 'h-20 xs:h-28',
        className,
      )}
    >
      {mirrorMode && renderRow(true)}
      {renderRow(false)}
    </div>
  );
});

// =============================================================================
// TrialCard
// =============================================================================

interface TrialCardProps {
  trial: Trial | null;
  borderColorKey: (typeof BORDER_COLOR_KEYS)[number];
  borderColorClass?: string;
  isCurrent: boolean;
  label: string;
}

function TrialCard({ trial, borderColorKey, borderColorClass, isCurrent, label }: TrialCardProps) {
  const isEmpty = trial === null;

  return (
    <TimelineCard
      label={label}
      isCurrent={isCurrent}
      borderColorKey={borderColorKey}
      borderColorClass={borderColorClass}
      sound={trial?.sound}
      position={trial?.position}
      color={trial?.color}
      isEmpty={isEmpty}
    />
  );
}

function borderKeyFrom(key: string): (typeof BORDER_COLOR_KEYS)[number] {
  if (BORDER_COLOR_KEYS.includes(key as (typeof BORDER_COLOR_KEYS)[number])) {
    return key as (typeof BORDER_COLOR_KEYS)[number];
  }
  return 'slate';
}
