/**
 * PullToRefresh — hooks into the nearest scroll ancestor without creating
 * a nested scroll container. The wrapped content is translated directly
 * while a capture-phase touch listener prevents the parent scroller from
 * consuming a downward pull at scrollTop=0.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Spinner } from './spinner';

export interface PullToRefreshProps {
  readonly children: ReactNode;
  readonly onRefresh: () => Promise<void>;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onHaptic?: () => void;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

const THRESHOLD = 70;
const MAX_PULL = 120;
const SETTLED_PULL = 56;
const INDICATOR_HEIGHT = 56;
const MIN_REFRESH_DURATION_MS = 900;

function applyResistance(rawDistance: number): number {
  const dampedDistance = rawDistance * 0.55;
  return Math.min(MAX_PULL, dampedDistance);
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  className,
  onHaptic,
}: PullToRefreshProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (disabled) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const scrollParent = findScrollParent(anchor);
    if (!scrollParent) return;

    refreshingRef.current = refreshing;

    let activeTouchId: number | null = null;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let pullDistance = 0;
    let hapticFired = false;
    let transitionTimeoutId = 0;
    let refreshTimeoutId = 0;
    let isActive = true;
    const initialOverscrollBehaviorY = scrollParent.style.overscrollBehaviorY;

    scrollParent.style.overscrollBehaviorY = 'contain';

    const clearTransition = () => {
      const indicator = indicatorRef.current;
      const content = contentRef.current;
      if (indicator) indicator.style.transition = '';
      if (content) content.style.transition = '';
    };

    const setTransition = (value: string) => {
      const indicator = indicatorRef.current;
      const content = contentRef.current;
      if (indicator) indicator.style.transition = value;
      if (content) content.style.transition = value;
    };

    const renderPull = (distance: number, opacityOverride?: number) => {
      const indicator = indicatorRef.current;
      const content = contentRef.current;
      const progress = Math.min(distance / THRESHOLD, 1);
      const opacity =
        opacityOverride ?? (distance <= 0 ? 0 : Math.min(1, Math.max(0.18, progress + 0.1)));

      if (content) {
        // Clear transform entirely at rest to avoid creating a permanent stacking
        // context that can affect children's rendering.
        content.style.transform = distance > 0 ? `translate3d(0, ${distance}px, 0)` : '';
        content.style.willChange = distance > 0 ? 'transform' : '';
      }

      if (indicator) {
        indicator.style.opacity = String(opacity);
        indicator.style.transform = `translate3d(0, ${distance - INDICATOR_HEIGHT}px, 0)`;
      }
    };

    const animateTo = (distance: number, opacity?: number) => {
      setTransition('transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out');
      renderPull(distance, opacity);
      if (transitionTimeoutId !== 0) {
        window.clearTimeout(transitionTimeoutId);
      }
      transitionTimeoutId = window.setTimeout(clearTransition, 240);
    };

    const resetGesture = () => {
      activeTouchId = null;
      isDragging = false;
      startX = 0;
      startY = 0;
      pullDistance = 0;
      hapticFired = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scrollParent.scrollTop > 0) return;

      const touch = e.touches[0];
      if (!touch) return;

      activeTouchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      isDragging = false;
      hapticFired = false;
      pullDistance = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeTouchId === null || refreshingRef.current) return;

      const touch = Array.from(e.touches).find((entry) => entry.identifier === activeTouchId);
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!isDragging && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
        resetGesture();
        return;
      }

      if (scrollParent.scrollTop > 0) {
        resetGesture();
        animateTo(0, 0);
        return;
      }

      if (deltaY <= 0) {
        if (pullDistance > 0) {
          renderPull(0, 0);
        }
        return;
      }

      isDragging = true;
      if (e.cancelable) e.preventDefault();

      clearTransition();
      pullDistance = applyResistance(deltaY);
      renderPull(pullDistance);

      if (!hapticFired && pullDistance >= THRESHOLD) {
        hapticFired = true;
        onHaptic?.();
      }
    };

    const onTouchEnd = () => {
      if (activeTouchId === null) return;

      const shouldRefresh = isDragging && pullDistance >= THRESHOLD;
      resetGesture();

      if (!shouldRefresh) {
        animateTo(0, 0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);

      animateTo(SETTLED_PULL, 1);

      const refreshStartedAt = Date.now();
      onRefresh()
        .catch(() => {
          // Keep the UI responsive even if the caller handles its own error reporting.
        })
        .finally(() => {
          const elapsed = Date.now() - refreshStartedAt;
          const remaining = Math.max(0, MIN_REFRESH_DURATION_MS - elapsed);

          if (refreshTimeoutId !== 0) {
            window.clearTimeout(refreshTimeoutId);
          }
          refreshTimeoutId = window.setTimeout(() => {
            if (!isActive) return;
            refreshingRef.current = false;
            animateTo(0, 0);
            setRefreshing(false);
          }, remaining);
        });
    };

    const onTouchCancel = () => {
      if (activeTouchId === null) return;
      resetGesture();
      if (!refreshingRef.current) {
        animateTo(0, 0);
      }
    };

    const onScroll = () => {
      if (scrollParent.scrollTop > 0 && pullDistance > 0 && !refreshingRef.current) {
        pullDistance = 0;
        renderPull(0, 0);
      }
    };

    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    scrollParent.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    scrollParent.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    scrollParent.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    scrollParent.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true });

    onScroll();
    renderPull(0, 0);

    return () => {
      isActive = false;
      refreshingRef.current = false;
      if (transitionTimeoutId !== 0) {
        window.clearTimeout(transitionTimeoutId);
      }
      if (refreshTimeoutId !== 0) {
        window.clearTimeout(refreshTimeoutId);
      }
      scrollParent.style.overscrollBehaviorY = initialOverscrollBehaviorY;
      scrollParent.removeEventListener('scroll', onScroll);
      scrollParent.removeEventListener('touchstart', onTouchStart, true);
      scrollParent.removeEventListener('touchmove', onTouchMove, true);
      scrollParent.removeEventListener('touchend', onTouchEnd, true);
      scrollParent.removeEventListener('touchcancel', onTouchCancel, true);
      clearTransition();
      renderPull(0, 0);
    };
  }, [disabled, onRefresh, onHaptic]);

  refreshingRef.current = refreshing;

  return (
    <div ref={anchorRef} className={cn('relative', className)}>
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-center text-muted-foreground"
        style={{
          opacity: 0,
          transform: `translate3d(0, ${-INDICATOR_HEIGHT}px, 0)`,
          willChange: 'transform, opacity',
        }}
        aria-hidden={!refreshing}
      >
        <Spinner size={22} />
      </div>
      <div ref={contentRef} className="relative" style={{}} aria-busy={refreshing}>
        {children}
      </div>
    </div>
  );
}
