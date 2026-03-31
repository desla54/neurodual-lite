/**
 * ClockPort
 *
 * Interface for time-related operations.
 * Allows deterministic timestamps for testing and replay.
 */

export interface ClockPort {
  /**
   * Get monotonic time in milliseconds (for durations).
   * In production: performance.now()
   * In tests: mock value
   */
  now(): number;

  /**
   * Get wall-clock time in milliseconds (for analytics).
   * In production: Date.now()
   * In tests: mock value
   */
  dateNow(): number;
}

/**
 * Default clock using browser APIs.
 */
export const browserClock: ClockPort = {
  now: () => performance.now(),
  dateNow: () => Date.now(),
};
