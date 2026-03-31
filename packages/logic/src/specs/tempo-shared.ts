/**
 * Shared types for tempo-based modes.
 *
 * All tempo modes (Dual Catch, Jaeggi, BrainWorkshop, Custom) share these UI extensions.
 */

export interface TempoUiExtensions {
  /** Guided timeline (shows last N stimuli) */
  readonly guidedMode: boolean;
  /** Mirror timeline above the grid */
  readonly mirrorMode: boolean;
  /** Countdown mode (remaining trials) */
  readonly gameCountdownMode: boolean;
  /** Show progress bar in HUD */
  readonly gameShowProgressBar: boolean;
  /** Show N-level badge in HUD */
  readonly gameShowNLevel: boolean;
}
