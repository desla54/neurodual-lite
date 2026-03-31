/**
 * useButtonAnimation Hook
 *
 * Adds press/release animation to buttons and interactive elements.
 * Lightweight and performant using GSAP.
 *
 * Usage:
 * ```tsx
 * function MyButton({ children }) {
 *   const { ref, handlers } = useButtonAnimation();
 *   return (
 *     <button ref={ref} {...handlers}>
 *       {children}
 *     </button>
 *   );
 * }
 * ```
 */

import { useRef, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { DURATION, EASE, prefersReducedMotion } from './config';

export interface UseButtonAnimationOptions {
  /** Scale on press (default: 0.96) */
  pressScale?: number;
  /** Duration of press animation (default: 0.1s) */
  pressDuration?: number;
  /** Duration of release animation (default: 0.2s) */
  releaseDuration?: number;
  /** Ease for release (default: back.out) */
  releaseEase?: string;
  /** Disable animation */
  disabled?: boolean;
}

export interface UseButtonAnimationReturn<T extends HTMLElement> {
  /** Ref to attach to the element */
  ref: React.RefObject<T | null>;
  /** Event handlers to spread on the element */
  handlers: {
    onMouseDown: () => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
  };
  /** Manually trigger press animation */
  animatePress: () => void;
  /** Manually trigger release animation */
  animateRelease: () => void;
}

/**
 * Add press/release animation to interactive elements.
 */
export function useButtonAnimation<T extends HTMLElement = HTMLButtonElement>(
  options: UseButtonAnimationOptions = {},
): UseButtonAnimationReturn<T> {
  const {
    pressScale = 0.96,
    pressDuration = DURATION.micro,
    releaseDuration = DURATION.fast,
    releaseEase = EASE.spring,
    disabled = false,
  } = options;

  const ref = useRef<T | null>(null);
  const isPressedRef = useRef(false);

  const animatePress = useCallback(() => {
    if (disabled || !ref.current || prefersReducedMotion()) return;

    isPressedRef.current = true;
    gsap.killTweensOf(ref.current);
    gsap.to(ref.current, {
      scale: pressScale,
      duration: pressDuration,
      ease: 'power2.in',
    });
  }, [disabled, pressScale, pressDuration]);

  const animateRelease = useCallback(() => {
    if (disabled || !ref.current || !isPressedRef.current) return;

    isPressedRef.current = false;
    gsap.killTweensOf(ref.current);
    gsap.to(ref.current, {
      scale: 1,
      duration: releaseDuration,
      ease: releaseEase,
    });
  }, [disabled, releaseDuration, releaseEase]);

  const handlers = useMemo(
    () => ({
      onMouseDown: animatePress,
      onMouseUp: animateRelease,
      onMouseLeave: animateRelease,
      onTouchStart: animatePress,
      onTouchEnd: animateRelease,
    }),
    [animatePress, animateRelease],
  );

  return { ref, handlers, animatePress, animateRelease };
}

/**
 * useRipple - Alternative touch feedback with ripple effect.
 * For Material-style interactions.
 */
export interface UseRippleOptions {
  /** Ripple color (default: currentColor) */
  color?: string;
  /** Ripple duration (default: 0.5s) */
  duration?: number;
}

export function useRipple(options: UseRippleOptions = {}) {
  const { color = 'currentColor', duration = 0.5 } = options;
  const containerRef = useRef<HTMLElement | null>(null);

  const createRipple = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (!containerRef.current || prefersReducedMotion()) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      // Get click position
      let x: number, y: number;
      if ('touches' in event) {
        const touch = event.touches[0];
        if (!touch) return;
        x = touch.clientX - rect.left;
        y = touch.clientY - rect.top;
      } else {
        x = event.clientX - rect.left;
        y = event.clientY - rect.top;
      }

      // Create ripple element
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height) * 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x - size / 2}px;
        top: ${y - size / 2}px;
        background: ${color};
        border-radius: 50%;
        opacity: 0.2;
        pointer-events: none;
        transform: scale(0);
      `;

      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      container.appendChild(ripple);

      gsap.to(ripple, {
        scale: 1,
        opacity: 0,
        duration,
        ease: 'power1.out',
        onComplete: () => ripple.remove(),
      });
    },
    [color, duration],
  );

  return { ref: containerRef, onPointerDown: createRipple };
}
