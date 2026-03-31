/**
 * Wake Lock port
 * Prevents the screen from dimming/sleeping during training sessions
 */

export interface WakeLockPort {
  /**
   * Check if wake lock is supported on this platform
   */
  isSupported(): boolean;

  /**
   * Keep the screen awake (call at session start)
   */
  keepAwake(): Promise<void>;

  /**
   * Allow the screen to sleep again (call at session end)
   */
  allowSleep(): Promise<void>;

  /**
   * Check if wake lock is currently active
   */
  isKeptAwake(): Promise<boolean>;
}
