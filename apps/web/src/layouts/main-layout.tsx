/**
 * MainLayout - app shell with navigation.
 * Uses Woven Ink design system with global canvas texture.
 */

import { cn, CanvasWeave, useMountEffect } from '@neurodual/ui';
import { Ssgoi, SsgoiTransition } from '@ssgoi/react';
import { fade, sheet } from '@ssgoi/react/view-transitions';
import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation, useOutlet } from 'react-router';
import { CommandPalette } from '../components/command-palette';
import { NavBar } from '../components/nav-bar';
import { GlobalProfileButton } from '../components/profile';
import { PWAInstallButton } from '../components/pwa-install-button';
import { SessionRecoveryGate } from '../components/session-recovery';
import { useBackButton } from '../hooks/use-back-button';
import { useModeGates } from '../hooks/use-mode-gates';
import { useAudioSyncPreset } from '../hooks/use-audio-sync-preset';
import { GAME_MODE_ROUTES, getModeForRoute } from '../lib/mode-metadata';
import {
  getNavigationMemoryKey,
  getPrimaryTabForPath,
  useNavigationMemoryStore,
} from '../stores/navigation-memory-store';
import { preloadFullscreenRoutes } from '../router';

const ssgoiConfig = {
  defaultTransition: fade({
    physics: {
      spring: {
        stiffness: 260,
        damping: 28,
      },
    },
  }),
  transitions: [
    { from: '*', to: '/nback', transition: sheet({ direction: 'enter' }) },
    { from: '/nback', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/stroop', transition: sheet({ direction: 'enter' }) },
    { from: '/stroop', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/stroop-flex', transition: sheet({ direction: 'enter' }) },
    { from: '/stroop-flex', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/ospan', transition: sheet({ direction: 'enter' }) },
    { from: '/ospan', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/gridlock', transition: sheet({ direction: 'enter' }) },
    { from: '/gridlock', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/dual-mix', transition: sheet({ direction: 'enter' }) },
    { from: '/dual-mix', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/ospan-measure', transition: sheet({ direction: 'enter' }) },
    { from: '/ospan-measure', to: '*', transition: sheet({ direction: 'exit' }) },
    { from: '*', to: '/tutorial/*', transition: sheet({ direction: 'enter' }) },
    { from: '/tutorial/*', to: '*', transition: sheet({ direction: 'exit' }) },
  ],
};

function useSsgoiPathname(): string {
  return useLocation().pathname;
}

export function MainLayout(): ReactNode {
  const location = useLocation();
  const outlet = useOutlet();
  const { isModePlayable } = useModeGates();
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const scrollMemoryKey = getNavigationMemoryKey(location.pathname, location.search);
  const scrollMemoryKeyRef = useRef(scrollMemoryKey);

  // Enable hardware back button navigation on Android
  useBackButton();

  // Sync audio preset from settings (beta feature)
  useAudioSyncPreset();

  useMountEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  });

  useMountEffect(() => {
    const preload = () => {
      void preloadFullscreenRoutes();
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const timeoutId = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timeoutId);
  });

  useMountEffect(() => {
    const node = mainScrollRef.current;
    if (!node) return;

    let frameId = 0;
    const flushScrollPosition = () => {
      frameId = 0;
      useNavigationMemoryStore
        .getState()
        .setScrollPosition(scrollMemoryKeyRef.current, node.scrollTop);
    };

    const onScroll = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(flushScrollPosition);
    };

    node.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      useNavigationMemoryStore
        .getState()
        .setScrollPosition(scrollMemoryKeyRef.current, node.scrollTop);
      node.removeEventListener('scroll', onScroll);
    };
  });

  useEffect(() => {
    const node = mainScrollRef.current;
    if (!node) return;

    const store = useNavigationMemoryStore.getState();
    const previousKey = scrollMemoryKeyRef.current;
    if (previousKey !== scrollMemoryKey) {
      store.setScrollPosition(previousKey, node.scrollTop);
      scrollMemoryKeyRef.current = scrollMemoryKey;
    }

    const primaryTab = getPrimaryTabForPath(location.pathname);
    if (primaryTab) {
      store.rememberPrimaryTabPath(primaryTab, scrollMemoryKey);
    }

    const restoreScrollPosition = () => {
      const targetScrollTop =
        useNavigationMemoryStore.getState().scrollPositions[scrollMemoryKey] ?? 0;
      const currentNode = mainScrollRef.current;
      if (!currentNode) return;
      if (Math.abs(currentNode.scrollTop - targetScrollTop) > 1) {
        currentNode.scrollTop = targetScrollTop;
      }
    };

    let nestedFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      restoreScrollPosition();
      nestedFrameId = window.requestAnimationFrame(restoreScrollPosition);
    });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(restoreScrollPosition);
      observer.observe(node);
    }

    const timeoutId = window.setTimeout(() => {
      observer?.disconnect();
    }, 700);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (nestedFrameId !== 0) {
        window.cancelAnimationFrame(nestedFrameId);
      }
      observer?.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [location.pathname, scrollMemoryKey]);

  // All game mode routes are fullscreen (no navbar, no profile button)
  const FULLSCREEN_PATHS: Set<string> = new Set(Object.values(GAME_MODE_ROUTES));

  const isReplayPage = location.pathname.startsWith('/replay/');
  // Tutorial hub (/tutorial) shows navbar, active tutorial (/tutorial/:specId) is fullscreen
  const isActiveTutorialPage =
    location.pathname.startsWith('/tutorial/') && location.pathname !== '/tutorial/';
  // Beta tutorial surfaces are still fullscreen (route-scoped beta)
  const isBetaTutorialPage = location.pathname.startsWith('/beta/tutorial/');
  const isTutorialHub = location.pathname === '/tutorial' || location.pathname === '/tutorial/';
  const isSorobanJourney = location.pathname.startsWith('/soroban-journey');
  const isMeskerPage = location.pathname === '/mesker';
  const isProfilePage = location.pathname === '/profile';
  const isVisualLogicTutorial = location.pathname === '/visual-logic-tutorial';
  const isViewportManagedFullscreen = location.pathname === '/ospan-measure';
  const routeModeId = getModeForRoute(location.pathname);
  const isLockedModeRoute = routeModeId != null && !isModePlayable(routeModeId);
  const isFullscreenPage =
    FULLSCREEN_PATHS.has(location.pathname) ||
    isViewportManagedFullscreen ||
    isReplayPage ||
    isActiveTutorialPage ||
    isBetaTutorialPage ||
    isSorobanJourney ||
    isMeskerPage ||
    isProfilePage ||
    isVisualLogicTutorial;

  if (isLockedModeRoute) {
    return <Navigate to="/" replace />;
  }

  return (
    <SessionRecoveryGate>
      <Ssgoi config={ssgoiConfig} usePathname={useSsgoiPathname}>
        <div className="flex flex-col h-dvh bg-woven-bg overflow-hidden relative pt-safe ps-safe pe-safe">
          {/* Global Woven Canvas texture - fixed background for entire app */}
          <div className="fixed inset-0 z-0 pointer-events-none opacity-30 md:opacity-50">
            <CanvasWeave lineCount={8} />
          </div>

          {/* NavBar: hidden on game/tutorial pages */}
          {!isFullscreenPage && <NavBar />}

          {/* Main content - offset for sidebar on desktop, flex-1 for vertical centering */}
          {/* Fullscreen pages (game/tutorial): no padding, no max-width, no sidebar offset */}
          <main
            ref={mainScrollRef}
            className={cn(
              'relative z-10 flex-1 flex flex-col',
              isFullscreenPage ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
              !isFullscreenPage &&
                'md:ms-20 pb-[calc(var(--bottom-nav-reserved)+var(--safe-bottom))] md:pb-0',
            )}
            style={isFullscreenPage ? undefined : { scrollbarGutter: 'stable' }}
          >
            <div
              className={cn(
                'flex-1 min-h-full flex flex-col w-full mx-auto relative',
                !isFullscreenPage && 'max-w-4xl px-4',
              )}
            >
              {/* Profile button + PWA install - inside content wrapper, scrolls with page */}
              {!isFullscreenPage && !isTutorialHub && (
                <div className="absolute top-4 end-4 z-40 flex items-start gap-2 md:fixed md:top-6 md:end-6">
                  <PWAInstallButton />
                  <div
                    className="flex items-center gap-1 rounded-full border border-woven-border bg-woven-surface px-1.5 py-1 shadow-sm"
                    data-capture-control-surface="toolbar"
                  >
                    <CommandPalette chrome="embedded" />
                    <div className="h-5 w-px bg-border/80" data-capture-control-divider="true" />
                    <GlobalProfileButton />
                  </div>
                </div>
              )}
              {isFullscreenPage ? (
                <div className="fullscreen-route-content flex flex-1 flex-col">
                  {isViewportManagedFullscreen ? (
                    outlet
                  ) : (
                    <SsgoiTransition
                      key={scrollMemoryKey}
                      id={location.pathname}
                      className="app-route-surface app-route-layer route-transition-shell relative flex flex-1 flex-col min-h-full overflow-hidden"
                      data-route-key={scrollMemoryKey}
                    >
                      {outlet}
                    </SsgoiTransition>
                  )}
                </div>
              ) : (
                <SsgoiTransition
                  key={scrollMemoryKey}
                  id={location.pathname}
                  className="app-route-surface app-route-layer route-transition-shell relative flex flex-1 flex-col min-h-full"
                  data-route-key={scrollMemoryKey}
                >
                  {outlet}
                </SsgoiTransition>
              )}
            </div>
          </main>
        </div>
      </Ssgoi>
    </SessionRecoveryGate>
  );
}
