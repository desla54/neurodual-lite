/**
 * Native Theme Utilities
 *
 * Synchronizes status bar and navigation bar colors with the app theme.
 *
 * Strategy by Android API level:
 * - API 35+ (Android 15+): Edge-to-edge is automatic. Bars are transparent.
 *   Window.setNavigationBarColor() / setStatusBarColor() are no-ops.
 *   Only icon style (light/dark) needs to be set via SystemBars.
 * - Pre-API 35: MainActivity enables edge-to-edge via WindowCompat.
 *   NavigationBar plugin sets bar color for 3-button nav.
 *   StatusBar plugin sets status bar color.
 *
 * The <meta name="theme-color"> is also updated for PWA tab bar matching.
 */

import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { StatusBar } from '@capacitor/status-bar';

export const THEME_HINT_STORAGE_KEY = 'neurodual_theme_hint_v1';
const THEME_COLOR_META_ACTIVE_ID = 'theme-color-active';
const THEME_COLOR_META_LIGHT_ID = 'theme-color-light';
const THEME_COLOR_META_DARK_ID = 'theme-color-dark';
const COLOR_SCHEME_META_ID = 'color-scheme-meta';

// Theme colors matching CSS variables in styles.css
// MUST match --neuro-bg-app values for seamless edge-to-edge
const COLORS = {
  light: {
    background: '#E7E4DD', // HSL(40, 12%, 90%) - matches --neuro-bg-app light
    // LIGHT = "dark content on light background" = dark/black icons
    style: SystemBarsStyle.Light,
  },
  dark: {
    background: '#171512', // HSL(30, 10%, 8%) - matches --neuro-bg-app dark
    // DARK = "light content on dark background" = light/white icons
    style: SystemBarsStyle.Dark,
  },
} as const;

function getOrCreateThemeColorMeta(id: string): HTMLMetaElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLMetaElement) return existing;

  const meta = document.createElement('meta');
  meta.setAttribute('id', id);
  meta.setAttribute('name', 'theme-color');
  document.head.appendChild(meta);
  return meta;
}

function updateMetaThemeColor(color: string, isDark: boolean): void {
  if (typeof document === 'undefined') return;

  const activeMeta = getOrCreateThemeColorMeta(THEME_COLOR_META_ACTIVE_ID);
  activeMeta.setAttribute('content', color);
  activeMeta.removeAttribute('media');

  const lightMeta = getOrCreateThemeColorMeta(THEME_COLOR_META_LIGHT_ID);
  const darkMeta = getOrCreateThemeColorMeta(THEME_COLOR_META_DARK_ID);

  lightMeta.setAttribute('content', COLORS.light.background);
  darkMeta.setAttribute('content', COLORS.dark.background);

  if (isDark) {
    darkMeta.setAttribute('media', 'all');
    lightMeta.setAttribute('media', 'not all');
  } else {
    lightMeta.setAttribute('media', 'all');
    darkMeta.setAttribute('media', 'not all');
  }
}

function updateDocumentColorScheme(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  const colorSchemeMeta = document.getElementById(COLOR_SCHEME_META_ID);
  if (colorSchemeMeta instanceof HTMLMetaElement) {
    colorSchemeMeta.setAttribute('content', isDark ? 'dark light' : 'light dark');
  }
}

export function persistThemeHint(isDark: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_HINT_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

/**
 * Update native status bar icon style and navigation bar color to match the app theme.
 * Safe to call on any platform - no-op on web (except meta theme-color update).
 */
export async function updateNativeTheme(isDark: boolean): Promise<void> {
  // Prefer the DOM as the source of truth (prevents accidental inversion if callers pass a stale value)
  const effectiveIsDark =
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : isDark;
  const colors = effectiveIsDark ? COLORS.dark : COLORS.light;

  // Update meta theme-color (works for PWA and native)
  updateMetaThemeColor(colors.background, effectiveIsDark);
  updateDocumentColorScheme(effectiveIsDark);

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // SystemBars icon style - always call this first (Capacitor 8 core, most critical)
  // SystemBarsStyle.Light = dark icons (for light backgrounds)
  // SystemBarsStyle.Dark = light/white icons (for dark backgrounds)
  try {
    await SystemBars.setStyle({ style: colors.style });
  } catch (error) {
    console.warn('[NativeTheme] SystemBars.setStyle ERROR:', error);
  }

  if (Capacitor.getPlatform() === 'android') {
    // Navigation bar color for 3-button nav (pre-API 35, no-op on API 35+)
    try {
      await NavigationBar.setNavigationBarColor({
        color: colors.background,
        darkButtons: !effectiveIsDark,
      });
    } catch (error) {
      console.warn('[NativeTheme] NavigationBar ERROR:', error);
    }

    // Status bar background color (pre-API 35, no-op on API 35+)
    try {
      await StatusBar.setBackgroundColor({ color: colors.background });
    } catch (error) {
      console.warn('[NativeTheme] StatusBar ERROR:', error);
    }
  }
}
