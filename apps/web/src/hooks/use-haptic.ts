/**
 * useHaptic - Hook for haptic feedback
 *
 * Provides haptic feedback functions that respect the user's hapticEnabled setting.
 * Uses Capacitor Haptics on native, navigator.vibrate on Android web.
 */

import { useCallback, useMemo } from 'react';
import type { HapticImpactStyle, HapticNotificationType } from '@neurodual/logic';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

type HapticIntensity = 'low' | 'medium' | 'high';

export interface UseHapticResult {
  /** Whether haptics are available on this platform */
  isAvailable: boolean;
  /** Whether haptics are enabled in settings */
  isEnabled: boolean;
  /** Strength preference for haptics */
  intensity: HapticIntensity;
  /** Trigger a simple vibration (for drag feedback, etc.) */
  vibrate: (durationMs?: number) => void;
  /** Trigger an impact haptic (iOS-style) */
  impact: (style?: HapticImpactStyle) => void;
  /** Trigger a notification haptic (iOS-style) */
  notification: (type?: HapticNotificationType) => void;
  /** Trigger selection changed haptic */
  selectionChanged: () => void;
}

/**
 * Hook for haptic feedback
 *
 * All methods check hapticEnabled setting before triggering.
 * Safe to call even when haptics are not available.
 */
export function useHaptic(): UseHapticResult {
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const hapticIntensity = useSettingsStore((s) => s.ui.hapticIntensity);
  const { haptic } = useAppPorts();
  const isAvailable = haptic.isAvailable();

  const resolveWebDurationMs = useCallback(
    (durationMs: number): number => {
      const minMs = hapticIntensity === 'low' ? 50 : hapticIntensity === 'medium' ? 65 : 90;
      const scale = hapticIntensity === 'low' ? 0.9 : hapticIntensity === 'medium' ? 1 : 1.25;
      const scaled = Math.round(durationMs * scale);
      return Math.max(scaled, minMs);
    },
    [hapticIntensity],
  );

  const resolveImpactStyle = useCallback(
    (style?: HapticImpactStyle): HapticImpactStyle => {
      const requested: HapticImpactStyle = style ?? 'medium';
      const maxAllowed: HapticImpactStyle =
        hapticIntensity === 'low' ? 'light' : hapticIntensity === 'medium' ? 'medium' : 'heavy';

      const rank: Record<HapticImpactStyle, number> = { light: 1, medium: 2, heavy: 3 };
      return rank[requested] <= rank[maxAllowed] ? requested : maxAllowed;
    },
    [hapticIntensity],
  );

  const vibrate = useCallback(
    (durationMs?: number) => {
      if (hapticEnabled && isAvailable) {
        const base =
          typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 18;
        haptic.vibrate(resolveWebDurationMs(base));
      }
    },
    [hapticEnabled, isAvailable, haptic, resolveWebDurationMs],
  );

  const impact = useCallback(
    (style?: HapticImpactStyle) => {
      if (hapticEnabled && isAvailable) {
        haptic.impact(resolveImpactStyle(style));
      }
    },
    [hapticEnabled, isAvailable, haptic, resolveImpactStyle],
  );

  const notification = useCallback(
    (type?: HapticNotificationType) => {
      if (hapticEnabled && isAvailable) {
        haptic.notification(type);
      }
    },
    [hapticEnabled, isAvailable, haptic],
  );

  const selectionChanged = useCallback(() => {
    if (hapticEnabled && isAvailable) {
      haptic.selectionChanged();
    }
  }, [hapticEnabled, isAvailable, haptic]);

  return useMemo(
    () => ({
      isAvailable,
      isEnabled: hapticEnabled,
      intensity: hapticIntensity,
      vibrate,
      impact,
      notification,
      selectionChanged,
    }),
    [isAvailable, hapticEnabled, hapticIntensity, vibrate, impact, notification, selectionChanged],
  );
}

/**
 * Get a haptic trigger function that respects the enabled setting.
 * Useful for passing to callbacks without re-rendering.
 *
 * @returns A function that triggers vibration if haptics are enabled
 */
export function useHapticTrigger(): (durationMs?: number) => void {
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const hapticIntensity = useSettingsStore((s) => s.ui.hapticIntensity);
  const { haptic } = useAppPorts();
  const isAvailable = haptic.isAvailable();

  return useCallback(
    (durationMs = 18) => {
      if (hapticEnabled && isAvailable) {
        const minMs = hapticIntensity === 'low' ? 25 : hapticIntensity === 'medium' ? 35 : 55;
        const scale = hapticIntensity === 'low' ? 0.9 : hapticIntensity === 'medium' ? 1 : 1.25;
        const scaled = Math.round(durationMs * scale);
        haptic.vibrate(Math.max(scaled, minMs));
      }
    },
    [hapticEnabled, isAvailable, haptic, hapticIntensity],
  );
}
