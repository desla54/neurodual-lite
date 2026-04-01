/**
 * PowerSync Schema
 *
 * Local-only SQLite schema (via PowerSync driver).
 * All tables are local-only — no cloud sync.
 */

import { column, Schema, Table } from '@powersync/web';

// Local-only settings (id = key, e.g. "local_config")
const settings = new Table(
  {
    value: column.text,
    updated_at: column.text,
  },
  { localOnly: true },
);

// Local-only metadata (id = key)
const sync_meta = new Table(
  {
    value: column.text,
    updated_at: column.text,
  },
  { localOnly: true },
);

// Local-only deletion queue (id = session_id)
const pending_deletions = new Table(
  {
    requested_at: column.integer,
  },
  { localOnly: true },
);

// Local-only algorithm state (id = `${userId}:${algorithmType}`)
const algorithm_states = new Table(
  {
    user_id: column.text,
    algorithm_type: column.text,
    state_json: column.text,
    session_count: column.integer,
    updated_at: column.text,
  },
  {
    localOnly: true,
    indexes: {
      user_algo_idx: ['user_id', 'algorithm_type'],
    },
  },
);

// Session events archive (local-only) — stores raw events as JSON blob per session.
// Used by replay and history adapters.
const session_events = new Table(
  {
    session_id: column.text,
    events_json: column.text,
    created_at: column.text,
  },
  {
    localOnly: true,
    indexes: {
      session_id_idx: ['session_id'],
    },
  },
);

// Running stats totals per user (all completed sessions, local-only)
const user_stats_projection = new Table(
  {
    user_id: column.text,
    sessions_count: column.integer,
    total_duration_ms: column.integer,
    active_days: column.integer,
    max_n_level: column.integer,
    last_n_level: column.integer,
    last_created_at: column.text,
    ups_sum: column.real,
    ups_trial_count: column.integer,
    total_hits: column.integer,
    total_misses: column.integer,
    total_fa: column.integer,
    total_cr: column.integer,
    // Progression fields (progressionSummary read model)
    abandoned_sessions: column.integer,
    total_trials: column.integer,
    total_xp: column.integer,
    first_session_at: column.text,
    early_morning_sessions: column.integer,
    late_night_sessions: column.integer,
    profile_sessions_count: column.integer,
  },
  {
    localOnly: true,
    indexes: { user_idx: ['user_id'] },
  },
);

// Running modality totals per user × modality (all completed sessions, local-only)
const user_modality_stats_projection = new Table(
  {
    user_id: column.text,
    modality: column.text,
    hits_sum: column.integer,
    misses_sum: column.integer,
    fa_sum: column.integer,
    cr_sum: column.integer,
    rt_sum: column.real,
    rt_count: column.integer,
  },
  {
    localOnly: true,
    indexes: {
      user_idx: ['user_id'],
      user_modality_idx: ['user_id', 'modality'],
    },
  },
);

// Local-only SQL cache of projected session summaries (id = session_id)
const session_summaries = new Table(
  {
    session_id: column.text,
    user_id: column.text,
    session_type: column.text,
    created_at: column.text,
    created_date: column.text,
    n_level: column.integer,
    duration_ms: column.integer,
    trials_count: column.integer,
    total_hits: column.integer,
    total_misses: column.integer,
    total_fa: column.integer,
    total_cr: column.integer,
    global_d_prime: column.real,
    accuracy: column.real,
    generator: column.text,
    game_mode: column.text,
    passed: column.integer,
    reason: column.text,
    journey_stage_id: column.text,
    journey_id: column.text,
    play_context: column.text,
    by_modality: column.text,
    adaptive_path_progress_pct: column.real,
    // Materialized sorted modalities CSV for exact filter match without json_each scans.
    active_modalities_csv: column.text,
    flow_confidence_score: column.real,
    flow_directness_ratio: column.real,
    flow_wrong_slot_dwell_ms: column.integer,
    recall_confidence_score: column.real,
    recall_fluency_score: column.real,
    recall_corrections_count: column.integer,
    ups_score: column.real,
    ups_accuracy: column.real,
    ups_confidence: column.real,
    avg_response_time_ms: column.real,
    median_response_time_ms: column.real,
    response_time_std_dev: column.real,
    avg_press_duration_ms: column.real,
    press_duration_std_dev: column.real,
    responses_during_stimulus: column.integer,
    responses_after_stimulus: column.integer,
    focus_lost_count: column.integer,
    focus_lost_total_ms: column.integer,
    xp_breakdown: column.text,
    // Pre-computed worst modality error rate for fast time series queries
    worst_modality_error_rate: column.real,
    // Journey context (JSON) for historical display
    journey_context: column.text,
    // Comma-separated input methods used (e.g. "keyboard,touch")
    input_methods: column.text,
    absolute_score: column.real,
  },
  {
    localOnly: true,
    indexes: {
      user_created_idx: ['user_id', 'created_at'],
      user_created_session_idx: ['user_id', 'created_at', 'session_id'],
      user_mode_created_idx: ['user_id', 'game_mode', 'created_at'],
      user_reason_mode_created_idx: ['user_id', 'reason', 'game_mode', 'created_at'],
      user_play_context_created_idx: ['user_id', 'play_context', 'created_at'],
      user_modalities_created_idx: ['user_id', 'active_modalities_csv', 'created_at'],
      session_type_idx: ['session_type'],
      session_id_idx: ['session_id'],
      user_reason_n_level_created_idx: ['user_id', 'reason', 'n_level', 'created_at'],
      user_reason_created_date_idx: ['user_id', 'reason', 'created_date'],
      created_at_desc_idx: ['created_at'],
      game_mode_agg_idx: ['game_mode', 'duration_ms', 'n_level'],
    },
  },
);

