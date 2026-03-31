/**
 * useStagger Hook
 *
 * Animates a list of elements with staggered timing.
 * Perfect for lists, grids, and sequential content reveals.
 *
 * Usage:
 * ```tsx
 * function MyList({ items }) {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useStagger(containerRef, '.item', { delay: 0.05 });
 *
 *   return (
 *     <div ref={containerRef}>
 *       {items.map(item => <div className="item" key={item.id}>{item.name}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */

import { type RefObject, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { DURATION, EASE, STAGGER, prefersReducedMotion } from './config';
import { profileDevEffectSync } from '../debug/dev-effect-profiler';

export interface UseStaggerOptions {
  /** Delay between each item (default: 0.05s) */
  delay?: number;
  /** Animation duration per item (default: 0.2s) */
  duration?: number;
  /** Starting Y offset (default: 10) */
  fromY?: number;
  /** Starting opacity (default: 0) */
  fromOpacity?: number;
  /** Starting scale (default: 1) */
  fromScale?: number;
  /** Easing function (default: power2.out) */
  ease?: string;
  /** Initial delay before starting (default: 0) */
  startDelay?: number;
  /** Only animate once (default: true) */
  once?: boolean;
  /** Dependency array to trigger re-animation */
  deps?: readonly unknown[];
}

/**
 * Animate child elements with staggered timing.
 *
 * @param containerRef - Reference to the parent container
 * @param selector - CSS selector for items to animate (e.g., '.item', '> *')
 * @param options - Animation options
 */
export function useStagger(
  containerRef: RefObject<HTMLElement | null>,
  selector: string,
  options: UseStaggerOptions = {},
): void {
  const {
    delay = STAGGER.standard,
    duration = DURATION.fast,
    fromY = 10,
    fromOpacity = 0,
    fromScale = 1,
    ease = EASE.out,
    startDelay = 0,
    once = true,
    deps = [],
  } = options;

  useLayoutEffect(() => {
    return profileDevEffectSync(`useStagger(${selector})`, () => {
      const container = containerRef.current;
      if (!container) return;

      // Prepend :scope to selectors starting with > (child combinator)
      const validSelector = selector.startsWith('>') ? `:scope ${selector}` : selector;
      const items = container.querySelectorAll(validSelector);
      if (items.length === 0) return;

      // Skip animation if user prefers reduced motion
      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1, y: 0, scale: 1 });
        return;
      }

      // Set initial state
      gsap.set(items, {
        opacity: fromOpacity,
        y: fromY,
        scale: fromScale,
      });

      // Animate with stagger
      const tween = gsap.to(items, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration,
        ease,
        stagger: delay,
        delay: startDelay,
      });

      return () => {
        tween.kill();
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, delay, duration, fromY, fromOpacity, fromScale, ease, startDelay, once, ...deps]);
}

/**
 * Get stagger configuration for GSAP timeline usage.
 * Useful when you need more control over the animation sequence.
 */
export function getStaggerConfig(count: number, options: UseStaggerOptions = {}) {
  const {
    delay = STAGGER.standard,
    duration = DURATION.fast,
    fromY = 10,
    fromOpacity = 0,
    ease = EASE.out,
  } = options;

  return {
    from: { opacity: fromOpacity, y: fromY },
    to: { opacity: 1, y: 0, duration, ease, stagger: delay },
    totalDuration: duration + delay * (count - 1),
  };
}
