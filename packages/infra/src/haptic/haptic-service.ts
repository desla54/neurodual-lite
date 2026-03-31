/**
 * Haptic Service
 *
 * Unified haptic feedback across platforms:
 * - Capacitor native (iOS/Android): Uses @capacitor/haptics
 * - Web Android: Uses navigator.vibrate
 * - Web iOS: Not supported (no vibration API in Safari)
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import type { HapticPort, HapticImpactStyle, HapticNotificationType } from '@neurodual/logic';

// Map our types to Capacitor types
const IMPACT_STYLE_MAP: Record<HapticImpactStyle, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const NOTIFICATION_TYPE_MAP: Record<HapticNotificationType, NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

// Vibration durations for web fallback (ms)
const VIBRATION_DURATIONS: Record<HapticImpactStyle, number> = {
  light: 50,
  medium: 65,
  heavy: 90,
};

const NOTIFICATION_VIBRATION: Record<HapticNotificationType, number | number[]> = {
  success: 65,
  warning: [50, 60, 50],
  error: [60, 60, 60, 60, 60],
};

// Some Android devices (especially in PWA mode) ignore short pulses.
// 50ms is a safe minimum that works across most hardware.
const WEB_MIN_VIBRATE_MS = 50;

/**
 * Check if we're running in a native Capacitor context
 */
function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function getPlatform(): 'ios' | 'android' | 'web' {
  // Capacitor.getPlatform() is safe in both native and web.
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

/**
 * Check if vibration API is available (Android web)
 */
function hasVibrateAPI(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Defer native bridge calls outside the input handler hot path.
 *
 * Native bridge calls (`@capacitor/haptics`) can block for a few ms.
 * Web vibration should stay synchronous to preserve the user-gesture context
 * (some browsers ignore `navigator.vibrate()` when triggered asynchronously).
 */
function runHaptic(effect: () => void): void {
  if (typeof window === 'undefined') {
    effect();
    return;
  }

  if (isNative()) {
    window.setTimeout(effect, 0);
    return;
  }

  effect();
}

function clampWebVibrateMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return WEB_MIN_VIBRATE_MS;
  return Math.max(durationMs, WEB_MIN_VIBRATE_MS);
}

function iosImpactForDuration(durationMs: number): ImpactStyle {
  if (!Number.isFinite(durationMs)) return ImpactStyle.Light;
  if (durationMs >= 45) return ImpactStyle.Heavy;
  if (durationMs >= 28) return ImpactStyle.Medium;
  return ImpactStyle.Light;
}

/**
 * Haptic adapter implementing HapticPort
 */
export const hapticAdapter: HapticPort = {
  isAvailable(): boolean {
    return isNative() || hasVibrateAPI();
  },

  vibrate(durationMs = 50): void {
    runHaptic(() => {
      if (isNative()) {
        const platform = getPlatform();

        // Capacitor Haptics behavior differs per platform.
        // - iOS: prefer impact feedback (more consistent than "vibrate").
        // - Android: use vibrate with duration.
        if (platform === 'ios') {
          Haptics.impact({ style: iosImpactForDuration(durationMs) }).catch(() => {
            // Silently fail - haptics are not critical
          });
          return;
        }

        Haptics.vibrate({ duration: Math.max(durationMs, 30) }).catch(() => {
          // Silently fail - haptics are not critical
        });
        return;
      }

      if (hasVibrateAPI()) {
        try {
          navigator.vibrate(clampWebVibrateMs(durationMs));
        } catch {
          // Blocked by browser policy (no user gesture yet)
        }
      }
      // No-op on iOS web (no vibrate API)
    });
  },

  impact(style?: HapticImpactStyle): void {
    const resolvedStyle = style ?? 'medium';
    runHaptic(() => {
      if (isNative()) {
        Haptics.impact({ style: IMPACT_STYLE_MAP[resolvedStyle] }).catch(() => {
          // Silently fail
        });
      } else if (hasVibrateAPI()) {
        try {
          navigator.vibrate(clampWebVibrateMs(VIBRATION_DURATIONS[resolvedStyle]));
        } catch {
          // Blocked by browser policy (no user gesture yet)
        }
      }
    });
  },

  notification(type?: HapticNotificationType): void {
    const resolvedType = type ?? 'success';
    runHaptic(() => {
      if (isNative()) {
        Haptics.notification({ type: NOTIFICATION_TYPE_MAP[resolvedType] }).catch(() => {
          // Silently fail
        });
      } else if (hasVibrateAPI()) {
        const pattern = NOTIFICATION_VIBRATION[resolvedType];
        navigator.vibrate(
          Array.isArray(pattern)
            ? pattern.map((ms) => clampWebVibrateMs(ms))
            : clampWebVibrateMs(pattern),
        );
      }
    });
  },

  selectionChanged(): void {
    runHaptic(() => {
      if (isNative()) {
        Haptics.selectionChanged().catch(() => {
          // Silently fail
        });
      } else if (hasVibrateAPI()) {
        navigator.vibrate(WEB_MIN_VIBRATE_MS);
      }
    });
  },
};
