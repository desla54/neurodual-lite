/**
 * ScrollableChart - Horizontally scrollable chart container
 *
 * Provides a scrollable area for charts with an optional fixed Y-axis
 * on the left side. Auto-scrolls to the right (most recent data) on mount.
 *
 * When rendered inside a FullscreenChartModal, scrolling is disabled and the
 * chart stretches to fill the available width.
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft } from '@phosphor-icons/react';
import { useIsChartFullscreen, useFullscreenChartHeight } from './chart-fullscreen-context';

export interface ScrollableChartProps {
  /** Minimum width of the chart content */
  readonly minWidth: number;
  /** Height of the chart */
  readonly height: number;
  /** Fixed Y-axis element to display on the left */
  readonly yAxis?: ReactNode;
  /** Width of the fixed Y-axis area */
  readonly yAxisWidth?: number;
  /**
   * Optional initial scroll positioning callback.
   * Return a desired `scrollLeft` value in px; it will be clamped to valid bounds.
   */
  readonly getInitialScrollLeft?: (el: HTMLDivElement) => number;
  /** Chart content */
  readonly children: ReactNode;
}

export function ScrollableChart({
  minWidth,
  height,
  yAxis,
  yAxisWidth = 35,
  getInitialScrollLeft,
  children,
}: ScrollableChartProps): ReactNode {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const isFullscreen = useIsChartFullscreen();
  const fsHeight = useFullscreenChartHeight(height);

  // Auto-scroll on mount and when minWidth changes.
  // Defaults to the end (most recent), but callers can override to focus on the last filled point.
  useEffect(() => {
    if (isFullscreen) return;
    const el = scrollRef.current;
    if (el) {
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const desiredScrollLeft =
        typeof getInitialScrollLeft === 'function' ? getInitialScrollLeft(el) : maxScrollLeft;
      const nextScrollLeft = Number.isFinite(desiredScrollLeft) ? desiredScrollLeft : maxScrollLeft;

      el.scrollLeft = Math.max(0, Math.min(nextScrollLeft, maxScrollLeft));
      setCanScrollLeft(el.scrollLeft > 0);
    }
  }, [getInitialScrollLeft, isFullscreen, minWidth]);

  // Track scroll position to show/hide left indicator
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 10);
    }
  }, []);

  // Scroll left by 100px when button clicked
  const scrollLeft = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollBy({ left: -120, behavior: 'smooth' });
    }
  }, []);

  // In fullscreen mode: no scrolling, chart fills available width and adapts height
  if (isFullscreen) {
    return (
      <div className="flex">
        {yAxis && <div style={{ width: yAxisWidth, height: fsHeight, flexShrink: 0 }}>{yAxis}</div>}
        <div className="relative flex-1 min-w-0">
          <div style={{ height: fsHeight }}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Fixed Y-axis on the left */}
      {yAxis && <div style={{ width: yAxisWidth, height, flexShrink: 0 }}>{yAxis}</div>}
      {/* Scrollable chart area */}
      <div className="relative flex-1 min-w-0">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={scrollLeft}
            className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface via-surface/80 to-transparent z-10 flex items-center justify-start pl-1 cursor-pointer hover:from-surface/90 transition-colors"
            aria-label={t('aria.scrollLeft')}
          >
            <CaretLeft size={16} weight="bold" className="text-muted-foreground" />
          </button>
        )}
        <div ref={scrollRef} className="overflow-x-auto" onScroll={handleScroll}>
          <div style={{ minWidth, height }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
