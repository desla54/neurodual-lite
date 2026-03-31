import { DrizzleAppSchema } from '@powersync/drizzle-driver';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { HistoryModalityStats, JourneyContext, XPBreakdown } from '@neurodual/logic';

type ModalityStatsJson = Record<string, HistoryModalityStats>;

export const emtMessagesTable = sqliteTable(
  'emt_messages',
  {
    id: text('id').primaryKey().notNull(),
    stream_id: text('stream_id').notNull(),
    stream_position: text('stream_position').notNull(),
    partition: text('partition').notNull(),
    message_kind: text('message_kind').notNull(),
    message_data: text('message_data'),
    message_metadata: text('message_metadata'),
    message_schema_version: text('message_schema_version'),
    message_type: text('message_type'),
    message_id: text('message_id'),
    is_archived: integer('is_archived').notNull(),
    global_position: text('global_position').notNull(),
    created: text('created'),
  },
  (table) => ({
    streamPositionIdx: index('emt_messages_stream_position_idx').on(
      table.stream_id,
      table.stream_position,
      table.partition,
      table.is_archived,
    ),
    streamMessagesIdx: index('emt_messages_stream_messages_idx').on(
      table.stream_id,
      table.partition,
      table.global_position,
    ),
    globalPositionUniqueIdx: index('emt_messages_global_position_unique_idx').on(
      table.global_position,
    ),
    kindArchivedIdx: index('emt_messages_kind_archived_idx').on(
      table.message_kind,
      table.is_archived,
    ),
  }),
);

export const deletedSessionsTable = sqliteTable(
  'deleted_sessions',
  {
    id: text('id').primaryKey().notNull(),
    session_id: text('session_id'),
    user_id: text('user_id'),
    created_at: text('created_at'),
  },
  (table) => ({
    userIdx: index('deleted_sessions_user_idx').on(table.user_id),
    sessionIdx: index('deleted_sessions_session_idx').on(table.session_id),
    createdAtIdx: index('deleted_sessions_created_at_idx').on(table.created_at),
  }),
);

export const userResetsTable = sqliteTable(
  'user_resets',
  {
    id: text('id').primaryKey().notNull(),
    user_id: text('user_id'),
    reset_at: text('reset_at'),
    created_at: text('created_at'),
  },
  (table) => ({
    userIdx: index('user_resets_user_idx').on(table.user_id),
    resetAtIdx: index('user_resets_reset_at_idx').on(table.reset_at),
  }),
);

export const emtStreamsTable = sqliteTable(
  'emt_streams',
  {
    id: text('id').primaryKey().notNull(),
    stream_id: text('stream_id').notNull(),
    stream_position: text('stream_position').notNull(),
    partition: text('partition').notNull(),
    stream_type: text('stream_type'),
    stream_metadata: text('stream_metadata'),
    is_archived: integer('is_archived').notNull(),
  },
  (table) => ({
    streamIdIdx: index('emt_streams_stream_id_idx').on(table.stream_id),
    streamPartitionIdx: index('emt_streams_stream_partition_idx').on(
      table.stream_id,
      table.partition,
      table.is_archived,
    ),
  }),
);

export const emtSubscriptionsTable = sqliteTable(
  'emt_subscriptions',
  {
    id: text('id').primaryKey().notNull(),
    subscription_id: text('subscription_id').notNull(),
    version: integer('version').notNull(),
    partition: text('partition').notNull(),
    last_processed_position: text('last_processed_position').notNull(),
  },
  (table) => ({
    subscriptionIdx: index('emt_subscriptions_subscription_idx').on(
      table.subscription_id,
      table.partition,
      table.version,
    ),
  }),
);

export const processedCommandsTable = sqliteTable(
  'processed_commands',
  {
    id: text('id').primaryKey().notNull(),
    command_id: text('command_id').notNull(),
    aggregate_id: text('aggregate_id').notNull(),
    aggregate_type: text('aggregate_type').notNull(),
    processed_at: text('processed_at').notNull(),
    from_stream_position: text('from_stream_position').notNull(),
    to_stream_position: text('to_stream_position').notNull(),
  },
  (table) => ({
    commandIdIdx: index('processed_commands_command_id_idx').on(table.command_id),
    aggregateProcessedIdx: index('processed_commands_aggregate_processed_idx').on(
      table.aggregate_id,
      table.aggregate_type,
      table.processed_at,
    ),
  }),
);

export const sessionInProgressEventsTable = sqliteTable(
  'session_in_progress_events',
  {
    id: text('id').primaryKey().notNull(),
    session_id: text('session_id').notNull(),
    event_type: text('event_type').notNull(),
    event_data: text('event_data').notNull(),
    global_position: text('global_position').notNull(),
    created_at: integer('created_at').notNull(),
  },
  (table) => ({
    sessionIdx: index('session_in_progress_events_session_idx').on(table.session_id),
    sessionPositionIdx: index('session_in_progress_events_session_position_idx').on(
      table.session_id,
      table.global_position,
    ),
  }),
);

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
  emt_messages: emtMessagesTable,
  deleted_sessions: deletedSessionsTable,
  user_resets: userResetsTable,
  emt_streams: {
    tableDefinition: emtStreamsTable,
    options: { localOnly: true },
  },
  emt_subscriptions: {
    tableDefinition: emtSubscriptionsTable,
    options: { localOnly: true },
  },
  processed_commands: {
    tableDefinition: processedCommandsTable,
    options: { localOnly: true },
  },
  session_in_progress_events: {
    tableDefinition: sessionInProgressEventsTable,
    options: { localOnly: true },
  },
  session_summaries: {
    tableDefinition: sessionSummariesTable,
    options: { localOnly: true },
  },
} as const;

export const PowerSyncDrizzleAppSchema = new DrizzleAppSchema(drizzleSchema);
