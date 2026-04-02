/**
 * Animation System — centralized animation utilities for consistent motion.
 */

export {
  DURATION,
  EASE,
  PRESETS,
  STAGGER,
  prefersReducedMotion,
  setReducedMotionOverride,
  setPerformanceReducedMotionOverride,
  getAnimatedDuration,
  withReducedMotion,
} from './config';

export { PageTransition, type PageTransitionProps } from './page-transition';

export { useStagger, getStaggerConfig, type UseStaggerOptions } from './use-stagger';
export {
  useButtonAnimation,
  useRipple,
  type UseButtonAnimationOptions,
  type UseButtonAnimationReturn,
  type UseRippleOptions,
} from './use-button-animation';

export {
  PageTransitionProvider,
  usePageTransition,
  usePageTransitionRegister,
  useTransitionDirection,
  useHasPageTransition,
  type TransitionDirection,
} from './page-transition-context';
