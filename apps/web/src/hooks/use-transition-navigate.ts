/**
 * useTransitionNavigate
 *
 * Animated navigation hook that wraps React Router's navigate()
 * with coordinated exit/enter page transitions using GSAP.
 *
 * Direction options:
 * - 'push' (default): forward navigation — old slides left, new slides from right
 * - 'back': backward navigation — old slides right, new slides from left
 * - 'modal': modal presentation — old scales down, new slides up
 * - 'fade': crossfade — both fade
 *
 * Falls back to instant navigation when:
 * - User prefers reduced motion
 * - A transition is already in progress
 */

import { useCallback } from 'react';
import { useNavigate, type To, type NavigateOptions } from 'react-router';
import { usePageTransition, prefersReducedMotion, type TransitionDirection } from '@neurodual/ui';

export interface TransitionNavigateOptions extends NavigateOptions {
  direction?: TransitionDirection;
}

export function useTransitionNavigate() {
  const navigate = useNavigate();
  const { triggerExit, setTransitionDirection, isTransitioning } = usePageTransition();

  const transitionNavigate = useCallback(
    (to: To | number, options?: TransitionNavigateOptions) => {
      // Handle back navigation (number argument) — no animation
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      const { direction = 'push', ...navOptions } = options ?? {};

      // Fall back to instant navigation if reduced motion or already transitioning
      if (prefersReducedMotion() || isTransitioning) {
        navigate(to, navOptions);
        return;
      }

      // Set direction, trigger exit, then navigate
      setTransitionDirection(direction);
      triggerExit().then(() => {
        navigate(to, navOptions);
      });
    },
    [navigate, triggerExit, setTransitionDirection, isTransitioning],
  );

  return { transitionNavigate, isTransitioning };
}
