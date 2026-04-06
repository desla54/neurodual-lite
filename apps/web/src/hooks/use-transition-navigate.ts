/**
 * useTransitionNavigate
 *
 * Centralized app navigation hook.
 *
 * It classifies each navigation intent (tab, push/back, modal),
 * arms the shell-level transition state, and still exposes the
 * transition direction through context for any legacy consumers.
 *
 * Direction options:
 * - 'push': forward stack navigation
 * - 'back': backward stack navigation
 * - 'modal': fullscreen / cover transition
 * - 'fade': tab-like handoff
 */

import { useCallback } from 'react';
import { useLocation, useNavigate, type To, type NavigateOptions } from 'react-router';
import { usePageTransition, type TransitionDirection } from '@neurodual/ui';
import {
  armShellNavigationTransition,
  inferTransitionDirection,
  normalizePathname,
  toShellNavigationKind,
} from '../lib/navigation-transitions';

export interface TransitionNavigateOptions extends NavigateOptions {
  direction?: TransitionDirection;
}

export function useTransitionNavigate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setTransitionDirection } = usePageTransition();

  const transitionNavigate = useCallback(
    (to: To | number, options?: TransitionNavigateOptions) => {
      // Handle back navigation (number argument) — no animation
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      const { direction: explicitDirection, ...navOptions } = options ?? {};
      const nextPathname =
        typeof to === 'string'
          ? normalizePathname(to.split('?')[0]?.split('#')[0] ?? '/')
          : normalizePathname(to.pathname ?? location.pathname);
      const direction =
        explicitDirection ?? inferTransitionDirection(location.pathname, nextPathname);
      const shellKind = toShellNavigationKind(direction);

      setTransitionDirection(direction);
      armShellNavigationTransition(shellKind);
      navigate(to, navOptions);
    },
    [location.pathname, navigate, setTransitionDirection],
  );

  return { transitionNavigate };
}
