/**
 * PageTransition Component
 *
 * Wraps page content to animate enter/exit transitions.
 * Uses GSAP for smooth, performant animations.
 *
 * When used with PageTransitionProvider, exit animations are coordinated
 * via useTransitionNavigate() hook.
 *
 * Usage:
 * ```tsx
 * <PageTransition>
 *   <YourPageContent />
 * </PageTransition>
 * ```
 */

import { type ReactNode, useRef, useLayoutEffect, useState, useEffect } from 'react';
import gsap from 'gsap';
import { PRESETS, prefersReducedMotion } from './config';
import { cn } from '../lib/utils';
import { usePageTransitionRegister } from './page-transition-context';

export interface PageTransitionProps {
  /** Page content to animate */
  children: ReactNode;
  /** CSS class for the wrapper */
  className?: string;
  /** Animation variant */
  variant?: 'default' | 'fade' | 'slide-up' | 'scale';
  /** Custom enter animation config */
  enter?: gsap.TweenVars;
  /** Whether to animate on mount (default: true) */
  animateOnMount?: boolean;
}

const VARIANTS = {
  default: {
    from: { opacity: 0, y: 16 },
    to: { opacity: 1, y: 0 },
  },
  fade: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  'slide-up': {
    from: { opacity: 0, y: 24 },
    to: { opacity: 1, y: 0 },
  },
  scale: {
    from: { opacity: 0, scale: 0.96 },
    to: { opacity: 1, scale: 1 },
  },
} as const;

export function PageTransition({
  children,
  className,
  variant = 'default',
  enter,
  animateOnMount = true,
}: PageTransitionProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(!animateOnMount);
  const registerContainer = usePageTransitionRegister();

  // Register this container for exit animations (if provider exists)
  useEffect(() => {
    registerContainer(containerRef.current);
    return () => registerContainer(null);
  }, [registerContainer]);

  useLayoutEffect(() => {
    if (!animateOnMount) return;

    const el = containerRef.current;
    if (!el) return;

    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1 });
      setIsReady(true);
      return;
    }

    const variantConfig = VARIANTS[variant];
    const customEnter = enter ?? {};

    // Set initial state
    gsap.set(el, { ...variantConfig.from, ...customEnter });

    // Animate in
    const tween = gsap.to(el, {
      ...variantConfig.to,
      duration: PRESETS.pageEnter.duration,
      ease: PRESETS.pageEnter.ease,
      delay: 0.05, // Small delay for smoother perceived transition
      onComplete: () => setIsReady(true),
    });

    return () => {
      tween.kill();
    };
  }, [animateOnMount, variant, enter]);

  return (
    <div ref={containerRef} className={cn(className, animateOnMount && !isReady && 'opacity-0')}>
      {children}
    </div>
  );
}
