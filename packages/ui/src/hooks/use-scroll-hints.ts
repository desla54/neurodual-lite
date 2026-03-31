// biome-ignore lint/style/noRestrictedImports: useEffect needed for DOM scroll observation lifecycle
import { useCallback, useEffect, useRef, useState } from 'react';
import { profileDevEffectSync } from '../debug/dev-effect-profiler';

export interface UseScrollHintsOptions {
  /**
   * Dependencies that trigger a scroll-to-start reset.
   * When any of these change, `scrollLeft` is set to 0 and hints recalculate.
   * If `undefined` (the default), no auto-reset effect is installed — the caller
   * is responsible for scrolling programmatically.
   */
  readonly resetDeps?: ReadonlyArray<unknown>;

  /**
   * Extra dependencies that trigger the layout observer to re-attach.
   * Useful when the container's content changes structurally.
   */
  readonly layoutDeps?: ReadonlyArray<unknown>;

  /** Profiler label prefix (defaults to 'ScrollHints'). */
  readonly label?: string;
}

export interface UseScrollHintsReturn {
  /** Whether the container can scroll left (scrollLeft > 8px). */
  showLeftHint: boolean;
  /** Whether the container can scroll right (scrollLeft < maxScroll - 8px). */
  showRightHint: boolean;
  /** Ref to attach to the scrollable container element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Call this on the container's `onScroll` to keep hints up-to-date. */
  updateScrollHints: () => void;
}

/**
 * useScrollHints
 *
 * Manages left/right scroll overflow indicators for a horizontally scrollable container.
 * Sets up a ResizeObserver + window resize listener to recalculate, and optionally
 * resets scroll position when `resetDeps` change.
 */
export function useScrollHints({
  resetDeps,
  layoutDeps = [],
  label = 'ScrollHints',
}: UseScrollHintsOptions = {}): UseScrollHintsReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < maxScroll - 8);
  }, []);

  // Reset scroll position when resetDeps change (only if resetDeps is provided)
  useEffect(() => {
    if (resetDeps === undefined) return;
    return profileDevEffectSync(`${label}.initScroll`, () => {
      const container = scrollRef.current;
      if (!container) return;
      const rafId = requestAnimationFrame(() => {
        container.scrollLeft = 0;
        updateScrollHints();
      });
      return () => cancelAnimationFrame(rafId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...(resetDeps ?? []), updateScrollHints]);

  // Layout observers: ResizeObserver + window resize
  useEffect(() => {
    return profileDevEffectSync(`${label}.layoutObservers`, () => {
      const el = scrollRef.current;
      if (!el) return;

      updateScrollHints();

      const onResize = () => updateScrollHints();
      window.addEventListener('resize', onResize);

      let rafId = 0;
      let resizeObserver: ResizeObserver | null = null;

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(updateScrollHints);
        });
        resizeObserver.observe(el);
      }

      return () => {
        cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        window.removeEventListener('resize', onResize);
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...layoutDeps, updateScrollHints]);

  return {
    showLeftHint: canScrollLeft,
    showRightHint: canScrollRight,
    scrollRef,
    updateScrollHints,
  };
}
