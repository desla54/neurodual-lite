import { prefersReducedMotion, type TransitionDirection } from '@neurodual/ui';
import { getModeForRoute } from './mode-metadata';
import { getPrimaryTabForPath } from '../stores/navigation-memory-store';

export type ShellNavigationKind = 'tab' | 'push' | 'back' | 'modal';

const CLEANUP_DELAYS_MS: Record<ShellNavigationKind, number> = {
  tab: 280,
  push: 380,
  back: 380,
  modal: 460,
};

let cleanupTimeoutId = 0;
let armedShellTransitionKind: ShellNavigationKind | null = null;

export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
}

export function supportsViewTransitions(): boolean {
  return !prefersReducedMotion();
}

export function armShellNavigationTransition(kind: ShellNavigationKind): void {
  if (typeof document === 'undefined') return;

  armedShellTransitionKind = kind;
  const root = document.documentElement;
  root.dataset['navTransition'] = kind;

  if (cleanupTimeoutId !== 0) {
    window.clearTimeout(cleanupTimeoutId);
  }

  cleanupTimeoutId = window.setTimeout(() => {
    if (root.dataset['navTransition'] === kind) {
      delete root.dataset['navTransition'];
    }
    cleanupTimeoutId = 0;
  }, CLEANUP_DELAYS_MS[kind]);
}

export function consumeShellNavigationTransition(): ShellNavigationKind | null {
  const kind = armedShellTransitionKind;
  armedShellTransitionKind = null;
  return kind;
}

function isSettingsSubPage(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (!normalized.startsWith('/settings/')) return false;
  const parts = normalized.slice('/settings/'.length).split('/').filter(Boolean);
  return parts.length > 1;
}

function isFullscreenRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    normalized.startsWith('/tutorial/') ||
    normalized === '/ospan-measure' ||
    normalized === '/visual-logic-tutorial' ||
    normalized.startsWith('/soroban-journey') ||
    getModeForRoute(normalized) != null
  );
}

export function inferTransitionDirection(
  currentPathname: string,
  nextPathname: string,
): TransitionDirection {
  const current = normalizePathname(currentPathname);
  const next = normalizePathname(nextPathname);

  if (current === next) return 'default';

  const currentTab = getPrimaryTabForPath(current);
  const nextTab = getPrimaryTabForPath(next);

  if (currentTab != null && nextTab != null) {
    if (currentTab === 'settings' && nextTab === 'settings') {
      const currentIsSubPage = isSettingsSubPage(current);
      const nextIsSubPage = isSettingsSubPage(next);

      if (!currentIsSubPage && nextIsSubPage) return 'push';
      if (currentIsSubPage && !nextIsSubPage) return 'back';
      if (currentIsSubPage && nextIsSubPage) return 'push';
    }

    if (currentTab !== nextTab) return 'modal';

    return 'fade';
  }

  if (isFullscreenRoute(next)) return 'modal';
  if (isFullscreenRoute(current) && nextTab != null) return 'fade';

  return 'push';
}

export function toShellNavigationKind(direction: TransitionDirection): ShellNavigationKind {
  switch (direction) {
    case 'push':
      return 'push';
    case 'back':
      return 'back';
    case 'modal':
      return 'modal';
    default:
      return 'tab';
  }
}
