/**
 * PageTransitionContext
 *
 * Stores the transition direction for coordinated page transitions.
 * The actual animation is handled by <PageTransition> on enter —
 * no sequential exit needed (navigate is instant, React unmounts old page).
 */

import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

export type TransitionDirection = 'push' | 'back' | 'modal' | 'fade' | 'default';

interface PageTransitionContextValue {
  transitionDirection: TransitionDirection;
  setTransitionDirection: (dir: TransitionDirection) => void;
}

// =============================================================================
// Context
// =============================================================================

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export function PageTransitionProvider({ children }: { children: ReactNode }): ReactNode {
  const [transitionDirection, setTransitionDirectionState] =
    useState<TransitionDirection>('default');

  const setTransitionDirection = useCallback((dir: TransitionDirection) => {
    setTransitionDirectionState(dir);
  }, []);

  return (
    <PageTransitionContext.Provider
      value={{
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

/** Read current transition direction — returns 'default' without provider */
export function useTransitionDirection(): TransitionDirection {
  const ctx = useContext(PageTransitionContext);
  return ctx?.transitionDirection ?? 'default';
}

/** Check if page transition context is available */
export function useHasPageTransition(): boolean {
  return useContext(PageTransitionContext) !== null;
}
