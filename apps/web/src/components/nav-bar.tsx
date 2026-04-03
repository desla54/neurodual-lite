/**
 * NavBar - Mobile bottom HUD + Desktop sidebar
 * Woven Ink design with subtle canvas texture
 */

import { cn, Logo, useIsPremium } from '@neurodual/ui';
import {
  ArrowLeft,
  BookOpenText,
  ChartBar,
  GameController,
  GearSix,
  Moon,
  PushPin,
  Sun,
  Trophy,
  X,
} from '@phosphor-icons/react';
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAlphaEnabled } from '../hooks/use-beta-features';
import { useTransitionNavigate } from '../hooks/use-transition-navigate';
import { useHaptic } from '../hooks/use-haptic';

import { settingsNavGroups, getSectionIcon } from '../pages/settings/config';
import {
  PRIMARY_TAB_DEFAULT_PATHS,
  isPrimaryTabActive,
  useNavigationMemoryStore,
  type PrimaryNavTab,
} from '../stores/navigation-memory-store';
import { useSettingsStore } from '../stores/settings-store';

interface NavItemData {
  tab: PrimaryNavTab;
  labelKey: string;
  icon: typeof GameController;
}

// Desktop: ordre logique vertical (Play → Stats → Social → Tutorial)
// Play en haut (action principale), Tutorial avant Settings (aide/référence)
const mainLinks: NavItemData[] = [
  { tab: 'play', labelKey: 'nav.play', icon: GameController },
  { tab: 'stats', labelKey: 'nav.stats', icon: ChartBar },
  { tab: 'social', labelKey: 'nav.social', icon: Trophy },
  { tab: 'tutorial', labelKey: 'nav.tutorial', icon: BookOpenText },
];

// Mobile: Play au centre (ergonomie pouce)
const mobileLinks: NavItemData[] = [
  { tab: 'tutorial', labelKey: 'nav.tutorial', icon: BookOpenText },
  { tab: 'stats', labelKey: 'nav.stats', icon: ChartBar },
  { tab: 'play', labelKey: 'nav.play', icon: GameController },
  { tab: 'social', labelKey: 'nav.social', icon: Trophy },
  { tab: 'settings', labelKey: 'nav.settings', icon: GearSix },
];

// Settings séparé pour desktop (en bas de sidebar)
const settingsLink: NavItemData = { tab: 'settings', labelKey: 'nav.settings', icon: GearSix };

