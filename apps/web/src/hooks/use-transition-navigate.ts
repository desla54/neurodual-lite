/**
 * useTransitionNavigate
 *
 * Centralized app navigation hook.
 * Keeps the callsite API stable while route transitions are handled by SSGOI.
 */

import { useCallback } from 'react';
import { useLocation, useNavigate, type To, type NavigateOptions } from 'react-router';
import type { TransitionDirection } from '@neurodual/ui';
import { attachNavigationOrigin } from '../lib/navigation-origin';

export interface TransitionNavigateOptions extends NavigateOptions {
  direction?: TransitionDirection;
}

export function useTransitionNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  const transitionNavigate = useCallback(
    (to: To | number, options?: TransitionNavigateOptions) => {
      const { direction, ...navOptions } = options ?? {};
      if (typeof to === 'number') {
        navigate(to);
        return;
      }
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const state =
        direction === 'modal'
          ? attachNavigationOrigin(navOptions.state, currentPath)
          : navOptions.state;
      navigate(to, { ...navOptions, state });
    },
    [location.hash, location.pathname, location.search, navigate],
  );

  return { transitionNavigate };
}
