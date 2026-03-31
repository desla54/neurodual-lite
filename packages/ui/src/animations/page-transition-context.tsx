/**
 * PageTransitionContext
 *
 * Manages coordinated enter/exit animations for page transitions.
 * Uses GSAP for smooth, performant transitions.
 *
 * Usage:
 * 1. Wrap your app with <PageTransitionProvider>
 * 2. Use <AnimatedOutlet> instead of <Outlet>
 * 3. Use useTransitionNavigate() for animated navigation
 */

import { createContext, useContext, useRef, useCallback, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion, DURATION, EASE } from './config';

// =============================================================================
// Types
// =============================================================================

interface PageTransitionContextValue {
  /** Trigger exit animation and return a promise that resolves when done */
  triggerExit: () => Promise<void>;
  /** Register the current page container for animation */
  registerContainer: (el: HTMLDivElement | null) => void;
  /** Whether a transition is in progress */
  isTransitioning: boolean;
}

// =============================================================================
// Context
// =============================================================================

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface PageTransitionProviderProps {
  children: ReactNode;
}

export function PageTransitionProvider({ children }: PageTransitionProviderProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const registerContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  const triggerExit = useCallback(async (): Promise<void> => {
    const el = containerRef.current;
    if (!el) return;

    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion()) {
      return;
    }

    setIsTransitioning(true);

    return new Promise((resolve) => {
      gsap.to(el, {
        opacity: 0,
        y: -12,
        scale: 0.98,
        duration: DURATION.fast,
        ease: EASE.in,
        onComplete: () => {
          setIsTransitioning(false);
          resolve();
        },
      });
    });
  }, []);

  return (
    <PageTransitionContext.Provider value={{ triggerExit, registerContainer, isTransitioning }}>
      {children}
    </PageTransitionContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Access page transition context.
 * Must be used within PageTransitionProvider.
 */
export function usePageTransition(): PageTransitionContextValue {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) {
    throw new Error('usePageTransition must be used within PageTransitionProvider');
  }
  return ctx;
}

/**
 * Hook for pages to register themselves for animation.
 * Returns a ref callback to attach to the page container.
 */
export function usePageTransitionRegister(): (el: HTMLDivElement | null) => void {
  const ctx = useContext(PageTransitionContext);
  // If no provider, return no-op (graceful fallback)
  return ctx?.registerContainer ?? (() => {});
}

/**
 * Check if page transition context is available.
 */
export function useHasPageTransition(): boolean {
  return useContext(PageTransitionContext) !== null;
}
