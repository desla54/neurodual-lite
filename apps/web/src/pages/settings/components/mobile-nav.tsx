/**
 * Mobile navigation for settings page
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
  useMemo,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { XIcon } from '@phosphor-icons/react';
import {
  Avatar,
  DURATION,
  EASE,
  Hatching,
  Logo,
  prefersReducedMotion,
  useAuthQuery,
} from '@neurodual/ui';
import { useAlphaEnabled } from '../../../hooks/use-beta-features';
import { useSettingsStore } from '../../../stores/settings-store';
import { settingsNavGroups } from '../config';

interface SettingsMobileNavProps {
  currentSection: string;
}

const DRAWER_ANIMATION = {
  backdrop: DURATION.standard,
  drawer: DURATION.standard + DURATION.micro * 0.2,
  openDuration: DURATION.standard + DURATION.micro * 0.2,
  closeDuration: DURATION.standard + DURATION.fast * 0.8,
} as const;

/** Drawer slides from the inline-start edge: left in LTR, right in RTL. */
function drawerClosedX(): number {
  return document.documentElement.dir === 'rtl' ? 102 : -102;
}

function isDocRtl(): boolean {
  return document.documentElement.dir === 'rtl';
}

function MenuLinesIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4 17h8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsMobileNav({ currentSection }: SettingsMobileNavProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isAlphaEnabled = useAlphaEnabled();
  const authState = useAuthQuery();
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const backdropRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const drawerControlTweenRef = useRef<gsap.core.Tween | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const isAuthenticated = authState.status === 'authenticated';
  const profileName = isAuthenticated
    ? (authState.profile?.username ?? t('settings.profile.yourName', 'Your name'))
    : localDisplayName || t('settings.profile.anonymous', 'Anonymous');
  const profileSubtitle = isAuthenticated
    ? t('settings.account.cloudActive', 'Cloud account active')
    : t('settings.account.localMode', 'Local mode');
  const profileAvatarId = isAuthenticated
    ? (authState.profile?.avatarId ?? localAvatarId)
    : localAvatarId;

  const runOpenAnimation = useCallback(() => {
    const backdrop = backdropRef.current;
    const drawer = drawerRef.current;
    if (!backdrop || !drawer) return;

    drawerControlTweenRef.current?.kill();
    drawerControlTweenRef.current = null;

    if (prefersReducedMotion()) {
      gsap.set(backdrop, { opacity: 0.35, pointerEvents: 'auto' });
      gsap.set(drawer, { xPercent: 0, opacity: 1, pointerEvents: 'auto' });
      return;
    }

    const tl = drawerTimelineRef.current;
    if (!tl) return;

    gsap.set([backdrop, drawer], { pointerEvents: 'auto' });
    if (tl.progress() >= 0.999) return;

    drawerControlTweenRef.current = tl.tweenTo(tl.duration(), {
      duration: DRAWER_ANIMATION.openDuration,
      ease: EASE.out,
      overwrite: 'auto',
      onComplete: () => {
        drawerControlTweenRef.current = null;
      },
    });
  }, []);

  const runCloseAnimation = useCallback((onComplete?: () => void) => {
    const backdrop = backdropRef.current;
    const drawer = drawerRef.current;
    if (!backdrop || !drawer) {
      onComplete?.();
      return;
    }

    drawerControlTweenRef.current?.kill();
    drawerControlTweenRef.current = null;

    if (prefersReducedMotion()) {
      gsap.set(backdrop, { opacity: 0, pointerEvents: 'none' });
      gsap.set(drawer, { xPercent: drawerClosedX(), opacity: 1, pointerEvents: 'none' });
      onComplete?.();
      return;
    }

    const tl = drawerTimelineRef.current;
    if (!tl) {
      gsap.set(backdrop, { opacity: 0, pointerEvents: 'none' });
      gsap.set(drawer, { xPercent: drawerClosedX(), opacity: 1, pointerEvents: 'none' });
      onComplete?.();
      return;
    }

    if (tl.progress() === 0) {
      gsap.set([backdrop, drawer], { pointerEvents: 'none' });
      onComplete?.();
      return;
    }

    drawerControlTweenRef.current = tl.tweenTo(0, {
      duration: DRAWER_ANIMATION.closeDuration,
      ease: EASE.in,
      overwrite: 'auto',
      onComplete: () => {
        const latestBackdrop = backdropRef.current;
        const latestDrawer = drawerRef.current;
        if (latestBackdrop && latestDrawer) {
          gsap.set([latestBackdrop, latestDrawer], { pointerEvents: 'none' });
        }
        drawerControlTweenRef.current = null;
        onComplete?.();
      },
    });
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerMounted(true);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    if (!isDrawerMounted) return;
    setIsDrawerOpen(false);
  }, [isDrawerMounted]);

  useEffect(() => {
    if (!isDrawerMounted) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isDrawerMounted, closeDrawer]);

  useLayoutEffect(() => {
    if (!isDrawerMounted) return;

    const backdrop = backdropRef.current;
    const drawer = drawerRef.current;
    if (!backdrop || !drawer) return;

    // Ensure deterministic start state on every mount.
    gsap.set(backdrop, { opacity: 0, pointerEvents: 'none' });
    gsap.set(drawer, {
      xPercent: drawerClosedX(),
      opacity: 1,
      pointerEvents: 'none',
      force3D: true,
    });

    if (!prefersReducedMotion()) {
      const tl = gsap.timeline({ paused: true });
      tl.set([backdrop, drawer], { pointerEvents: 'auto' }, 0);
      tl.to(backdrop, { opacity: 0.35, duration: DRAWER_ANIMATION.backdrop, ease: 'none' }, 0);
      tl.to(
        drawer,
        {
          xPercent: 0,
          duration: DRAWER_ANIMATION.drawer,
          ease: 'none',
          force3D: true,
          overwrite: 'auto',
        },
        0,
      );
      drawerTimelineRef.current = tl;
    }

    return () => {
      drawerControlTweenRef.current?.kill();
      drawerControlTweenRef.current = null;
      drawerTimelineRef.current?.kill();
      drawerTimelineRef.current = null;
    };
  }, [isDrawerMounted]);

  useEffect(() => {
    if (!isDrawerMounted) return;

    if (isDrawerOpen) {
      runOpenAnimation();
      return;
    }

    runCloseAnimation(() => {
      setIsDrawerMounted(false);
      touchStartX.current = null;
      touchStartY.current = null;
    });
  }, [isDrawerMounted, isDrawerOpen, runOpenAnimation, runCloseAnimation]);

  // Filter out alpha-only items when alpha is not enabled
  const filteredNavGroups = useMemo(() => {
    return settingsNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.alphaOnly || isAlphaEnabled),
      }))
      .filter((group) => group.items.length > 0);
  }, [isAlphaEnabled]);

  const handleSelect = (sectionId: string) => {
    if (sectionId === currentSection) {
      closeDrawer();
      return;
    }
    closeDrawer();
    navigate(`/settings/${sectionId}`);
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    const touch = event.changedTouches[0];
    touchStartX.current = null;
    touchStartY.current = null;
    if (!touch || startX === null || startY === null) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const isHorizontalSwipe = Math.abs(deltaX) > 45 && Math.abs(deltaY) < 45;

    // Drawer is on the inline-start edge: swipe toward that edge to dismiss.
    const dismissSwipe = isDocRtl() ? deltaX > 0 : deltaX < 0;
    if (isHorizontalSwipe && dismissSwipe) closeDrawer();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/10 text-foreground hover:bg-foreground/15 active:scale-[0.97] transition-all"
        aria-label={t('nav.settings', 'Settings')}
      >
        <MenuLinesIcon />
      </button>

      {isDrawerMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              ref={backdropRef}
              type="button"
              className="md:hidden fixed inset-0 z-[90] bg-black/35"
              aria-label={t('common.close', 'Close')}
              onClick={closeDrawer}
            />

            <aside
              ref={drawerRef}
              className="md:hidden fixed top-0 bottom-0 z-[91] w-[min(75vw,19rem)] border border-woven-border/50 bg-woven-surface shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)] overflow-hidden will-change-transform settings-mobile-nav-sheet-safe ltr:rounded-r-2xl rtl:rounded-l-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.settings', 'Settings')}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Sidebar-like woven background - tight grid matching mobile bottom bar density */}
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none text-foreground"
                aria-hidden="true"
              >
                {Array.from({ length: 18 }).map((_, i) => (
                  <line
                    key={`drawer-h-${i}`}
                    x1="0%"
                    y1={`${(i / 18) * 100}%`}
                    x2="100%"
                    y2={`${(i / 18) * 100}%`}
                    stroke="currentColor"
                    strokeWidth={0.5}
                    opacity={0.06}
                  />
                ))}
                {Array.from({ length: 6 }).map((_, i) => (
                  <line
                    key={`drawer-v-${i}`}
                    x1={`${(i / 6) * 100}%`}
                    y1="0%"
                    x2={`${(i / 6) * 100}%`}
                    y2="100%"
                    stroke="currentColor"
                    strokeWidth={0.5}
                    opacity={0.06}
                  />
                ))}
              </svg>
              <Hatching
                id="settings-mobile-drawer-hatch"
                orientation="vertical"
                className="absolute end-0 top-0 bottom-0"
              />

              <div className="relative z-10 flex h-full flex-col settings-mobile-nav-content-safe">
                <div className="border-b border-border/70 px-4 pb-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Logo variant="icon" size={28} className="shrink-0 text-foreground" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                          NeuroDual
                        </p>
                        <h2 className="text-lg font-extrabold text-foreground">
                          {t('nav.settings', 'Settings')}
                        </h2>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closeDrawer}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive transition-all hover:bg-destructive/15 active:scale-95"
                      aria-label={t('common.close', 'Close')}
                    >
                      <XIcon size={18} weight="bold" />
                    </button>
                  </div>
                </div>

                <nav className="flex-1 overflow-y-auto py-2">
                  {filteredNavGroups.map((group) => (
                    <div key={group.id} className="mb-3">
                      <div className="px-4 pb-1 pt-1">
                        <span className="text-[15px] font-extrabold uppercase tracking-wide text-amber-600">
                          {t(group.labelKey, group.id)}
                        </span>
                      </div>
                      <div className="space-y-1.5 px-2">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = item.id === currentSection;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelect(item.id)}
                              className={`flex w-full items-center rounded-xl px-3.5 py-3 text-left transition-colors ${
                                isActive
                                  ? 'bg-foreground text-background shadow-sm'
                                  : 'text-foreground hover:bg-secondary/50'
                              }`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <span className="flex items-center gap-3">
                                <Icon size={19} weight={isActive ? 'fill' : 'regular'} />
                                <span className="text-sm font-medium">
                                  {t(item.labelKey, item.id)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>

                <div className="border-t border-border/70 p-2.5 settings-mobile-nav-footer-safe">
                  <button
                    type="button"
                    onClick={() => handleSelect('profile')}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/55 px-3 py-2.5 text-left transition-colors hover:bg-secondary/45"
                    aria-label={t('settings.nav.profile', 'Profile')}
                  >
                    <Avatar
                      id={profileAvatarId}
                      size={24}
                      className="h-10 w-10 border border-border/70"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('settings.nav.profile', 'Profile')}
                      </span>
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {profileName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {profileSubtitle}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
