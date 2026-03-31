import { create } from 'zustand';

export type PrimaryNavTab = 'play' | 'stats' | 'social' | 'tutorial' | 'settings';
type NonSettingsPrimaryNavTab = Exclude<PrimaryNavTab, 'settings'>;

export const PRIMARY_TAB_DEFAULT_PATHS: Record<PrimaryNavTab, string> = {
  play: '/',
  stats: '/stats',
  social: '/social',
  tutorial: '/tutorial',
  settings: '/settings',
};

interface NavigationMemoryState {
  scrollPositions: Record<string, number>;
  lastPrimaryTabPath: Partial<Record<PrimaryNavTab, string>>;
  lastNonSettingsPrimaryTab: NonSettingsPrimaryNavTab | null;
  setScrollPosition: (key: string, scrollTop: number) => void;
  rememberPrimaryTabPath: (tab: PrimaryNavTab, path: string) => void;
}

export function getNavigationMemoryKey(pathname: string, search = ''): string {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return `${normalizedPath}${search}`;
}

export function getPrimaryTabForPath(pathname: string): PrimaryNavTab | null {
  if (pathname === '/') return 'play';
  if (pathname === '/stats' || pathname === '/beta/stats') return 'stats';
  if (pathname === '/social') return 'social';
  if (pathname === '/tutorial' || pathname.startsWith('/tutorial/')) return 'tutorial';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  return null;
}

export function isPrimaryTabActive(pathname: string, tab: PrimaryNavTab): boolean {
  return getPrimaryTabForPath(pathname) === tab;
}

export const useNavigationMemoryStore = create<NavigationMemoryState>((set) => ({
  scrollPositions: {},
  lastPrimaryTabPath: {},
  lastNonSettingsPrimaryTab: null,
  setScrollPosition: (key, scrollTop) =>
    set((state) => {
      const nextScrollTop = Math.max(0, Math.round(scrollTop));
      if (state.scrollPositions[key] === nextScrollTop) {
        return state;
      }
      return {
        scrollPositions: {
          ...state.scrollPositions,
          [key]: nextScrollTop,
        },
      };
    }),
  rememberPrimaryTabPath: (tab, path) =>
    set((state) => {
      const shouldKeepPath = state.lastPrimaryTabPath[tab] === path;
      const nextLastNonSettingsPrimaryTab =
        tab === 'settings' ? state.lastNonSettingsPrimaryTab : tab;
      if (shouldKeepPath && nextLastNonSettingsPrimaryTab === state.lastNonSettingsPrimaryTab) {
        return state;
      }
      return {
        lastPrimaryTabPath: {
          ...state.lastPrimaryTabPath,
          [tab]: path,
        },
        lastNonSettingsPrimaryTab: nextLastNonSettingsPrimaryTab,
      };
    }),
}));
