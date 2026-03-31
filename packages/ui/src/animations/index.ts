/**
 * Animation System
 *
 * Centralized animation utilities for consistent motion across the app.
 *
 * - config: Duration, easing, and preset constants
 * - PageTransition: Animate page enter/exit
 * - useStagger: Animate lists with staggered timing
 * - useButtonAnimation: Press/release feedback for buttons
 */

// Config and constants
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

// Components
export { PageTransition, type PageTransitionProps } from './page-transition';

// Hooks
export { useStagger, getStaggerConfig, type UseStaggerOptions } from './use-stagger';
export {
  useButtonAnimation,
  useRipple,
  type UseButtonAnimationOptions,
  type UseButtonAnimationReturn,
  type UseRippleOptions,
} from './use-button-animation';

// Page transition context
export {
  PageTransitionProvider,
  usePageTransition,
  usePageTransitionRegister,
  useHasPageTransition,
} from './page-transition-context';