// Local-only interactive replay tables
const replay_runs = new Table(
  {
    session_id: column.text,
    parent_run_id: column.text,
    depth: column.integer,
    status: column.text,
    created_at: column.integer,
  },
  {
    localOnly: true,
    indexes: {
      session_idx: ['session_id'],
      status_created_idx: ['status', 'created_at'],
    },
  },
);

const replay_events = new Table(
  {
    run_id: column.text,
    type: column.text,
    timestamp: column.integer,
    payload: column.text,
    actor: column.text,
    origin_event_id: column.text,
    skipped: column.integer,
    skip_reason: column.text,
  },
  {
    localOnly: true,
    indexes: {
      run_idx: ['run_id'],
      run_timestamp_idx: ['run_id', 'timestamp'],
    },
  },
);

// =============================================================================
// Projection Tables (Phase 3: Unified Projections)
// =============================================================================

/**
 * Streak Projection Table
 *
 * Tracks user streak computed from session events.
 * Single row with id=1 for simplicity (per-user streaks).
 */
const streak_projection = new Table(
  {
    id: column.text, // Always '1' for global streak
    current_streak: column.integer,
    best_streak: column.integer,
    last_active_date: column.text, // YYYY-MM-DD format
  },
  {
    localOnly: true,
    indexes: {
      id_idx: ['id'],
    },
  },
);

/**
 * Daily Activity Projection Table
 *
 * Tracks session count and duration per day.
 */
const daily_activity_projection = new Table(
  {
    date: column.text, // YYYY-MM-DD format, unique
    sessions_count: column.integer,
    total_duration_ms: column.integer,
  },
  {
    localOnly: true,
    indexes: {
      date_idx: ['date'],
    },
  },
);

/**
 * N-Level Projection Table
 *
 * Tracks adaptive difficulty state for n-back sessions.
 * Used for Brain Workshop level adjustment rules.
 */
const n_level_projection = new Table(
  {
    id: column.text, // Composite: `${userId}:${nLevel}`
    user_id: column.text,
    n_level: column.integer,
    strikes_below_50: column.integer, // Consecutive sessions < 50%
    strikes_above_80: column.integer, // Consecutive sessions > 80%
    recommended_level: column.integer,
    last_updated: column.text, // ISO date
  },
  {
    localOnly: true,
    indexes: {
      id_idx: ['id'],
      user_level_idx: ['user_id', 'n_level'],
    },
  },
);

const journey_state_projection = new Table(
  {
    id: column.text,
    user_id: column.text,
    journey_id: column.text,
    journey_game_mode: column.text,
    state_json: column.text,
    updated_at: column.text,
    rules_version: column.integer,
  },
  {
    localOnly: true,
    indexes: {
      id_idx: ['id'],
      user_journey_idx: ['user_id', 'journey_id'],
      journey_id_idx: ['journey_id'],
      journey_user_updated_idx: ['journey_id', 'user_id', 'updated_at'],
    },
  },
);

/**
 * Cognitive Profile Projection Table (local-only)
 *
 * Maintained incrementally at SESSION_ENDED for calibration sessions.
 * Stores the full calibration state as JSON + derived summary fields.
 * Single row per user (id = userId).
 */
const cognitive_profile_projection = new Table(
  {
    user_id: column.text,
    phase: column.text, // 'idle' | 'running' | 'complete'
    current_step_index: column.integer,
    results_json: column.text, // JSON Record<string, ModalityCalibrationState>
    recent_step_keys_json: column.text, // JSON string[] (most recent first)
    baseline_level: column.integer,
    modality_sources_json: column.text, // JSON Record<stepKey, { source, baselineLevel }>
    next_recommended_session_json: column.text, // JSON NextTrainingSession | null
    global_score: column.integer,
    strongest_modality: column.text,
    weakest_modality: column.text,
    calibration_session_id: column.text,
    started_at: column.text,
    completed_at: column.text,
    updated_at: column.text,
  },
  {
    localOnly: true,
    indexes: {
      user_idx: ['user_id'],
    },
  },
);

/**
 * PowerSync App Schema
 *
 * Single local SQLite DB (local-only, no cloud sync).
 */
export const PowerSyncAppSchema = new Schema({
  settings,
  sync_meta,
  pending_deletions,
  algorithm_states,
  session_summaries,
  session_events,
  replay_runs,
  replay_events,
  streak_projection,
  daily_activity_projection,
  n_level_projection,
  journey_state_projection,
  user_stats_projection,
  user_modality_stats_projection,
  cognitive_profile_projection,
});

/**
 * Database type for type-safe queries
 */
export type PowerSyncDatabase = (typeof PowerSyncAppSchema)['types'];

/**
 * Lightweight "signal" row for watchers.
 */
export interface PowerSyncEventSignalRow {
  id: string;
  session_id: string;
  type: string;
  timestamp: number;
  deleted: number;
}
