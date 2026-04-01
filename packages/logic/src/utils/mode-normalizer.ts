/**
 * Mode ID Normalizer
 *
 * Enforces canonical mode IDs across the app.
 * Runtime aliases are intentionally disabled to keep a single naming path.
 */

/**
 * Normalize a mode ID.
 * With runtime aliases disabled, this is an identity function.
 *
 * @param modeId - The mode ID to normalize
 * @returns The same mode ID
 *
 * @example
 * normalizeModeId('dualnback-classic') // → 'dualnback-classic'
 */
export function normalizeModeId(modeId: string): string {
  return modeId;
}
