/**
 * PageTransitionContext
 *
 * Manages coordinated enter/exit animations for page transitions.
 * Uses GSAP for smooth, performant transitions.
 *
 * Supports direction-aware transitions (push/back/modal/fade) for
 * a native mobile app feel.
 */

import { createContext, useContext, useRef, useCallback, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion, DURATION, EASE } from './config';

// =============================================================================
// Types
// =============================================================================

export type TransitionDirection = 'push' | 'back' | 'modal' | 'fade' | 'default';

interface PageTransitionContextValue {
  triggerExit: () => Promise<void>;
  registerContainer: (el: HTMLDivElement | null) => void;
  isTransitioning: boolean;
  transitionDirection: TransitionDirection;
  setTransitionDirection: (dir: TransitionDirection) => void;
}

// =============================================================================
// Context
// =============================================================================

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null);

// =============================================================================
// Exit animation presets per direction
// =============================================================================

const EXIT_ANIMATIONS: Record<TransitionDirection, gsap.TweenVars> = {
  push: { opacity: 0, xPercent: -5, duration: DURATION.fast, ease: EASE.in },
  back: { opacity: 0, xPercent: 5, duration: DURATION.fast, ease: EASE.in },
  modal: { opacity: 0, scale: 0.97, y: 8, duration: DURATION.fast, ease: EASE.in },
  fade: { opacity: 0, duration: DURATION.fast, ease: EASE.in },
  default: { opacity: 0, y: -12, scale: 0.98, duration: DURATION.fast, ease: EASE.in },
};

// =============================================================================
// Provider
// =============================================================================

export function PageTransitionProvider({ children }: { children: ReactNode }): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirectionState] =
    useState<TransitionDirection>('default');

  const registerContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  const setTransitionDirection = useCallback((dir: TransitionDirection) => {
    setTransitionDirectionState(dir);
  }, []);

  const triggerExit = useCallback(async (): Promise<void> => {
    const el = containerRef.current;
    if (!el) return;

    if (prefersReducedMotion()) return;

    setIsTransitioning(true);

    const anim = EXIT_ANIMATIONS[transitionDirection] ?? EXIT_ANIMATIONS.default;

    return new Promise((resolve) => {
      gsap.to(el, {
        ...anim,
        onComplete: () => {
          setIsTransitioning(false);
          resolve();
        },
      });
    });
  }, [transitionDirection]);

  return (
    <PageTransitionContext.Provider
      value={{
        triggerExit,
        registerContainer,
        isTransitioning,
        transitionDirection,
        setTransitionDirection,
      }}
    >
      {children}
    </PageTransitionContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/** Full context — throws if no provider */
export function usePageTransition(): PageTransitionContextValue {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) {
    throw new Error('usePageTransition must be used within PageTransitionProvider');
  }
  return ctx;
}

/** Register container ref for exit animations — no-op without provider */
export function usePageTransitionRegister(): (el: HTMLDivElement | null) => void {
  const ctx = useContext(PageTransitionContext);
  return ctx?.registerContainer ?? (() => {});
}

/** Read current transition direction — returns 'default' without provider */
export function useTransitionDirection(): TransitionDirection {
  const ctx = useContext(PageTransitionContext);
  return ctx?.transitionDirection ?? 'default';
}

/** Check if page transition context is available */
export function useHasPageTransition(): boolean {
  return useContext(PageTransitionContext) !== null;
}
