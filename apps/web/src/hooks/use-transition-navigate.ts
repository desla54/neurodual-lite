/**
 * useTransitionNavigate
 *
 * Animated navigation hook that wraps React Router's navigate()
 * with direction-aware enter transitions using GSAP.
 *
 * Instead of a sequential exit→navigate→enter flow (which causes a visible
 * flash), we navigate immediately and let the new page's <PageTransition>
 * handle the enter animation. React unmounts the old page instantly,
 * the new page fades/slides in — no gap, no flash.
 *
 * Direction options:
 * - 'push': forward — new slides from right
 * - 'back': backward — new slides from left
 * - 'modal': modal — new scales up
 * - 'fade': crossfade
 */

import { useCallback } from 'react';
import { useNavigate, type To, type NavigateOptions } from 'react-router';
import { usePageTransition, type TransitionDirection } from '@neurodual/ui';

export interface TransitionNavigateOptions extends NavigateOptions {
  direction?: TransitionDirection;
}

export function useTransitionNavigate() {
  const navigate = useNavigate();
  const { setTransitionDirection } = usePageTransition();

  const transitionNavigate = useCallback(
    (to: To | number, options?: TransitionNavigateOptions) => {
      // Handle back navigation (number argument) — no animation
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      const { direction = 'push', ...navOptions } = options ?? {};

      // Set direction so the next PageTransition reads it for enter animation
      setTransitionDirection(direction);
      navigate(to, navOptions);
    },
    [navigate, setTransitionDirection],
  );

  return { transitionNavigate };
}
