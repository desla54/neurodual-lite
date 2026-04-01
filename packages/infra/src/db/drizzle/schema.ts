import { DrizzleAppSchema } from '@powersync/drizzle-driver';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { HistoryModalityStats, JourneyContext, XPBreakdown } from '@neurodual/logic';

type ModalityStatsJson = Record<string, HistoryModalityStats>;

export const sessionSummariesTable = sqliteTable(
  'session_summaries',
  {
    id: text('id').primaryKey().notNull(),
    session_id: text('session_id'),
    user_id: text('user_id'),
    session_type: text('session_type'),
    created_at: text('created_at'),
    created_date: text('created_date'),
    n_level: integer('n_level'),
    duration_ms: integer('duration_ms'),
    trials_count: integer('trials_count'),
    total_hits: integer('total_hits'),
    total_misses: integer('total_misses'),
    total_fa: integer('total_fa'),
    total_cr: integer('total_cr'),
    global_d_prime: real('global_d_prime'),
    accuracy: real('accuracy'),
    generator: text('generator'),
    game_mode: text('game_mode'),
    passed: integer('passed'),
    reason: text('reason'),
    journey_stage_id: text('journey_stage_id'),
    journey_id: text('journey_id'),
    play_context: text('play_context'),
    by_modality: text('by_modality').$type<ModalityStatsJson | null>(),
    adaptive_path_progress_pct: real('adaptive_path_progress_pct'),
    active_modalities_csv: text('active_modalities_csv'),
    flow_confidence_score: real('flow_confidence_score'),
    flow_directness_ratio: real('flow_directness_ratio'),
    flow_wrong_slot_dwell_ms: integer('flow_wrong_slot_dwell_ms'),
    recall_confidence_score: real('recall_confidence_score'),
    recall_fluency_score: real('recall_fluency_score'),
    recall_corrections_count: integer('recall_corrections_count'),
    ups_score: real('ups_score'),
    ups_accuracy: real('ups_accuracy'),
    ups_confidence: real('ups_confidence'),
    avg_response_time_ms: real('avg_response_time_ms'),
    median_response_time_ms: real('median_response_time_ms'),
    response_time_std_dev: real('response_time_std_dev'),
    avg_press_duration_ms: real('avg_press_duration_ms'),
    press_duration_std_dev: real('press_duration_std_dev'),
    responses_during_stimulus: integer('responses_during_stimulus'),
    responses_after_stimulus: integer('responses_after_stimulus'),
    focus_lost_count: integer('focus_lost_count'),
    focus_lost_total_ms: integer('focus_lost_total_ms'),
    xp_breakdown: text('xp_breakdown').$type<XPBreakdown | null>(),
    worst_modality_error_rate: real('worst_modality_error_rate'),
    journey_context: text('journey_context').$type<JourneyContext | null>(),
    input_methods: text('input_methods'),
    absolute_score: real('absolute_score'),
  },
  (table) => ({
    userCreatedIdx: index('session_summaries_user_created_idx').on(table.user_id, table.created_at),
    userCreatedSessionIdx: index('session_summaries_user_created_session_idx').on(
      table.user_id,
      table.created_at,
      table.session_id,
    ),
    userModeCreatedIdx: index('session_summaries_user_mode_created_idx').on(
      table.user_id,
      table.game_mode,
      table.created_at,
    ),
    userReasonModeCreatedIdx: index('session_summaries_user_reason_mode_created_idx').on(
      table.user_id,
      table.reason,
      table.game_mode,
      table.created_at,
    ),
    userPlayContextCreatedIdx: index('session_summaries_user_play_context_created_idx').on(
      table.user_id,
      table.play_context,
      table.created_at,
    ),
    userModalitiesCreatedIdx: index('session_summaries_user_modalities_created_idx').on(
      table.user_id,
      table.active_modalities_csv,
      table.created_at,
    ),
    userReasonNLevelCreatedIdx: index('session_summaries_user_reason_n_level_created_idx').on(
      table.user_id,
      table.reason,
      table.n_level,
      table.created_at,
    ),
    sessionTypeIdx: index('session_summaries_session_type_idx').on(table.session_type),
    sessionIdIdx: index('session_summaries_session_id_idx').on(table.session_id),
    userReasonCreatedDateIdx: index('session_summaries_user_reason_created_date_idx').on(
      table.user_id,
      table.reason,
      table.created_date,
    ),
    createdAtDescIdx: index('session_summaries_created_at_desc_idx').on(table.created_at),
    gameModeAggIdx: index('session_summaries_game_mode_agg_idx').on(
      table.game_mode,
      table.duration_ms,
      table.n_level,
    ),
  }),
);

// The options object keeps local-only read models in PowerSync's local SQLite cache.
export const drizzleSchema = {
  session_summaries: {
    tableDefinition: sessionSummariesTable,
    options: { localOnly: true },
  },
} as const;

export const PowerSyncDrizzleAppSchema = new DrizzleAppSchema(drizzleSchema);
