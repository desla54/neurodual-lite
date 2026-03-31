'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Challenge20State } from '@neurodual/logic';
import { CaretLeft, CaretRight, Trophy } from '@phosphor-icons/react';

import { useStagger } from '../animations';
import { useScrollHints } from '../hooks/use-scroll-hints';
import { cn } from '../lib/utils';
import { ChallengeDayCard } from './ChallengeDayCard';

export interface ChallengePathProps {
  readonly state: Challenge20State;
  readonly title?: string;
  readonly className?: string;
  readonly emphasis?: 'normal' | 'hero';
  readonly showHeader?: boolean;
}

export function ChallengePath({
  state,
  title,
  className,
  emphasis = 'normal',
  showHeader = true,
}: ChallengePathProps): ReactNode {
  const { t } = useTranslation();

  const cards = state.cards;

  const {
    scrollRef,
    showLeftHint: canScrollLeft,
    showRightHint: canScrollRight,
    updateScrollHints,
  } = useScrollHints({
    resetDeps: [state.config.totalDays],
    label: 'ChallengePath',
  });

  const scrollByOne = (dir: -1 | 1) => {
    const container = scrollRef.current;
    if (!container) return;
    const delta = container.clientWidth * 0.65 * dir;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Do not re-stagger the whole track on every reactive progress update.
  // That work happens outside React profiling and can become expensive on home refreshes.
  useStagger(scrollRef, '> div', { deps: [state.config.totalDays] });

  return (
    <div className={cn('w-full nd-extension-contained', className)}>
      {showHeader && (
        <div className={cn('px-1', emphasis === 'hero' ? 'mb-0' : 'mb-2')}>
          {emphasis === 'hero' && (
            <div className="flex justify-center">
              <Trophy size={24} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex items-baseline justify-center gap-1.5 min-w-0 mb-4">
            <h2 className="home-journey-name tracking-tight min-w-0 truncate">
              {title ??
                t('home.challenge.title', 'Challenge {{days}} days', {
                  days: state.config.totalDays,
                })}
            </h2>
            <span className="home-journey-separator shrink-0">·</span>
            <span className="home-journey-range font-mono shrink-0 whitespace-nowrap">
              {t('home.challenge.goal', '{{minutes}} min/day', {
                minutes: state.config.targetMinutesPerDay,
              })}
            </span>
          </div>
        </div>
      )}

      <div className={cn('relative', showHeader ? 'mt-0' : emphasis === 'hero' ? 'mt-2' : 'mt-1')}>
        {/* Scroll arrows (hero only) */}
        {emphasis === 'hero' && canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByOne(-1)}
            className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center bg-gradient-to-r from-card/60 to-transparent backdrop-blur-sm text-muted-foreground/55 hover:text-foreground transition-colors z-10 cursor-pointer"
            aria-label={t('common.previous', 'Previous')}
          >
            <CaretLeft size={20} weight="bold" />
          </button>
        )}
        {emphasis === 'hero' && canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByOne(1)}
            className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center bg-gradient-to-l from-card/60 to-transparent backdrop-blur-sm text-muted-foreground/70 hover:text-foreground transition-colors z-10 cursor-pointer"
            aria-label={t('common.next', 'Next')}
          >
            <CaretRight size={20} weight="bold" className="animate-pulse hover:animate-none" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={emphasis === 'hero' ? updateScrollHints : undefined}
          className={cn(
            'w-full flex overflow-x-auto px-3 scrollbar-hide',
            emphasis === 'hero' ? 'py-5' : 'py-2',
          )}
        >
          {cards.map((card, idx) => {
            const isCurrent = card.status === 'current';
            const isPast = card.status === 'completed';
            const isNext =
              state.currentIndex !== null &&
              !isPast &&
              !isCurrent &&
              idx + 1 === state.currentIndex + 1;
            return (
              <div
                key={card.index}
                data-challenge-index={card.index}
                className={cn('flex-shrink-0', emphasis === 'hero' ? 'mr-4' : 'mr-2')}
              >
                <ChallengeDayCard card={card} emphasis={emphasis} isPast={isPast} isNext={isNext} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
