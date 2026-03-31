/**
 * CursorPositionPort
 *
 * Port for accessing cursor/pointer position from the UI layer.
 * Used to capture cursor position at stimulus time for RT analysis
 * that accounts for cursor travel distance (mouse input only).
 */

/**
 * Cursor/pointer position in viewport coordinates.
 */
export interface CursorPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Port for reading current cursor position.
 * Implemented by UI layer (tracks mousemove events).
 */
export interface CursorPositionPort {
  /**
   * Get current cursor position.
   * Returns null if position is unknown (e.g., touch device, or mouse hasn't moved).
   */
  getCurrentPosition(): CursorPosition | null;
}
