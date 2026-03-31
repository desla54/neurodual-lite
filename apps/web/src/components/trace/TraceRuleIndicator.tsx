/**
 * TraceRuleIndicator - Dynamic rule/feedback indicator for Dual Trace mode
 *
 * Three display modes:
 *
 * 1. MODALITY RULES (2+ modalities): Shows which modalities are scorable
 *    - Active = full opacity
 *    - Inactive = very low opacity (nearly invisible)
 *
 * 2. SWIPE DIRECTION (1 modality + dynamicSwipeDirection): Shows swipe direction
 *    - n-to-target: Swipe from current position to N-back target
 *    - target-to-n: Swipe from N-back target to current position
 *
 * 3. FEEDBACK mode (after trial): Shows results per modality
 *    - Green = correct (hit or correctRejection)
 *    - Red = error (miss)
 *    - Yellow/Orange = responded when not asked (falseAlarm)
 *
 * Icons:
 * - Position: GridNine
 * - Audio: Waveform
 * - Color: Palette
 * - Swipe direction: Custom arrow with N/C labels
 */

import { cn } from '@neurodual/ui';
import { memo, type ReactNode } from 'react';
import type { TraceModality, TraceModalityResult, SwipeDirection } from '@neurodual/logic';
import { GridNine, Waveform, Palette, ArrowRight } from '@phosphor-icons/react';

// =============================================================================
// Constants
// =============================================================================

const ICON_SIZE = 44;

// =============================================================================
// Types
// =============================================================================

export interface TraceRuleIndicatorProps {
  /** Display mode: 'rule' shows active/inactive, 'feedback' shows results */
  mode?: 'rule' | 'feedback';
  /** Which modalities are active for this trial (used in rule mode) */
  activeModalities: readonly TraceModality[];
  /** Which modalities are enabled in settings */
  enabledModalities: readonly TraceModality[];
  /** SDT results per modality (used in feedback mode) */
  modalityResults?: Readonly<Record<TraceModality, TraceModalityResult>> | null;
  /** Whether to show the indicator (false = hidden) */
  visible?: boolean;
  /** Seed for shuffling icon order (e.g., trialIndex). Same seed = same order. */
  shuffleSeed?: number;
  /** Whether dynamic swipe direction is enabled (shows direction instead of modalities) */
  dynamicSwipeDirection?: boolean;
  /** Current swipe direction for this trial */
  swipeDirection?: SwipeDirection;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the color class for a modality result in feedback mode.
 * - hit, correctRejection → green (correct behavior)
 * - miss → red (should have responded but didn't, or wrong response)
 * - falseAlarm → yellow/orange (responded when not asked)
 */
function getFeedbackColorClass(result: TraceModalityResult | undefined): string {
  if (!result) return 'text-woven-text/10';

  switch (result) {
    case 'hit':
    case 'correctRejection':
      return 'text-woven-correct';
    case 'miss':
      return 'text-woven-incorrect';
    case 'falseAlarm':
      return 'text-woven-focus';
    default:
      return 'text-woven-text/10';
  }
}

/**
 * Deterministic shuffle based on seed.
 * Same seed always produces same order.
 */
function shuffleWithSeed<T>(array: readonly T[], seed: number): T[] {
  const result = [...array];
  // Simple seeded random using LCG (Linear Congruential Generator)
  // Multiply seed by large prime to spread values across the state space
  let s = (seed * 2654435761) >>> 0; // >>> 0 ensures unsigned 32-bit
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

// =============================================================================
// Swipe Direction Indicator
// =============================================================================

interface SwipeDirectionIndicatorProps {
  direction: SwipeDirection;
}

/**
 * Visual indicator for swipe direction.
 * Shows N (current) and C (cible/target) with an arrow indicating direction.
 */
function SwipeDirectionIndicator({ direction }: SwipeDirectionIndicatorProps): ReactNode {
  const isNToTarget = direction === 'n-to-target';

  // N = position actuelle du stimulus (bleu)
  // C = cible N-back (orange)
  const leftLabel = isNToTarget ? 'N' : 'C';
  const rightLabel = isNToTarget ? 'C' : 'N';
  const leftColor = isNToTarget ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white';
  const rightColor = isNToTarget ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white';

  return (
    <div className="flex items-center gap-3">
      {/* Left badge */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg',
          leftColor,
        )}
      >
        {leftLabel}
      </div>

      {/* Arrow */}
      <ArrowRight size={32} weight="bold" className="text-woven-text" />

      {/* Right badge */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg',
          rightColor,
        )}
      >
        {rightLabel}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export const TraceRuleIndicator = memo(function TraceRuleIndicator({
  mode = 'rule',
  activeModalities,
  enabledModalities,
  modalityResults = null,
  visible = true,
  shuffleSeed,
  dynamicSwipeDirection = false,
  swipeDirection,
}: TraceRuleIndicatorProps): ReactNode {
  // Only show modalities that are enabled in settings
  const enabledList = (['position', 'audio', 'color'] as const).filter((m) =>
    enabledModalities.includes(m),
  );

  const hasOnlyPosition = enabledList.length === 1 && enabledList[0] === 'position';

  // Case 1: Only position modality with dynamic swipe direction
  if (hasOnlyPosition && dynamicSwipeDirection && swipeDirection && mode === 'rule') {
    return (
      <div
        className={cn(
          'flex items-center justify-center transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <SwipeDirectionIndicator direction={swipeDirection} />
      </div>
    );
  }

  // Case 2: Only one modality without dynamic swipe direction - nothing to show
  if (enabledList.length <= 1) {
    return null;
  }

  // Case 3: Multiple modalities - show modality indicators
  // Shuffle order if seed provided (prevents spatial memorization)
  const modalitiesToShow =
    shuffleSeed !== undefined ? shuffleWithSeed(enabledList, shuffleSeed) : enabledList;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-8 transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      {modalitiesToShow.map((modality) => {
        // Determine color based on mode
        let colorClass: string;

        if (mode === 'feedback' && modalityResults) {
          colorClass = getFeedbackColorClass(modalityResults[modality]);
        } else {
          // Rule mode: active = visible, inactive = nearly invisible
          const isActive = activeModalities.includes(modality);
          colorClass = isActive ? 'text-woven-text' : 'text-woven-text/10';
        }

        return (
          <div key={modality} className={cn('transition-colors duration-200', colorClass)}>
            {modality === 'position' && <GridNine size={ICON_SIZE} weight="regular" />}
            {modality === 'audio' && <Waveform size={ICON_SIZE} weight="regular" />}
            {modality === 'color' && <Palette size={ICON_SIZE} weight="regular" />}
          </div>
        );
      })}
    </div>
  );
});