export function NavBar(): ReactNode {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = location.pathname;
  const hasPremium = useIsPremium();
  // Legacy tutorial spotlight — hidden for now, kept for future rework
  // const tutorialCompleted = useSettingsStore((s) => s.ui.tutorialCompleted);
  const setTutorialCompleted = useSettingsStore((s) => s.setTutorialCompleted);
  const darkMode = useSettingsStore((s) => s.ui.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const isAlphaEnabled = useAlphaEnabled();
  const rememberedTabPaths = useNavigationMemoryStore((s) => s.lastPrimaryTabPath);
  const lastNonSettingsPrimaryTab = useNavigationMemoryStore((s) => s.lastNonSettingsPrimaryTab);

  // Animated navigation + haptic for tab switching
  const { transitionNavigate } = useTransitionNavigate();
  const haptic = useHaptic();

  // Sliding indicator ref for mobile bottom nav
  const indicatorRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const indicatorReadyRef = useRef(false);

  const resolvePrimaryTabPath = useCallback(
    (tab: PrimaryNavTab) => rememberedTabPaths[tab] ?? PRIMARY_TAB_DEFAULT_PATHS[tab],
    [rememberedTabPaths],
  );
  const settingsExitTarget = useMemo(() => {
    if (!lastNonSettingsPrimaryTab) return resolvePrimaryTabPath('play');
    return resolvePrimaryTabPath(lastNonSettingsPrimaryTab);
  }, [lastNonSettingsPrimaryTab, resolvePrimaryTabPath]);

  // Filter out alpha-only items when alpha is not enabled
  const filteredNavGroups = useMemo(() => {
    return settingsNavGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.alphaOnly || isAlphaEnabled),
    }));
  }, [isAlphaEnabled]);

  // Resolve active tab index for mobile bottom nav indicator animation
  const activeMobileIndex = useMemo(() => {
    return mobileLinks.findIndex(({ tab }) => isPrimaryTabActive(pathname, tab));
  }, [pathname]);

  const syncMobileIndicator = useCallback(
    (animate: boolean) => {
      const indicator = indicatorRef.current;
      const container = mobileNavRef.current;
      if (!indicator || !container || activeMobileIndex < 0) {
        if (indicator) {
          gsap.killTweensOf(indicator);
          gsap.set(indicator, { opacity: 0, x: 0 });
        }
        indicatorReadyRef.current = false;
        return;
      }

      const navItems = container.querySelectorAll<HTMLElement>('[data-nav-tab]');
      const targetEl = navItems[activeMobileIndex];
      if (!targetEl) return;

      const indicatorWidth = indicator.offsetWidth || 40;
      const x = Math.round(targetEl.offsetLeft + (targetEl.offsetWidth - indicatorWidth) / 2);

      gsap.killTweensOf(indicator);

      if (!indicatorReadyRef.current || !animate) {
        gsap.set(indicator, {
          x,
          opacity: 1,
          force3D: true,
        });
        indicatorReadyRef.current = true;
        return;
      }

      gsap.to(indicator, {
        x,
        opacity: 1,
        duration: 0.24,
        ease: 'power3.out',
        overwrite: 'auto',
        force3D: true,
      });
    },
    [activeMobileIndex],
  );

  // Animate indicator to the active tab position (useGSAP for auto-cleanup)
  useGSAP(() => {
    syncMobileIndicator(indicatorReadyRef.current);
  }, { dependencies: [syncMobileIndicator], scope: mobileNavRef });

  useLayoutEffect(() => {
    const container = mobileNavRef.current;
    if (!container) return;

    const scheduleSync = () => {
      window.requestAnimationFrame(() => syncMobileIndicator(false));
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    resizeObserver?.observe(container);

    const viewport = window.visualViewport;
    window.addEventListener('resize', scheduleSync);
    viewport?.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);

    if ('fonts' in document) {
      void document.fonts.ready.then(scheduleSync);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleSync);
      viewport?.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
    };
  }, [syncMobileIndicator]);

  // Handle mobile tab click with transition + haptic
  const handleMobileTabClick = useCallback(
    (e: React.MouseEvent, href: string) => {
      e.preventDefault();
      haptic.selectionChanged();
      transitionNavigate(href, { direction: 'fade' });
    },
    [haptic, transitionNavigate],
  );

  // Detect if we're on settings page
  const isSettingsPage = pathname === '/settings' || pathname.startsWith('/settings/');

  // Extract current settings section from URL (e.g., /settings/journey → "journey")
  const currentSettingsSection = pathname.startsWith('/settings/')
    ? decodeURIComponent(pathname.replace('/settings/', '').split('/')[0] ?? 'journey')
    : 'journey'; // Default to journey

  // Hide navbar on game pages when playing
  const isGamePage =
    pathname === '/nback' ||
    pathname === '/dual-memo' ||
    pathname === '/dual-place' ||
    pathname === '/dual-pick' ||
    pathname === '/dual-trace' ||
    pathname === '/calibration' ||
    pathname === '/profile' ||
    pathname === '/ospan-measure' ||
    pathname === '/visual-logic-measure';

  // Hidden for now — "Découvrir le tutoriel" was Dual N-Back specific,
  // needs rework for multi-mode app. See nav-bar legacy tutorial spotlight.
  const showTutorialSpotlight = false; // was: !tutorialCompleted && pathname === '/';

  const dismissSpotlight = () => {
    setTutorialCompleted(true);
  };

  // Sidebar expansion state (hover with delay + pin)
  const [isHovered, setIsHovered] = useState(false);
  const isPinned = useSettingsStore((s) => s.ui.sidebarPinned);
  const setSidebarPinned = useSettingsStore((s) => s.setSidebarPinned);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isExpanded = isHovered || isPinned;

  const handleMouseEnter = useCallback(() => {
    // Clear any pending close timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Delay open by 150ms
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Clear pending open timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Instant close (unless pinned)
    setIsHovered(false);
  }, []);

  const togglePin = useCallback(() => {
    setSidebarPinned(!isPinned);
  }, [isPinned, setSidebarPinned]);

  return (
    <>
      {/* --- MOBILE BOTTOM BAR --- */}
      <nav
        className={cn(
          'md:hidden fixed bottom-[max(var(--bottom-nav-offset),var(--safe-bottom))] left-[max(1rem,var(--safe-left))] right-[max(1rem,var(--safe-right))] z-50 flex flex-col items-center pointer-events-none transition-[transform,opacity] duration-300 ease-in-out',
          isGamePage ? 'translate-y-[200%] opacity-0' : 'translate-y-0 opacity-100',
        )}
      >
        {/* Tutorial spotlight message - clickable to go to tutorial */}
        {showTutorialSpotlight && (
          <NavLink
            to="/tutorial"
            onClick={dismissSpotlight}
            className="pointer-events-auto mb-2 px-4 py-2.5 bg-amber-500/60 border border-amber-400/50 shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)] rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150 active:brightness-90 transition-transform"
          >
            <BookOpenText size={18} weight="regular" className="text-white shrink-0" />
            <span className="text-sm text-white font-medium">
              {t('nav.tutorialInvite', 'First time here? Check out the tutorial!')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissSpotlight();
              }}
              className="p-1 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              aria-label={t('common.dismiss', 'Dismiss')}
            >
              <X size={16} weight="regular" />
            </button>
          </NavLink>
        )}

        <div
          ref={mobileNavRef}
          className="relative flex items-center justify-evenly w-full p-2 bg-woven-surface border border-woven-border/50 shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)] rounded-full pointer-events-auto overflow-hidden"
        >
          {/* Weave texture background - tighter grid for mobile */}
          <svg
            data-nav-weave="true"
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={`mh-${i}`}
                x1="0%"
                y1={`${(i / 12) * 100}%`}
                x2="100%"
                y2={`${(i / 12) * 100}%`}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.06}
              />
            ))}
            {Array.from({ length: 30 }).map((_, i) => (
              <line
                key={`mv-${i}`}
                x1={`${(i / 30) * 100}%`}
                y1="0%"
                x2={`${(i / 30) * 100}%`}
                y2="100%"
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.06}
              />
            ))}
          </svg>

          {/* Sliding indicator — pill that follows the active tab */}
          <div
            ref={indicatorRef}
            className="absolute left-0 bottom-1 w-10 h-1.5 rounded-full bg-primary pointer-events-none will-change-transform"
            style={{ opacity: 0 }}
            aria-hidden="true"
          />

          {mobileLinks.map(({ tab, icon: Icon, labelKey }) => {
            const href = resolvePrimaryTabPath(tab);
            const isActive = isPrimaryTabActive(pathname, tab);
            const isTutorial = tab === 'tutorial';
            const isSpotlighted = showTutorialSpotlight && isTutorial;
            const label = t(labelKey);
            return (
              <NavLink
                key={href}
                to={href}
                data-nav-tab={tab}
                onClick={(e) => {
                  if (isTutorial && showTutorialSpotlight) dismissSpotlight();
                  if (isActive) return; // Already on this tab
                  handleMobileTabClick(e, href);
                }}
                className={cn(
                  'relative flex flex-col items-center justify-center w-14 h-14 rounded-full transition-[background-color,color,transform] duration-200 active:scale-[0.94]',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted/50',
                  isSpotlighted &&
                    !isActive &&
                    'ring-2 ring-amber-500 ring-offset-2 ring-offset-surface',
                )}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* --- DESKTOP SIDEBAR --- */}
      <nav
        className={cn(
          'fixed start-0 top-0 bottom-0 flex-col items-center py-6 bg-surface border-e border-border/30 shadow-[4px_0_16px_-4px_hsl(var(--border)/0.15)] z-40 text-muted-foreground transition-all duration-300 ease-out',
          isGamePage ? 'hidden' : 'hidden md:flex',
          isExpanded ? 'w-56' : 'w-20',
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Weave texture background - tight grid matching mobile bottom bar density */}
        <svg
          data-nav-weave="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1="0%"
              y1={`${(i / 20) * 100}%`}
              x2="100%"
              y2={`${(i / 20) * 100}%`}
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.06}
            />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={`${(i / 5) * 100}%`}
              y1="0%"
              x2={`${(i / 5) * 100}%`}
              y2="100%"
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.06}
            />
          ))}
        </svg>

        {/* Right edge separator */}
        <div className="absolute end-0 top-0 bottom-0 w-px bg-border/20" />

        {/* Conditional content based on page */}
        {isSettingsPage ? (
          /* --- SETTINGS MODE --- */
          <>
            {/* Back button + Pin */}
            <div className="mb-4 relative z-10 w-full px-3 flex items-center gap-2">
              <NavLink to={settingsExitTarget} className="min-w-0 flex-1 block">
                <div
                  className={cn(
                    'flex items-center rounded-xl text-muted-foreground hover:bg-amber-500/20 hover:text-amber-600 transition-all duration-150 active:scale-[0.98]',
                    isExpanded
                      ? 'w-full min-w-0 justify-start gap-3 px-3 h-12'
                      : 'justify-center w-12 h-12',
                  )}
                >
                  <ArrowLeft size={20} weight="regular" className="shrink-0" />
                  <span
                    className={cn(
                      'min-w-0 truncate text-sm font-medium whitespace-nowrap transition-opacity duration-300',
                      isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
                    )}
                  >
                    {t('settings.closeDesktop', 'Quitter les réglages')}
                  </span>
                </div>
              </NavLink>

              {/* Pin button - same as normal mode */}
              <button
                type="button"
                onClick={togglePin}
                className={cn(
                  'p-2 rounded-xl transition-all duration-150 active:scale-[0.95]',
                  isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none w-0',
                  isPinned
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
                aria-label={isPinned ? t('nav.unpin', 'Unpin') : t('nav.pin', 'Pin')}
                aria-pressed={isPinned}
              >
                <PushPin
                  size={18}
                  weight={isPinned ? 'fill' : 'regular'}
                  className={cn('transition-transform duration-200', isPinned && 'rotate-45')}
                />
              </button>
            </div>

            {/* Settings navigation groups */}
            <div className="flex flex-col gap-1 w-full px-3 flex-1 relative z-10 overflow-y-auto">
              {filteredNavGroups.map((group) => (
                <div key={group.id} className="mb-3">
                  {/* Group label - visible when expanded */}
                  <span
                    className={cn(
                      'text-xxs font-bold uppercase tracking-widest text-amber-600 px-3 mb-1 block transition-all duration-300 overflow-hidden',
                      isExpanded ? 'opacity-100 h-auto' : 'opacity-0 h-0',
                    )}
                  >
                    {t(group.labelKey, group.id)}
                  </span>

                  {/* Group items */}
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => {
                      const isActive = currentSettingsSection === item.id;
                      const Icon = getSectionIcon(item.id);
                      return (
                        <NavLink
                          key={item.id}
                          to={`/settings/${item.id}`}
                          className="block"
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <div
                            className={cn(
                              'flex items-center rounded-xl transition-all duration-150 active:scale-[0.98]',
                              isExpanded
                                ? 'w-full justify-start gap-3 px-3 h-12'
                                : 'justify-center w-12 h-12',
                              isActive
                                ? 'bg-foreground text-background shadow-sm'
                                : 'text-muted-foreground hover:bg-secondary/60',
                            )}
                          >
                            <Icon size={20} weight="regular" className="shrink-0" />
                            <span
                              className={cn(
                                'text-sm font-medium whitespace-nowrap transition-opacity duration-300',
                                isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
                              )}
                            >
                              {t(item.labelKey, item.id)}
                            </span>
                          </div>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* --- NORMAL MODE --- */
          <>
            {/* Logo + Pin button row */}
            <div className="mb-8 relative z-10 w-full px-3 flex items-center gap-2">
              <NavLink to="/" className="flex-1 block">
                <div className="flex items-center gap-3 h-14 rounded-xl transition-all duration-150 hover:bg-secondary/60 active:scale-[0.98]">
                  <Logo
                    variant="icon"
                    size={40}
                    className="shrink-0 text-foreground"
                    showPremiumBadge={hasPremium}
                  />
                  <span
                    className={cn(
                      'text-lg font-bold text-foreground whitespace-nowrap transition-opacity duration-300',
                      isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
                    )}
                  >
                    NeuroDual
                  </span>
                </div>
              </NavLink>

              {/* Pin button - only visible when expanded */}
              <button
                type="button"
                onClick={togglePin}
                className={cn(
                  'p-2 rounded-xl transition-all duration-150 active:scale-[0.95]',
                  isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none w-0',
                  isPinned
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
                aria-label={isPinned ? t('nav.unpin', 'Unpin') : t('nav.pin', 'Pin')}
                aria-pressed={isPinned}
              >
                <PushPin
                  size={18}
                  weight={isPinned ? 'fill' : 'regular'}
                  className={cn('transition-transform duration-200', isPinned && 'rotate-45')}
                />
              </button>
            </div>

            {/* Main Links */}
            <div className="flex flex-col gap-2 w-full px-3 flex-1 relative z-10">
              {mainLinks.map(({ tab, labelKey, icon: Icon }) => {
                const href = resolvePrimaryTabPath(tab);
                const isActive = isPrimaryTabActive(pathname, tab);
                const isTutorial = tab === 'tutorial';
                const isSpotlighted = showTutorialSpotlight && isTutorial;
                const label = t(labelKey);
                return (
                  <NavLink
                    key={href}
                    to={href}
                    onClick={isTutorial && showTutorialSpotlight ? dismissSpotlight : undefined}
                    className={cn(
                      'block relative',
                      isSpotlighted &&
                        !isActive &&
                        'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl',
                    )}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div
                      className={cn(
                        'flex items-center rounded-2xl transition-all duration-150 active:scale-[0.98]',
                        isExpanded
                          ? 'w-full justify-start gap-3 px-4 h-14'
                          : 'justify-center w-14 h-14',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-soft'
                          : 'text-muted-foreground hover:bg-secondary/60',
                      )}
                    >
                      <Icon size={24} weight="regular" className="shrink-0" />
                      <span
                        className={cn(
                          'text-sm font-semibold whitespace-nowrap transition-opacity duration-300',
                          isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
                        )}
                      >
                        {label}
                      </span>
                    </div>

                    {/* Spotlight badge for tutorial - isolated from sidebar hover */}
                    {isSpotlighted && (
                      <div
                        className="absolute start-full top-1/2 -translate-y-1/2 ms-3 px-3 py-2 bg-amber-500/60 border border-amber-400/50 text-white text-xs font-medium rounded-full shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)] whitespace-nowrap z-50 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300"
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          // Clear any pending sidebar expansion timer
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <span>
                          {t('nav.tutorialInvite', 'First time here? Check out the tutorial!')}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dismissSpotlight();
                          }}
                          className="p-0.5 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                          aria-label={t('common.dismiss', 'Dismiss')}
                        >
                          <X size={14} weight="regular" />
                        </button>
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {/* Settings at bottom - separated */}
            <div className="relative z-10 w-full px-3 pb-2">
              {/* Separator line - amber like Play button */}
              <div
                className={cn(
                  'h-0.5 bg-amber-500/60 mb-3 rounded-full transition-all duration-300',
                  isExpanded ? 'w-full mx-0' : 'w-10 mx-auto',
                )}
              />

              <NavLink
                to={resolvePrimaryTabPath(settingsLink.tab)}
                className="block"
                aria-label={t(settingsLink.labelKey)}
                aria-current={isPrimaryTabActive(pathname, settingsLink.tab) ? 'page' : undefined}
              >
                <div
                  className={cn(
                    'flex items-center rounded-2xl transition-all duration-150 active:scale-[0.98]',
                    isExpanded
                      ? 'w-full justify-start gap-3 px-4 h-14'
                      : 'justify-center w-14 h-14',
                    isPrimaryTabActive(pathname, settingsLink.tab)
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'text-muted-foreground hover:bg-secondary/60',
                  )}
                >
                  <settingsLink.icon size={24} weight="regular" className="shrink-0" />
                  <span
                    className={cn(
                      'text-sm font-semibold whitespace-nowrap transition-opacity duration-300',
                      isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
                    )}
                  >
                    {t(settingsLink.labelKey)}
                  </span>
                </div>
              </NavLink>
            </div>
          </>
        )}
      </nav>

      {/* --- DESKTOP THEME TOGGLE --- */}
      <button
        type="button"
        onClick={() => setDarkMode(!darkMode)}
        className={cn(
          'fixed bottom-4 end-4 z-50 w-10 h-10 items-center justify-center rounded-full bg-surface border border-border/50 text-foreground shadow-soft hover:bg-secondary/60 transition duration-150 active:brightness-90',
          isGamePage ? 'hidden' : 'hidden md:flex',
        )}
        aria-label={darkMode ? t('nav.lightMode', 'Light mode') : t('nav.darkMode', 'Dark mode')}
      >
        {darkMode ? <Sun size={18} weight="regular" /> : <Moon size={18} weight="regular" />}
      </button>
    </>
  );
}
