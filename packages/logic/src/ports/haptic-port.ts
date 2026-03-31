/**
 * Haptic feedback port
 * Provides haptic/vibration feedback across platforms
 */

export type HapticImpactStyle = 'light' | 'medium' | 'heavy';
export type HapticNotificationType = 'success' | 'warning' | 'error';

export interface HapticPort {
  /**
   * Check if haptics are available on this platform
   */
  isAvailable(): boolean;

  /**
   * Trigger a simple vibration (for drag feedback, etc.)
   * @param durationMs - Duration in milliseconds (default: 10)
   */
  vibrate(durationMs?: number): void;

  /**
   * Trigger an impact haptic (iOS-style)
   * Falls back to vibrate on Android web
   */
  impact(style?: HapticImpactStyle): void;

  /**
   * Trigger a notification haptic (iOS-style)
   * Falls back to vibrate on Android web
   */
  notification(type?: HapticNotificationType): void;

  /**
   * Trigger selection changed haptic (iOS-style)
   * Falls back to short vibrate on Android web
   */
  selectionChanged(): void;
}
