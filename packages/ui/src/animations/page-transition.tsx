/**
 * PageTransition Component
 *
 * Wraps page content to animate enter transitions using GSAP.
 * Reads transition direction from context for direction-aware
 * enter animations (push/back/modal/fade).
 *
 * No exit animation — navigation is instant and React unmounts
 * the old page. Only the enter animation plays, preventing flashes.
 */

import { type ReactNode, useRef, useLayoutEffect, useState } from 'react';
import gsap from 'gsap';
import { PRESETS, prefersReducedMotion } from './config';
import { cn } from '../lib/utils';
import { useTransitionDirection } from './page-transition-context';
import type { TransitionDirection } from './page-transition-context';

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'fade' | 'slide-up' | 'scale';
  enter?: gsap.TweenVars;
  animateOnMount?: boolean;
}

const DIRECTION_ENTERS: Record<TransitionDirection, { from: gsap.TweenVars; to: gsap.TweenVars }> =
  {
    push: { from: { opacity: 0, xPercent: 3 }, to: { opacity: 1, xPercent: 0 } },
    back: { from: { opacity: 0, xPercent: -3 }, to: { opacity: 1, xPercent: 0 } },
    modal: { from: { opacity: 0, y: 18, scale: 0.985 }, to: { opacity: 1, y: 0, scale: 1 } },
    fade: { from: { opacity: 0 }, to: { opacity: 1 } },
    default: { from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0 } },
  };

const VARIANTS: Record<string, { from: gsap.TweenVars; to: gsap.TweenVars }> = {
  default: { from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0 } },
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  'slide-up': { from: { opacity: 0, y: 18 }, to: { opacity: 1, y: 0 } },
  scale: { from: { opacity: 0, scale: 0.975 }, to: { opacity: 1, scale: 1 } },
};

export function PageTransition({
  children,
  className,
  variant = 'default',
  enter,
  animateOnMount = true,
}: PageTransitionProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(!animateOnMount);
  const contextDirection = useTransitionDirection();

  useLayoutEffect(() => {
    if (!animateOnMount) return;
    const el = containerRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1 });
      setIsReady(true);
      return;
    }

    const dirConfig =
      contextDirection !== 'default' ? DIRECTION_ENTERS[contextDirection] : undefined;
    const fallback = VARIANTS[variant] ?? VARIANTS['default'];
    const { from, to } = (dirConfig ?? fallback) as { from: gsap.TweenVars; to: gsap.TweenVars };

    const customEnter = enter ?? {};
    gsap.killTweensOf(el);
    gsap.set(el, { ...from, ...customEnter });

    const tween = gsap.to(el, {
      ...to,
      duration: PRESETS.pageEnter.duration,
      ease: PRESETS.pageEnter.ease,
      overwrite: 'auto',
      force3D: true,
      clearProps: 'opacity,xPercent,y,scale',
      onComplete: () => setIsReady(true),
    });

    return () => {
      tween.kill();
    };
  }, [animateOnMount, variant, enter, contextDirection]);

  return (
    <div ref={containerRef} className={cn(className, animateOnMount && !isReady && 'opacity-0')}>
      {children}
    </div>
  );
}
