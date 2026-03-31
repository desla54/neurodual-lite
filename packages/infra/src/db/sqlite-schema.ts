/**
 * SQLite Schema
 *
 * Source de vérité UNIQUE pour le schema de la base de données SQLite (PowerSync + local-only).
 * Unified local storage schema for web and mobile platforms.
 *
 * Conversions PostgreSQL → SQLite :
 * - JSONB → TEXT (stored as JSON string)
 * - TIMESTAMP DEFAULT CURRENT_TIMESTAMP → TEXT DEFAULT (datetime('now'))
 * - BIGINT → TEXT for positions (preserve precision beyond 2^53)
 * - BOOLEAN → INTEGER (0/1)
 * - FLOAT → REAL
 * - DO $$ ... END $$ → Removed (use pragma-based migrations)
 *
 * IMPORTANT: Ne pas dupliquer ce schema ailleurs !
 */

export const SQLITE_SCHEMA = `
-- =============================================================================
-- PRAGMA Configuration SQLite
-- =============================================================================
-- Note: Ces PRAGMA doivent être exécutés à chaque nouvelle connexion
-- car ils ne sont pas persistés dans le fichier de base de données.

-- Foreign Keys: Active les contraintes de clés étrangères
-- Sans cela, ON DELETE CASCADE et les contraintes FK sont ignorées
PRAGMA foreign_keys = ON;

-- WAL Mode (Write-Ahead Logging): Performance et concurrence
-- Avantages:
-- - Lecteurs non bloqués par les écritures
-- - Écritures non bloquées par les lectures
-- - Meilleure performance sur les workloads mixtes read/write
-- - Récupération crash plus robuste
-- Important: Une fois activé, WAL persiste même après fermeture
PRAGMA journal_mode = WAL;

-- Synchronous NORMAL: Compromis sécurité/performance avec WAL
-- FULL = sync à chaque commit (lent mais 100% safe)
-- NORMAL = sync périodique (rapide, safe avec WAL)
-- OFF = pas de sync (risque de corruption)
-- Avec WAL, NORMAL offre une excellente durabilité sans le coût de FULL
PRAGMA synchronous = NORMAL;

-- Busy Timeout: Temps d'attente avant erreur "database is locked"
-- 5000ms = 5 secondes de retry automatique
-- Évite les erreurs SQLITE_BUSY lors d'accès concurrents
-- PowerSync + background sync peuvent créer des contentions
PRAGMA busy_timeout = 5000;

-- Cache Size: Taille du cache en mémoire
-- Valeur négative = taille en KB (pas en pages)
-- -64000 = 64MB de cache
-- Améliore les performances de lecture pour les requêtes répétitives
PRAGMA cache_size = -64000;

-- Temp Store: Stockage des tables temporaires
-- MEMORY = en RAM (plus rapide)
-- FILE = sur disque (plus de capacité)
-- Pour les opérations de tri et GROUP BY complexes
PRAGMA temp_store = MEMORY;

-- =============================================================================
-- PowerSync Synced Tables
-- =============================================================================
-- Canonical event store (synced): Emmett messages
CREATE TABLE IF NOT EXISTS emt_messages (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  stream_position TEXT NOT NULL,
  partition TEXT NOT NULL,
  message_kind TEXT NOT NULL,
  message_data TEXT,
  message_metadata TEXT,
  message_schema_version TEXT,
  message_type TEXT,
  message_id TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  global_position TEXT NOT NULL,
  created TEXT
);

CREATE INDEX IF NOT EXISTS emt_messages_stream_position_idx
  ON emt_messages(stream_id, stream_position, partition, is_archived);
CREATE INDEX IF NOT EXISTS emt_messages_stream_messages_idx
  ON emt_messages(stream_id, partition, global_position);
CREATE UNIQUE INDEX IF NOT EXISTS emt_messages_global_position_unique_idx
  ON emt_messages(global_position);
CREATE INDEX IF NOT EXISTS emt_messages_kind_archived_idx
  ON emt_messages(message_kind, is_archived);
CREATE INDEX IF NOT EXISTS emt_messages_kind_archived_stream_idx
  ON emt_messages(message_kind, is_archived, stream_id)
  WHERE is_archived = 0;
CREATE INDEX IF NOT EXISTS emt_messages_session_stream_idx
  ON emt_messages(message_kind, stream_id, global_position)
  WHERE message_kind = 'E' AND is_archived = 0;
CREATE INDEX IF NOT EXISTS emt_messages_kind_type_idx
  ON emt_messages(message_kind, message_type)
  WHERE message_kind = 'E' AND is_archived = 0;
CREATE INDEX IF NOT EXISTS emt_messages_message_id_idx
  ON emt_messages(message_id)
  WHERE message_kind = 'E' AND is_archived = 0;
-- global_position is stored as TEXT (BigInt). Read paths use CAST(global_position AS INTEGER)
-- for ordering/range filtering; a plain TEXT index cannot serve those queries.
CREATE INDEX IF NOT EXISTS emt_messages_global_position_int_idx
  ON emt_messages(CAST(global_position AS INTEGER))
  WHERE message_kind = 'E' AND is_archived = 0;

-- Session tombstones (synced)
CREATE TABLE IF NOT EXISTS deleted_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS deleted_sessions_user_idx ON deleted_sessions(user_id);
CREATE INDEX IF NOT EXISTS deleted_sessions_session_idx ON deleted_sessions(session_id);
CREATE INDEX IF NOT EXISTS deleted_sessions_created_at_idx ON deleted_sessions(created_at);

-- User reset markers (synced)
CREATE TABLE IF NOT EXISTS user_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  reset_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS user_resets_user_idx ON user_resets(user_id);
CREATE INDEX IF NOT EXISTS user_resets_reset_at_idx ON user_resets(reset_at);

-- =============================================================================
-- PowerSync Local-Only Tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_meta (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_deletions (
  id TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS algorithm_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  algorithm_type TEXT NOT NULL,
  state_json TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS algorithm_states_user_algo_idx
  ON algorithm_states(user_id, algorithm_type);

-- =============================================================================
-- Emmett Local-Only Tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS emt_streams (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  stream_position TEXT NOT NULL,
  partition TEXT NOT NULL,
  stream_type TEXT,
  stream_metadata TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS emt_streams_stream_id_idx ON emt_streams(stream_id);
CREATE INDEX IF NOT EXISTS emt_streams_stream_partition_idx
  ON emt_streams(stream_id, partition, is_archived);

CREATE TABLE IF NOT EXISTS emt_subscriptions (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  partition TEXT NOT NULL,
  last_processed_position TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS emt_subscriptions_subscription_idx
  ON emt_subscriptions(subscription_id, partition, version);

CREATE TABLE IF NOT EXISTS processed_commands (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  from_stream_position TEXT NOT NULL,
  to_stream_position TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS processed_commands_command_id_idx
  ON processed_commands(command_id);
CREATE INDEX IF NOT EXISTS processed_commands_aggregate_processed_idx
  ON processed_commands(aggregate_id, aggregate_type, processed_at);

CREATE TABLE IF NOT EXISTS projection_effects (
  id TEXT PRIMARY KEY,
  projection_id TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS projection_effects_projection_key_idx
  ON projection_effects(projection_id, effect_key);
CREATE INDEX IF NOT EXISTS projection_effects_projection_idx
  ON projection_effects(projection_id, applied_at);

-- =============================================================================
-- Read Models / Projections (local-only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  session_type TEXT,
  created_at TEXT,
  -- Pre-computed date part of created_at (YYYY-MM-DD) for index-friendly GROUP BY / DISTINCT.
  -- Populated at write time via substr(created_at, 1, 10); backfilled by migration v17.
  created_date TEXT,
  n_level INTEGER,
  duration_ms INTEGER,
  trials_count INTEGER,
  total_hits INTEGER,
  total_misses INTEGER,
  total_fa INTEGER,
  total_cr INTEGER,
  global_d_prime REAL,
  accuracy REAL,
  generator TEXT,
  game_mode TEXT,
  passed INTEGER,
  reason TEXT,
  journey_stage_id TEXT,
  journey_id TEXT,
  play_context TEXT,
  by_modality TEXT,
  active_modalities_csv TEXT,
  flow_confidence_score REAL,
  flow_directness_ratio REAL,
  flow_wrong_slot_dwell_ms INTEGER,
  recall_confidence_score REAL,
  recall_fluency_score REAL,
  recall_corrections_count INTEGER,
  ups_score REAL,
  ups_accuracy REAL,
  ups_confidence REAL,
  avg_response_time_ms REAL,
  median_response_time_ms REAL,
  response_time_std_dev REAL,
  avg_press_duration_ms REAL,
  press_duration_std_dev REAL,
  responses_during_stimulus INTEGER,
  responses_after_stimulus INTEGER,
  focus_lost_count INTEGER,
  focus_lost_total_ms INTEGER,
  xp_breakdown TEXT,
  worst_modality_error_rate REAL,
  journey_context TEXT,
  input_methods TEXT,
  adaptive_path_progress_pct REAL,
  absolute_score REAL
);

CREATE INDEX IF NOT EXISTS session_summaries_user_created_idx
  ON session_summaries(user_id, created_at);
CREATE INDEX IF NOT EXISTS session_summaries_user_created_session_idx
  ON session_summaries(user_id, created_at DESC, session_id DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_mode_created_idx
  ON session_summaries(user_id, game_mode, created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_reason_mode_created_idx
  ON session_summaries(user_id, reason, game_mode, created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_play_context_created_idx
  ON session_summaries(user_id, play_context, created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_modalities_created_idx
  ON session_summaries(user_id, active_modalities_csv, created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_reason_n_level_created_idx
  ON session_summaries(user_id, reason, n_level, created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_session_type_idx
  ON session_summaries(session_type);
CREATE INDEX IF NOT EXISTS session_summaries_user_revision_idx
  ON session_summaries(user_id, created_at DESC)
  WHERE reason = 'completed';
CREATE INDEX IF NOT EXISTS session_summaries_user_completed_order_idx
  ON session_summaries(user_id, created_at DESC, session_id DESC, focus_lost_count)
  WHERE reason = 'completed';
CREATE INDEX IF NOT EXISTS session_summaries_user_completed_pause_order_idx
  ON session_summaries(user_id, created_at DESC, session_id DESC)
  WHERE reason = 'completed' AND focus_lost_count > 0;
CREATE INDEX IF NOT EXISTS session_summaries_user_reason_created_date_idx
  ON session_summaries(user_id, reason, created_date DESC);
CREATE INDEX IF NOT EXISTS session_summaries_user_non_abandoned_created_date_idx
  ON session_summaries(user_id, created_date DESC)
  WHERE reason != 'abandoned';
CREATE INDEX IF NOT EXISTS session_summaries_user_completed_dprime_desc_idx
  ON session_summaries(user_id, global_d_prime DESC)
  WHERE reason = 'completed' AND global_d_prime IS NOT NULL;
CREATE INDEX IF NOT EXISTS session_summaries_session_id_idx
  ON session_summaries(session_id);
CREATE INDEX IF NOT EXISTS session_summaries_created_at_desc_idx
  ON session_summaries(created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_game_mode_agg_idx
  ON session_summaries(game_mode, duration_ms, n_level);

-- Stats cache (read-model caching)
CREATE TABLE IF NOT EXISTS stats_cache (
  cache_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  filters_key TEXT NOT NULL,
  revision TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stats_cache_user_kind_idx
  ON stats_cache(user_id, kind);
CREATE INDEX IF NOT EXISTS stats_cache_updated_at_idx
  ON stats_cache(updated_at);

-- UI cache (payload caching with pruning)
CREATE TABLE IF NOT EXISTS ui_cache (
  cache_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  revision TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  byte_len INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ui_cache_user_kind_idx
  ON ui_cache(user_id, kind);
CREATE INDEX IF NOT EXISTS ui_cache_updated_at_idx
  ON ui_cache(updated_at);

-- =============================================================================
-- Replay Runs (Interactive Replay - Run tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS replay_runs (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  parent_run_id  TEXT REFERENCES replay_runs(id),
  depth          INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 3),
  status         TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS replay_runs_session_idx ON replay_runs(session_id);
CREATE INDEX IF NOT EXISTS replay_runs_status_created_idx ON replay_runs(status, created_at);

-- =============================================================================
-- Replay Events (Interactive Replay - Event log per run)
-- =============================================================================
CREATE TABLE IF NOT EXISTS replay_events (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES replay_runs(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  payload         TEXT NOT NULL DEFAULT '{}',
  actor           TEXT NOT NULL CHECK (actor IN ('auto', 'user')),
  origin_event_id TEXT,
  skipped         INTEGER DEFAULT 0,
  skip_reason     TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('false_alarm', 'state_invalid'))
);

CREATE INDEX IF NOT EXISTS replay_events_run_idx ON replay_events(run_id);
CREATE INDEX IF NOT EXISTS replay_events_run_timestamp_idx ON replay_events(run_id, timestamp);

-- =============================================================================
-- Unified Projections (local-only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS streak_projection (
  id TEXT PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT
);
INSERT OR IGNORE INTO streak_projection (id, current_streak, best_streak, last_active_date)
VALUES ('1', 0, 0, NULL);

CREATE TABLE IF NOT EXISTS daily_activity_projection (
  date TEXT PRIMARY KEY,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS n_level_projection (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  n_level INTEGER NOT NULL,
  strikes_below_50 INTEGER NOT NULL DEFAULT 0,
  strikes_above_80 INTEGER NOT NULL DEFAULT 0,
  recommended_level INTEGER NOT NULL,
  last_updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS n_level_projection_user_level_idx
  ON n_level_projection(user_id, n_level);

CREATE TABLE IF NOT EXISTS journey_state_projection (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  journey_game_mode TEXT,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rules_version INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS journey_state_projection_user_journey_idx
  ON journey_state_projection(user_id, journey_id);
CREATE INDEX IF NOT EXISTS journey_state_projection_journey_id_idx
  ON journey_state_projection(journey_id);
CREATE INDEX IF NOT EXISTS journey_state_projection_journey_user_updated_idx
  ON journey_state_projection(journey_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cognitive_profile_projection (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  phase TEXT DEFAULT 'idle',
  current_step_index INTEGER DEFAULT 0,
  results_json TEXT DEFAULT '{}',
  recent_step_keys_json TEXT DEFAULT '[]',
  baseline_level INTEGER,
  modality_sources_json TEXT DEFAULT '{}',
  next_recommended_session_json TEXT,
  global_score INTEGER DEFAULT 0,
  strongest_modality TEXT,
  weakest_modality TEXT,
  calibration_session_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS cognitive_profile_projection_user_idx
  ON cognitive_profile_projection(user_id);

-- Emmett session_in_progress intermediate rows (local-only)
-- Append-only rows eliminate JSON.parse/JSON.stringify churn on a growing blob.
-- Pattern: SESSION_STARTED/intermediates → append; SESSION_ENDED → project → DELETE session rows.
CREATE TABLE IF NOT EXISTS session_in_progress_events (
  id TEXT PRIMARY KEY,  -- = session_id:global_position
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  global_position TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_in_progress_events_session_idx
  ON session_in_progress_events(session_id);
CREATE INDEX IF NOT EXISTS session_in_progress_events_session_position_idx
  ON session_in_progress_events(session_id, global_position);

-- =============================================================================
-- Stats Projections (Emmett running aggregates - local-only)
-- Maintained incrementally at SESSION_*_ENDED via session-summaries-projection.
-- Eliminates O(N) full-scan queries on stats page for the unfiltered case.
-- =============================================================================

-- Running totals per user (all completed sessions)
CREATE TABLE IF NOT EXISTS user_stats_projection (
  id TEXT PRIMARY KEY,  -- userId
  user_id TEXT NOT NULL,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  max_n_level INTEGER NOT NULL DEFAULT 0,
  last_n_level INTEGER NOT NULL DEFAULT 0,
  last_created_at TEXT,
  ups_sum REAL NOT NULL DEFAULT 0,
  ups_trial_count INTEGER NOT NULL DEFAULT 0,
  total_hits INTEGER NOT NULL DEFAULT 0,
  total_misses INTEGER NOT NULL DEFAULT 0,
  total_fa INTEGER NOT NULL DEFAULT 0,
  total_cr INTEGER NOT NULL DEFAULT 0,
  -- Progression fields (used by progressionSummary read model)
  abandoned_sessions INTEGER NOT NULL DEFAULT 0,
  total_trials INTEGER NOT NULL DEFAULT 0,
  total_xp INTEGER NOT NULL DEFAULT 0,
  first_session_at TEXT,
  early_morning_sessions INTEGER NOT NULL DEFAULT 0,
  late_night_sessions INTEGER NOT NULL DEFAULT 0,
  profile_sessions_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS user_stats_user_idx
  ON user_stats_projection(user_id);

-- Running modality totals per user × modality (all completed sessions)
CREATE TABLE IF NOT EXISTS user_modality_stats_projection (
  id TEXT PRIMARY KEY,  -- userId:modality
  user_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  hits_sum INTEGER NOT NULL DEFAULT 0,
  misses_sum INTEGER NOT NULL DEFAULT 0,
  fa_sum INTEGER NOT NULL DEFAULT 0,
  cr_sum INTEGER NOT NULL DEFAULT 0,
  rt_sum REAL NOT NULL DEFAULT 0,
  rt_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS user_modality_user_idx
  ON user_modality_stats_projection(user_id);
CREATE INDEX IF NOT EXISTS user_modality_user_modality_idx
  ON user_modality_stats_projection(user_id, modality);

-- Dead Letter Queue for failed projections (best-effort retry)
CREATE TABLE IF NOT EXISTS es_projection_errors (
  id TEXT PRIMARY KEY,
  projector_name TEXT NOT NULL,
  event_global_position TEXT NOT NULL,
  event_stream_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  failed_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TEXT
);
CREATE INDEX IF NOT EXISTS es_projection_errors_retry_idx
  ON es_projection_errors(retry_count, failed_at)
  WHERE retry_count < 5;
CREATE INDEX IF NOT EXISTS es_projection_errors_event_idx
  ON es_projection_errors(event_global_position, event_stream_id);
`;
