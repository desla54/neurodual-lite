/**
 * Trial Color Coding System
 *
 * Provides a rotating palette of distinct colors for visual anchoring
 * of trials in Dual Flow and Dual Memo modes.
 *
 * The color for trial N helps users remember "that was the blue one"
 * instead of counting back mentally.
 *
 * Colors are assigned to trials and follow them through the timeline:
 * - Trial #1 gets red, stays red as it moves from N to N-1 to N-2...
 * - Trial #2 gets blue, stays blue...
 * - Colors cycle with minimal palette: nLevel + 2 colors
 *   (enough to avoid adjacent duplicates when a trial enters/exits)
 */

/**
 * 12 distinct border colors for trial coding.
 * Ordered for maximum visual distinction between adjacent colors.
 */
export const TRIAL_BORDER_COLORS = [
  'border-red-500',
  'border-blue-500',
  'border-emerald-500',
  'border-amber-500',
  'border-purple-500',
  'border-cyan-500',
  'border-pink-500',
  'border-orange-500',
  'border-lime-500',
  'border-indigo-500',
  'border-teal-500',
  'border-rose-500',
] as const;

/**
 * Matching background colors for timeline indicators.
 * Same order as TRIAL_BORDER_COLORS for visual consistency.
 */
export const TRIAL_BG_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-lime-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-rose-500',
] as const;

/**
 * Calculate the number of colors needed for a given N-level.
 * We need nLevel + 2 colors to ensure no adjacent duplicates:
 * - N-1 needs 3 colors (N, N-1, + 1 for the incoming trial)
 * - N-2 needs 4 colors (N, N-1, N-2, + 1 for incoming)
 * - etc.
 *
 * @param nLevel - The N-back level (1 for N-1, 2 for N-2, etc.)
 * @returns Number of colors to cycle through
 */
export function getColorCountForNLevel(nLevel: number): number {
  return nLevel + 2;
}

/**
 * Get the color index for a trial, using minimal palette based on N-level.
 *
 * @param trialIndex - Zero-based trial index
 * @param nLevel - The N-back level
 * @returns Color index (0 to nLevel+1)
 */
export function getTrialColorIndex(trialIndex: number, nLevel: number): number {
  const colorCount = getColorCountForNLevel(nLevel);
  return trialIndex % colorCount;
}

/**
 * Get the border color class for a trial, using minimal palette based on N-level.
 * The color follows the trial through the timeline.
 *
 * @param trialIndex - Zero-based trial index
 * @param nLevel - The N-back level
 * @returns Tailwind border color class (e.g., 'border-red-500')
 */
export function getTrialBorderColorForNLevel(trialIndex: number, nLevel: number): string {
  const colorIndex = getTrialColorIndex(trialIndex, nLevel);
  return TRIAL_BORDER_COLORS[colorIndex] as string;
}

/**
 * Get the background color class for a trial, using minimal palette based on N-level.
 * The color follows the trial through the timeline.
 *
 * @param trialIndex - Zero-based trial index
 * @param nLevel - The N-back level
 * @returns Tailwind background color class (e.g., 'bg-red-500')
 */
export function getTrialBgColorForNLevel(trialIndex: number, nLevel: number): string {
  const colorIndex = getTrialColorIndex(trialIndex, nLevel);
  return TRIAL_BG_COLORS[colorIndex] as string;
}
