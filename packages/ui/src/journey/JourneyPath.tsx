'use client';

/**
 * JourneyPath - Horizontal scrollable journey map
 *
 * Displays journey stages in a horizontally scrollable container.
 * Number of stages is dynamic based on targetLevel (4 modes per level).
 */

import {
  generateJourneyStages,
  type JourneyStageProgress,
  type JourneyState,
} from '@neurodual/logic';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useStagger } from '../animations';
import { profileDevEffectSync } from '../debug/dev-effect-profiler';
import { useScrollHints } from '../hooks/use-scroll-hints';
import { JourneyStageCard } from './JourneyStageCard';

export interface JourneyPathProps {
  /** Journey state */
  state: JourneyState;
  /** @deprecated No longer used — premium gate is time-based, not level-based */
  hasPremium?: boolean;
  /** Click handler for a stage */
  onStageClick?: (stageId: number) => void;
  /** Specific game mode for simulator journeys (affects icon) */
  gameMode?: 'dualnback-classic' | 'sim-brainworkshop' | 'dual-trace' | string;
  /** Translations */
  labels?: {
    locked?: string;
    pick?: string;
    catch?: string;
    place?: string;
    memo?: string;
    simulator?: string;
    journey?: string;
  };
  /** Custom class name */
  className?: string;
  /** Visual emphasis preset */
  emphasis?: 'normal' | 'hero';
}

export function JourneyPath({
  state,
  hasPremium: _hasPremium,
  onStageClick,
  gameMode,
  labels,
  className,
  emphasis = 'normal',
}: JourneyPathProps) {
  const { t } = useTranslation();

  const {
    scrollRef,
    showLeftHint: canScrollLeft,
    showRightHint: canScrollRight,
    updateScrollHints,
  } = useScrollHints({
    // No resetDeps — auto-center is handled by the custom effect below
    layoutDeps: [
      emphasis,
      state.currentStage,
      state.isSimulator,
      state.startLevel,
      state.targetLevel,
    ],
    label: 'JourneyPath',
  });

  const centerStage = useCallback(
    (stageId: number, behavior: ScrollBehavior) => {
      const container = scrollRef.current;
      if (!container) return;

      const stageElement = container.querySelector<HTMLElement>(`[data-stage-id="${stageId}"]`);
      if (!stageElement) return;

      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const targetLeft =
        stageElement.offsetLeft - (container.clientWidth - stageElement.offsetWidth) / 2;
      const clamped = Math.max(0, Math.min(maxScroll, targetLeft));

      container.scrollTo({ left: clamped, behavior });
    },
    [scrollRef],
  );

  // Stagger animation for stage cards
  useStagger(scrollRef, '> div', { deps: [state.targetLevel, state.startLevel] });

  // Auto-scroll to current stage (centered when progression has started)
  useEffect(() => {
    return profileDevEffectSync('JourneyPath.autoCenter', () => {
      const container = scrollRef.current;
      if (!container) return;

      if (state.currentStage > 1) {
        const scrollTarget = Math.min(state.currentStage, state.stages.length);
        const rafId = requestAnimationFrame(() => {
          centerStage(scrollTarget, 'auto');
          updateScrollHints();
        });
        return () => cancelAnimationFrame(rafId);
      }

      container.scrollLeft = 0;
      updateScrollHints();
    });
  }, [centerStage, scrollRef, state.currentStage, state.stages.length, updateScrollHints]);

  // Get progress for a stage
  const getStageProgress = (stageId: number): JourneyStageProgress => {
    return (
      state.stages.find((s) => s.stageId === stageId) ?? {
        stageId,
        status: 'locked',
        validatingSessions: 0,
        bestScore: null,
      }
    );
  };
  const stageDefinitions = generateJourneyStages(
    state.targetLevel,
    state.startLevel,
    state.isSimulator,
  );

  return (
    <div className={cn('w-full nd-extension-contained', className)}>
      {/* Header */}
      {labels?.journey && (
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{labels.journey}</h3>
      )}

      {/* Scrollable container */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={emphasis === 'hero' ? updateScrollHints : undefined}
          className={cn(
            'w-full flex overflow-x-auto px-3 scrollbar-hide',
            emphasis === 'hero' ? 'py-2' : 'py-2',
          )}
        >
          {stageDefinitions.map((definition, index) => {
            const progress = getStageProgress(definition.stageId);
            const isCurrent = state.currentStage === definition.stageId;
            const isNext = definition.stageId === state.currentStage + 1;
            const isPast = definition.stageId < state.currentStage;
            const isPreviousOfCurrent = definition.stageId === state.currentStage - 1;
            const isLast = index === stageDefinitions.length - 1;
            const isAccessible = true; // All stages accessible; premium gate is time-based
            const spacingClass = isLast
              ? ''
              : emphasis === 'hero'
                ? isCurrent || isPreviousOfCurrent
                  ? 'mr-4 sm:mr-5'
                  : 'mr-2 sm:mr-2.5'
                : isCurrent || isPreviousOfCurrent
                  ? 'mr-3'
                  : 'mr-2';

            // Pass strikes only to the current stage (BrainWorkshop binary mode)
            const showStrikes = isCurrent && state.consecutiveStrikes !== undefined;

            return (
              <div
                key={definition.stageId}
                data-stage-id={definition.stageId}
                className={cn('flex-shrink-0', spacingClass)}
              >
                <JourneyStageCard
                  definition={definition}
                  progress={progress}
                  isCurrent={isCurrent}
                  isNext={isNext}
                  isPast={isPast}
                  isAccessible={isAccessible}
                  gameMode={gameMode}
                  emphasis={emphasis}
                  labels={labels}
                  consecutiveStrikes={showStrikes ? state.consecutiveStrikes : undefined}
                  onClick={onStageClick ? () => onStageClick(definition.stageId) : undefined}
                />
              </div>
            );
          })}
        </div>

        {emphasis === 'hero' && canScrollRight && (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
            className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center bg-gradient-to-l from-card/60 to-transparent backdrop-blur-sm text-muted-foreground/70 hover:text-foreground transition-colors z-10 cursor-pointer"
            aria-label={t('aria.scrollRight', 'Scroll right')}
          >
            <CaretRight size={20} weight="bold" className="animate-pulse hover:animate-none" />
          </button>
        )}

        {emphasis === 'hero' && canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
            className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center bg-gradient-to-r from-card/60 to-transparent backdrop-blur-sm text-muted-foreground/55 hover:text-foreground transition-colors z-10 cursor-pointer"
            aria-label={t('aria.scrollLeft', 'Scroll left')}
          >
            <CaretLeft size={20} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
