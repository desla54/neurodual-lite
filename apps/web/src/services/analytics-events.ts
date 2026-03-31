/**
 * Analytics Event Catalogue (types only, zero runtime)
 *
 * Defines every custom PostHog event name and its property shape.
 * Import `AnalyticsEventMap` for type-safe tracking via `trackEvent()`.
 */

// =============================================================================
// Event Map
// =============================================================================

export interface AnalyticsEventMap {
  // ── Session lifecycle ──────────────────────────────────────────────────────

  /** Fired when the user starts a new training session */
  session_started: {
    readonly session_id: string;
    readonly mode: string;
    readonly n_level: number;
    readonly modalities: readonly string[];
    readonly play_context: 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';
    readonly journey_id?: string;
    readonly algorithm?: string;
  };

  /** Fired when a session finishes normally */
  session_completed: {
    readonly session_id: string;
    readonly mode: string;
    readonly n_level: number;
    readonly modalities: readonly string[];
    readonly duration_ms: number;
    readonly ups: number;
    readonly passed: boolean;
    readonly next_level: number;
    readonly level_change: number;
    readonly xp_earned: number;
    readonly badges_earned: number;
    readonly leveled_up: boolean;
    readonly play_context: 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';
    readonly journey_id?: string;
    readonly stage_id?: number;
    readonly recommendation_tone?: 'up' | 'stay' | 'down' | 'strike';
    readonly stage_completed?: boolean;
    readonly consecutive_strikes?: number;
    readonly journey_game_mode?: string;
    readonly max_level?: number;
    readonly difficulty_mode?: string;
  };

  /** Fired when the user quits a session before completion */
  session_abandoned: {
    readonly session_id: string;
    readonly mode: string;
    readonly n_level: number;
    readonly trials_completed: number;
    readonly total_trials: number;
    readonly progress_pct: number;
    readonly play_context: 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';
    readonly journey_id?: string;
    readonly stage_id?: number;
  };

  /** Fired when the user clicks an action on the session report screen */
  report_action_clicked: {
    readonly session_id: string;
    readonly action:
      | 'play_again'
      | 'next_stage'
      | 'home'
      | 'correct'
      | 'replay'
      | 'go_to_stage'
      | 'start_at_level'
      | 'go_to_stats';
    readonly mode: string;
    readonly n_level: number;
    readonly play_context: 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';
    readonly journey_id?: string;
    readonly stage_id?: number;
  };

  // ── Subscription ───────────────────────────────────────────────────────────

  /** Fired when the upgrade/paywall dialog is shown */
  paywall_viewed: {
    readonly source: string;
    readonly current_plan: string;
  };

  /** Fired when the user initiates a purchase */
  upgrade_started: {
    readonly plan: string;
    readonly channel: 'web' | 'ios' | 'android';
  };

  /** Fired when a purchase succeeds */
  upgrade_completed: {
    readonly plan: string;
    readonly channel: 'web' | 'ios' | 'android';
  };

  /** Fired when a purchase fails */
  upgrade_failed: {
    readonly plan: string;
    readonly channel: 'web' | 'ios' | 'android';
    readonly error: string;
  };

  // ── Feature usage ──────────────────────────────────────────────────────────

  /** Fired when the user selects a game mode */
  mode_selected: {
    readonly mode: string;
    readonly source: string;
  };

  /** Fired when the user switches the active journey card */
  journey_switched: {
    readonly source: string;
    readonly journey_id: string;
    readonly game_mode: string;
    readonly direction: 'previous' | 'next' | 'picker';
  };

  /** Fired when the user changes a game setting */
  setting_changed: {
    readonly setting: string;
    readonly mode: string;
    readonly value: string | number | boolean;
  };

  // ── Performance ───────────────────────────────────────────────────────────

  /** Fired once when the app reaches "ready" state after cold start */
  app_loaded: {
    readonly cold_start_ms: number;
    readonly [key: string]: unknown;
  };

  /** Fired when the main thread is blocked > 2s (freeze watchdog) */
  freeze_detected: {
    readonly duration_ms: number;
    readonly context: string;
  };

  /** Fired once per page load with Core Web Vitals */
  web_vitals: {
    readonly lcp_ms?: number;
    readonly fid_ms?: number;
    readonly cls?: number;
    readonly ttfb_ms?: number;
  };

  // ── Ads ──────────────────────────────────────────────────────────────────

  /** Fired when maybeShow is called — tracks every ad opportunity */
  ad_opportunity: {
    readonly result:
      | 'shown'
      | 'skipped_premium'
      | 'skipped_not_native'
      | 'skipped_not_initialized'
      | 'skipped_cooldown'
      | 'skipped_frequency'
      | 'skipped_not_loaded'
      | 'waited_and_shown'
      | 'waited_timeout'
      | 'show_error';
    readonly session_count: number;
    readonly ad_loaded: boolean;
    readonly waited_ms?: number;
  };
}
