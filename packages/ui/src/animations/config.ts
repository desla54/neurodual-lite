/**
 * Animation Configuration
 *
 * Centralized animation settings for consistent motion across the app.
 * Uses GSAP for performance and flexibility.
 *
 * Respects prefers-reduced-motion for accessibility.
 */

// =============================================================================
// Duration Presets (in seconds)
// =============================================================================

export const DURATION = {
  /** Micro-interactions: button press, toggle, hover */
  micro: 0.15,
  /** Fast transitions: tabs, dropdowns, tooltips */
  fast: 0.2,
  /** Standard transitions: page, modal, cards */
  standard: 0.3,
  /** Slow transitions: complex reveals, hero animations */
  slow: 0.5,
  /** Very slow: celebration, onboarding */
  slower: 0.8,
} as const;

// =============================================================================
// Easing Presets (GSAP format)
// =============================================================================

export const EASE = {
  /** Standard ease out - most common for entering elements */
  out: 'power2.out',
  /** Standard ease in - for exiting elements */
  in: 'power2.in',
  /** Standard ease in-out - for position changes */
  inOut: 'power2.inOut',
  /** Bouncy - for playful feedback */
  bounce: 'back.out(1.7)',
  /** Elastic - for celebratory effects */
  elastic: 'elastic.out(1, 0.5)',
  /** Snappy - for quick, precise movements */
  snap: 'power3.out',
  /** Gentle - for subtle, organic movements */
  gentle: 'power1.out',
  /** Spring-like for natural feel */
  spring: 'back.out(1.2)',
} as const;

// =============================================================================
// Animation Presets
// =============================================================================

export const PRESETS = {
  /** Page enter - slide up and fade */
  pageEnter: {
    from: { opacity: 0, y: 20 },
    to: { opacity: 1, y: 0 },
    duration: DURATION.standard,
    ease: EASE.out,
  },
  /** Page exit - fade out quickly */
  pageExit: {
    to: { opacity: 0 },
    duration: DURATION.fast,
    ease: EASE.in,
  },
  /** Card appear - scale and fade */
  cardAppear: {
    from: { opacity: 0, scale: 0.95 },
    to: { opacity: 1, scale: 1 },
    duration: DURATION.standard,
    ease: EASE.out,
  },
  /** List item stagger */
  listItem: {
    from: { opacity: 0, y: 10 },
    to: { opacity: 1, y: 0 },
    duration: DURATION.fast,
    ease: EASE.out,
    stagger: 0.05,
  },
  /** Button press */
  buttonPress: {
    to: { scale: 0.96 },
    duration: DURATION.micro,
    ease: EASE.in,
  },
  /** Button release */
  buttonRelease: {
    to: { scale: 1 },
    duration: DURATION.fast,
    ease: EASE.spring,
  },
  /** Modal enter */
  modalEnter: {
    from: { opacity: 0, scale: 0.9 },
    to: { opacity: 1, scale: 1 },
    duration: DURATION.standard,
    ease: EASE.spring,
  },
  /** Modal exit */
  modalExit: {
    to: { opacity: 0, scale: 0.95 },
    duration: DURATION.fast,
    ease: EASE.in,
  },
  /** Fade in */
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: DURATION.standard,
    ease: EASE.out,
  },
  /** Fade out */
  fadeOut: {
    to: { opacity: 0 },
    duration: DURATION.fast,
    ease: EASE.in,
  },
} as const;

// =============================================================================
// Stagger Delays
// =============================================================================

export const STAGGER = {
  /** Very fast stagger for dense lists */
  fast: 0.03,
  /** Standard stagger for lists */
  standard: 0.05,
  /** Slow stagger for visual impact */
  slow: 0.1,
  /** Grid stagger from center */
  grid: { amount: 0.1, from: 'center' },
} as const;

// =============================================================================
// Reduced Motion Support
// =============================================================================

/**
 * App-level override for reduced motion.
 * Set via setReducedMotionOverride() from app settings.
 */
let reducedMotionOverride: boolean | null = null;
let performanceReducedMotionOverride = false;

/**
 * Set the app-level reduced motion preference.
 * Call this from your settings provider when the user changes the setting.
 *
 * @param enabled - true to disable animations, false to enable, null to use system preference
 */
export function setReducedMotionOverride(enabled: boolean | null): void {
  reducedMotionOverride = enabled;
}

/**
 * Runtime performance override for reduced motion.
 * Used to temporarily disable animations on slow devices / lag spikes.
 */
export function setPerformanceReducedMotionOverride(enabled: boolean): void {
  performanceReducedMotionOverride = enabled;
}

/**
 * Check if animations should be reduced.
 * Priority: app setting > system preference
 */
export function prefersReducedMotion(): boolean {
  if (performanceReducedMotionOverride) {
    return true;
  }

  // App-level override takes priority
  if (reducedMotionOverride !== null) {
    return reducedMotionOverride;
  }
  // Fall back to system preference
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get duration based on reduced motion preference.
 * Returns 0 if user prefers reduced motion.
 */
export function getAnimatedDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}

/**
 * Get animation config with reduced motion support.
 * Instantly applies changes if user prefers reduced motion.
 */
export function withReducedMotion<T extends { duration?: number }>(config: T): T {
  if (prefersReducedMotion()) {
    return { ...config, duration: 0 };
  }
  return config;
}
