/**
 * PlaceAnimations - GSAP animation functions for Dual Flow mode
 *
 * Provides reusable animation functions with explicit callbacks.
 * Each function returns a GSAP timeline that can be killed if needed.
 *
 * Pattern:
 * - onStart: called when animation begins (optional)
 * - onComplete: called when animation finishes (required)
 *
 * Usage:
 * ```ts
 * const timeline = animateLanding(cardEl, targetRect, {
 *   onComplete: () => actions.commitDrop()
 * });
 * // If needed: timeline.kill();
 * ```
 */

import gsap from 'gsap';

// =============================================================================
// TYPES
// =============================================================================

export interface AnimationCallbacks {
  onStart?: () => void;
  onComplete: () => void;
}

export interface LandingAnimationOptions extends AnimationCallbacks {
  /** Duration of the fly phase (default: 0.4s) */
  flyDuration?: number;
  /** Duration of the absorption phase (default: 0.12s) */
  absorbDuration?: number;
  /** Final scale (default: 0.7) */
  finalScale?: number;
  /** Final opacity (default: 0.4) */
  finalOpacity?: number;
}

// =============================================================================
// ANIMATION FUNCTIONS
// =============================================================================

/**
 * Animate a card landing on a slot.
 * Two phases: fly → absorb
 *
 * @param cardEl The card element to animate
 * @param targetRect The target slot's bounding rect
 * @param callbacks onStart/onComplete callbacks
 * @returns GSAP Timeline (can be killed if needed)
 */
export function animateLanding(
  cardEl: HTMLElement | null,
  targetRect: DOMRect | null,
  callbacks: LandingAnimationOptions,
): gsap.core.Timeline | null {
  if (!cardEl || !targetRect) {
    callbacks.onComplete();
    return null;
  }

  const {
    onStart,
    onComplete,
    flyDuration = 0.4,
    absorbDuration = 0.12,
    finalScale = 0.7,
    finalOpacity = 0.4,
  } = callbacks;

  // Calculate positions
  const cardRect = cardEl.getBoundingClientRect();
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const cardCenterX = cardRect.left + cardRect.width / 2;
  const cardCenterY = cardRect.top + cardRect.height / 2;
  const flyDx = targetCenterX - cardCenterX;
  const flyDy = targetCenterY - cardCenterY;
  const currentX = gsap.getProperty(cardEl, 'x') as number;
  const currentY = gsap.getProperty(cardEl, 'y') as number;

  // Create timeline
  const tl = gsap.timeline({
    onStart,
    onComplete,
  });

  // Phase 1: Fly to target (force3D for GPU acceleration)
  tl.to(cardEl, {
    x: currentX + flyDx,
    y: currentY + flyDy,
    scale: 0.9,
    duration: flyDuration,
    ease: 'power2.out',
    force3D: true,
  });

  // Phase 2: Absorption
  tl.to(cardEl, {
    scale: finalScale,
    opacity: finalOpacity,
    duration: absorbDuration,
    ease: 'power2.in',
    force3D: true,
  });

  return tl;
}

/**
 * Animate a rejection (card bounces/shakes).
 *
 * @param cardEl The card element to animate
 * @param callbacks onStart/onComplete callbacks
 * @returns GSAP Timeline
 */
export function animateRejection(
  cardEl: HTMLElement | null,
  callbacks: AnimationCallbacks,
): gsap.core.Timeline | null {
  if (!cardEl) {
    callbacks.onComplete();
    return null;
  }

  const { onStart, onComplete } = callbacks;

  // Get current position to shake relative to it
  const currentX = gsap.getProperty(cardEl, 'x') as number;

  const tl = gsap.timeline({
    onStart,
    onComplete: () => {
      // Return to original position, then call complete
      gsap.to(cardEl, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => {
          // Clear all inline styles so CSS classes (ring, opacity) can take effect
          gsap.set(cardEl, { clearProps: 'all' });
          onComplete();
        },
      });
    },
  });

  // Shake animation - relative to current position
  tl.to(cardEl, {
    x: currentX - 8,
    duration: 0.04,
    ease: 'power1.inOut',
  })
    .to(cardEl, {
      x: currentX + 8,
      duration: 0.04,
      ease: 'power1.inOut',
    })
    .to(cardEl, {
      x: currentX - 6,
      duration: 0.04,
      ease: 'power1.inOut',
    })
    .to(cardEl, {
      x: currentX + 6,
      duration: 0.04,
      ease: 'power1.inOut',
    })
    .to(cardEl, {
      x: currentX,
      duration: 0.04,
      ease: 'power1.inOut',
    });

  return tl;
}

/**
 * Animate card returning to its original position.
 *
 * @param cardEl The card element to animate
 * @param callbacks onStart/onComplete callbacks
 * @returns GSAP Tween
 */
export function animateReturn(
  cardEl: HTMLElement | null,
  callbacks: AnimationCallbacks,
): gsap.core.Tween | null {
  if (!cardEl) {
    callbacks.onComplete();
    return null;
  }

  const { onStart, onComplete } = callbacks;

  return gsap.to(cardEl, {
    x: 0,
    y: 0,
    scale: 1,
    duration: 0.3,
    ease: 'power2.out',
    onStart,
    onComplete: () => {
      // Clear all inline styles so CSS classes (ring, opacity) can take effect
      gsap.set(cardEl, { clearProps: 'all' });
      onComplete();
    },
  });
}

/**
 * Animate slot content sliding out (for timeline reorganization).
 *
 * @param slotEl The slot element content to animate
 * @param direction Direction to slide ('left' | 'right')
 * @param callbacks onStart/onComplete callbacks
 * @returns GSAP Tween
 */
export function animateSlideOut(
  slotEl: HTMLElement | null,
  direction: 'left' | 'right',
  callbacks: AnimationCallbacks,
): gsap.core.Tween | null {
  if (!slotEl) {
    callbacks.onComplete();
    return null;
  }

  const { onStart, onComplete } = callbacks;
  const xOffset = direction === 'left' ? -50 : 50;

  return gsap.to(slotEl, {
    x: xOffset,
    opacity: 0,
    duration: 0.3,
    ease: 'power2.in',
    onStart,
    onComplete,
  });
}

/**
 * Kill all GSAP animations on an element.
 * Useful for cleanup on unmount.
 *
 * @param el The element to clear animations from
 */
export function killAnimations(el: HTMLElement | null): void {
  if (el) {
    gsap.killTweensOf(el);
  }
}

/**
 * Clear all GSAP transform properties from an element.
 *
 * @param el The element to clear
 */
export function clearTransforms(el: HTMLElement | null): void {
  if (el) {
    gsap.set(el, { clearProps: 'transform,opacity' });
  }
}
