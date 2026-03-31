/**
 * Feature Flags
 *
 * Controls feature availability based on environment variables.
 * Used to toggle between premium/free and native/PWA modes.
 *
 * NeuroDual Lite: premium and XP rewards are always disabled.
 */

import { Capacitor } from '@capacitor/core';

function isFeatureEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'enabled' || normalized === 'true' || normalized === '1';
}

const nativeModeFromEnv = isFeatureEnabled(import.meta.env['VITE_NATIVE_MODE']);
const nativeModeEnabled = nativeModeFromEnv || Capacitor.isNativePlatform();
const experimentalModesFromEnv = isFeatureEnabled(import.meta.env['VITE_EXPERIMENTAL_MODES']);
const devAppEnabled = isFeatureEnabled(import.meta.env['VITE_DEV_APP']);

export const featureFlags = {
  /** Premium subscription features — always disabled in Lite */
  premiumEnabled: false,

  /** Native mobile features (Capacitor) */
  nativeModeEnabled,

  /**
   * Dedicated dev install (side-by-side with the Play Store app).
   * Enabled only when explicitly set at build time.
   */
  devAppEnabled,

  /**
   * Experimental alpha/beta unlock pages and modes.
   * Disabled by default for native (store) builds.
   */
  experimentalModesEnabled: import.meta.env.DEV || experimentalModesFromEnv || !nativeModeEnabled,

  /** Donation links (shown when premium is disabled) */
  donationLinksEnabled: true,

  /** XP rewards system — always disabled in Lite */
  xpRewardsEnabled: false,

  /**
   * Prototype routes and features (dev only, never shipped).
   * Tree-shaken from all production bundles (web + native).
   */
  prototypesEnabled: import.meta.env.DEV || isFeatureEnabled(import.meta.env['VITE_PROTOTYPES']),
} as const;

export type FeatureFlags = typeof featureFlags;
