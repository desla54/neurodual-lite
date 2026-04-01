import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { integer, QueryBuilder, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  getModeScoringStrategy,
  resolveGameModeIdsForStatsMode,
  type SessionSummariesCursor,
  type SessionSummariesFilters,
} from '@neurodual/logic';

// Keep list queries on the denormalized CSV column only.
// Falling back to JSON parsing here is expensive on large histories.
const DEFAULT_ACTIVE_MODALITIES_CSV = 'audio,position';

export interface CompiledSqlQuery {
  sql: string;
  parameters: readonly unknown[];
}

const sessionSummaries = sqliteTable('session_summaries', {
  id: text('id'),
  session_id: text('session_id'),
  user_id: text('user_id'),
  session_type: text('session_type'),
  created_at: text('created_at'),
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
  by_modality: text('by_modality'),
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
  xp_breakdown: text('xp_breakdown'),
  worst_modality_error_rate: real('worst_modality_error_rate'),
  journey_context: text('journey_context'),
  input_methods: text('input_methods'),
});

const historyQueryBuilder = new QueryBuilder();

function compileQuery(query: {
  toSQL: () => { sql: string; params: unknown[] };
}): CompiledSqlQuery {
  const compiled = query.toSQL();
  return { sql: compiled.sql, parameters: compiled.params };
}

function normalizeEffectiveUserIds(userIds: readonly string[]): string[] {
  const sanitized = userIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (sanitized.length === 0) return ['local'];
  return Array.from(new Set(sanitized));
}

function userScopeCondition(userIds: readonly string[]): SQL<unknown> {
  const effectiveUserIds = normalizeEffectiveUserIds(userIds);
  return sql`${sessionSummaries.user_id} IN (${sql.join(
    effectiveUserIds.map((userId) => sql`${userId}`),
    sql`, `,
  )})`;
}

function completedSessionsCondition(): SQL<unknown> {
  return sql`${sessionSummaries.reason} = 'completed'`;
}

function nonAbandonedSessionsCondition(): SQL<unknown> {
  return sql`${sessionSummaries.reason} != 'abandoned'`;
}

const ACTIVE_MODALITIES_CSV_EXPR = sql<string>`COALESCE(
  ${sessionSummaries.active_modalities_csv},
  ${DEFAULT_ACTIVE_MODALITIES_CSV}
)`;

const CANONICAL_GAME_MODE_IDS = [
  'dual-catch',
  'dual-place',
  'dual-memo',
  'dual-pick',
  'dual-trace',
  'dualnback-classic',
  'sim-brainworkshop',
  'custom',
] as const;

const SDT_SCORING_GAME_MODES: readonly string[] = CANONICAL_GAME_MODE_IDS.filter(
  (modeId) => getModeScoringStrategy(modeId) === 'sdt',
);

function normalizeModalitiesCsv(modalities: ReadonlySet<string>): string {
  return Array.from(modalities).sort().join(',');
}

function nonNullable<T>(value: T | null | undefined): value is T {
  return value != null;
}

function buildSessionSummariesFilterConditions(
  userIds: readonly string[],
  filters: SessionSummariesFilters,
): SQL[] {
  const conditions: Array<SQL | undefined> = [
    userScopeCondition(userIds),
    completedSessionsCondition(),
  ];

  if (filters.mode !== 'all') {
    if (filters.mode === 'Journey') {
      conditions.push(eq(sessionSummaries.play_context, 'journey'));
      // Defensive: treat journey sessions as stage-scoped sessions.
      // This prevents legacy/malformed rows with a stale journey_id from being
      // misclassified as journey sessions in filters.
      conditions.push(isNotNull(sessionSummaries.journey_stage_id));
      if (filters.journeyFilter !== 'all') {
        conditions.push(eq(sessionSummaries.journey_id, filters.journeyFilter));
      }
    } else if (filters.mode === 'Libre') {
      conditions.push(eq(sessionSummaries.play_context, 'free'));
      if (filters.freeModeFilter !== 'all') {
        const gameModeIds = resolveGameModeIdsForStatsMode(filters.freeModeFilter as any);
        if (gameModeIds.length === 0) {
          conditions.push(sql`1 = 0`);
        } else {
          conditions.push(inArray(sessionSummaries.game_mode, [...gameModeIds]));
        }
      }
    } else {
      const gameModeIds = resolveGameModeIdsForStatsMode(filters.mode as any);
      if (gameModeIds.length === 0) {
        conditions.push(sql`1 = 0`);
      } else {
        conditions.push(inArray(sessionSummaries.game_mode, [...gameModeIds]));
      }
    }
  }

  if (filters.modalities.size > 0) {
    conditions.push(
      sql`${ACTIVE_MODALITIES_CSV_EXPR} = ${normalizeModalitiesCsv(filters.modalities)}`,
    );
  }

  if (filters.startDate) {
    conditions.push(gte(sessionSummaries.created_at, filters.startDate.toISOString()));
  }
  if (filters.endDate) {
    const endOfDay = new Date(filters.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(sessionSummaries.created_at, endOfDay.toISOString()));
  }

  if (filters.nLevels.size > 0) {
    const levels = Array.from(filters.nLevels).sort((a, b) => a - b);
    conditions.push(inArray(sessionSummaries.n_level, levels));
  }

  return conditions.filter(nonNullable);
}

function combineConditions(conditions: SQL[]): SQL {
  if (conditions.length === 0) return sql`1 = 1`;
  if (conditions.length === 1) return conditions[0] ?? sql`1 = 1`;
  return and(...conditions) ?? sql`1 = 1`;
}

export function buildSessionSummariesFilteredCountCompiledQuery(
  userIds: readonly string[],
  filters: SessionSummariesFilters,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({ count: sql<number>`count(distinct ${sessionSummaries.session_id})` })
    .from(sessionSummaries)
    .where(combineConditions(buildSessionSummariesFilterConditions(userIds, filters)));
  return compileQuery(query);
}

export function buildSessionSummariesFilteredIdsCompiledQuery(
  userIds: readonly string[],
  filters: SessionSummariesFilters,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .selectDistinct({ session_id: sessionSummaries.session_id })
    .from(sessionSummaries)
    .where(combineConditions(buildSessionSummariesFilterConditions(userIds, filters)));
  return compileQuery(query);
}

export function buildSessionSummariesPageCompiledQuery(input: {
  userIds: readonly string[];
  filters: SessionSummariesFilters;
  cursor: SessionSummariesCursor | null;
  pageSize: number;
}): CompiledSqlQuery {
  const conditions = buildSessionSummariesFilterConditions(input.userIds, input.filters);
  if (input.cursor) {
    const cursorCondition = or(
      lt(sessionSummaries.created_at, input.cursor.createdAt),
      and(
        eq(sessionSummaries.created_at, input.cursor.createdAt),
        lt(sessionSummaries.session_id, input.cursor.sessionId),
      ),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      duration_ms: sessionSummaries.duration_ms,
      trials_count: sessionSummaries.trials_count,
      total_hits: sessionSummaries.total_hits,
      total_misses: sessionSummaries.total_misses,
      total_fa: sessionSummaries.total_fa,
      total_cr: sessionSummaries.total_cr,
      global_d_prime: sessionSummaries.global_d_prime,
      accuracy: sessionSummaries.accuracy,
      generator: sessionSummaries.generator,
      game_mode: sessionSummaries.game_mode,
      passed: sessionSummaries.passed,
      reason: sessionSummaries.reason,
      journey_stage_id: sessionSummaries.journey_stage_id,
      journey_id: sessionSummaries.journey_id,
      play_context: sessionSummaries.play_context,
      ups_score: sessionSummaries.ups_score,
      ups_accuracy: sessionSummaries.ups_accuracy,
      ups_confidence: sessionSummaries.ups_confidence,
      avg_response_time_ms: sessionSummaries.avg_response_time_ms,
      median_response_time_ms: sessionSummaries.median_response_time_ms,
      response_time_std_dev: sessionSummaries.response_time_std_dev,
      avg_press_duration_ms: sessionSummaries.avg_press_duration_ms,
      press_duration_std_dev: sessionSummaries.press_duration_std_dev,
      responses_during_stimulus: sessionSummaries.responses_during_stimulus,
      responses_after_stimulus: sessionSummaries.responses_after_stimulus,
      focus_lost_count: sessionSummaries.focus_lost_count,
      focus_lost_total_ms: sessionSummaries.focus_lost_total_ms,
      by_modality: sessionSummaries.by_modality,
      active_modalities_csv: ACTIVE_MODALITIES_CSV_EXPR,
    })
    .from(sessionSummaries)
    .where(combineConditions(conditions))
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id))
    .limit(input.pageSize);

  return compileQuery(query);
}

export function buildSessionDetailsCompiledQuery(
  userIds: readonly string[],
  sessionId: string,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select()
    .from(sessionSummaries)
    .where(
      combineConditions([userScopeCondition(userIds), eq(sessionSummaries.session_id, sessionId)]),
    )
    .limit(1);
  return compileQuery(query);
}

export function buildJourneyRecordableSessionsCompiledQuery(
  userIds: readonly string[],
  journeyId: string,
): CompiledSqlQuery {
  const effectiveUserIds = normalizeEffectiveUserIds(userIds);
  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      journey_stage_id: sessionSummaries.journey_stage_id,
      journey_id: sessionSummaries.journey_id,
      n_level: sessionSummaries.n_level,
      global_d_prime: sessionSummaries.global_d_prime,
      game_mode: sessionSummaries.game_mode,
      ups_score: sessionSummaries.ups_score,
      passed: sessionSummaries.passed,
      by_modality: sessionSummaries.by_modality,
    })
    .from(sessionSummaries)
    .where(
      combineConditions([
        inArray(sessionSummaries.user_id, effectiveUserIds),
        eq(sessionSummaries.journey_id, journeyId),
        eq(sessionSummaries.play_context, 'journey'),
        isNotNull(sessionSummaries.journey_stage_id),
        or(isNull(sessionSummaries.reason), eq(sessionSummaries.reason, 'completed')) ?? sql`1 = 0`,
      ]),
    )
    .orderBy(sessionSummaries.created_at, sessionSummaries.session_id);
  return compileQuery(query);
}

export function buildAvailableJourneyIdsCompiledQuery(
  userIds: readonly string[],
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .selectDistinct({ journey_id: sessionSummaries.journey_id })
    .from(sessionSummaries)
    .where(
      combineConditions([
        userScopeCondition(userIds),
        isNotNull(sessionSummaries.journey_id),
        ne(sessionSummaries.journey_id, ''),
        completedSessionsCondition(),
      ]),
    )
    .orderBy(asc(sessionSummaries.journey_id));
  return compileQuery(query);
}

export function buildSessionSummariesCountCompiledQuery(
  userIds: readonly string[],
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({ count: sql<number>`count(distinct ${sessionSummaries.session_id})` })
    .from(sessionSummaries)
    .where(combineConditions([userScopeCondition(userIds), completedSessionsCondition()]));
  return compileQuery(query);
}

export function buildSessionSummariesIdsCompiledQuery(
  userIds: readonly string[],
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .selectDistinct({ session_id: sessionSummaries.session_id })
    .from(sessionSummaries)
    .where(combineConditions([userScopeCondition(userIds), completedSessionsCondition()]));
  return compileQuery(query);
}

export function buildSessionSummariesHeaderCountsCompiledQuery(
  userIds: readonly string[],
  filters: SessionSummariesFilters,
): CompiledSqlQuery {
  const filteredIds = buildSessionSummariesFilteredIdsCompiledQuery(userIds, filters);
  const totalIds = buildSessionSummariesIdsCompiledQuery(userIds);

  return {
    sql: `SELECT
            CAST(
              COALESCE(
                (SELECT COUNT(*) FROM (${filteredIds.sql}) AS filtered_ids),
                0
              ) AS INTEGER
            ) AS filtered_count,
            CAST(
              COALESCE(
                (SELECT COUNT(*) FROM (${totalIds.sql}) AS total_ids),
                0
              ) AS INTEGER
            ) AS total_count`,
    parameters: [...filteredIds.parameters, ...totalIds.parameters],
  };
}

export function buildMaxAchievedLevelCompiledQuery(
  userIds: readonly string[],
  gameMode: string,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({ max_level: max(sessionSummaries.n_level).as('max_level') })
    .from(sessionSummaries)
    .where(
      combineConditions([
        userScopeCondition(userIds),
        eq(sessionSummaries.game_mode, gameMode),
        eq(sessionSummaries.passed, 1),
        completedSessionsCondition(),
      ]),
    );
  return compileQuery(query);
}

export function buildLastAdaptiveDPrimeCompiledQuery(userIds: readonly string[]): CompiledSqlQuery {
  const conditions: Array<SQL | undefined> = [
    userScopeCondition(userIds),
    completedSessionsCondition(),
  ];

  if (SDT_SCORING_GAME_MODES.length > 0) {
    conditions.push(inArray(sessionSummaries.game_mode, [...SDT_SCORING_GAME_MODES]));
  } else {
    conditions.push(sql`1 = 0`);
  }

  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      global_d_prime: sessionSummaries.global_d_prime,
    })
    .from(sessionSummaries)
    .where(combineConditions(conditions.filter(nonNullable)))
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id))
    .limit(1);
  return compileQuery(query);
}

export function buildRecentSessionsForTrendCompiledQuery(input: {
  userIds: readonly string[];
  gameMode: string;
  referenceCreatedAtIso: string | null;
  excludeSessionId: string;
  limit: number;
}): CompiledSqlQuery {
  const conditions: Array<SQL | undefined> = [
    userScopeCondition(input.userIds),
    completedSessionsCondition(),
  ];

  if (input.gameMode) {
    conditions.push(eq(sessionSummaries.game_mode, input.gameMode));
  } else {
    conditions.push(sql`1 = 0`);
  }

  if (input.excludeSessionId) {
    conditions.push(ne(sessionSummaries.session_id, input.excludeSessionId));
  }

  if (input.referenceCreatedAtIso) {
    conditions.push(lt(sessionSummaries.created_at, input.referenceCreatedAtIso));
  } else {
    conditions.push(sql`1 = 0`);
  }

  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      global_d_prime: sessionSummaries.global_d_prime,
      accuracy: sessionSummaries.accuracy,
      ups_score: sessionSummaries.ups_score,
      ups_accuracy: sessionSummaries.ups_accuracy,
    })
    .from(sessionSummaries)
    .where(combineConditions(conditions.filter(nonNullable)))
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id))
    .limit(input.limit);
  return compileQuery(query);
}

export function buildSessionsListCompiledQuery(
  userIds: readonly string[],
  limit?: number,
): CompiledSqlQuery {
  const baseQuery = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      duration_ms: sessionSummaries.duration_ms,
      trials_count: sessionSummaries.trials_count,
      total_hits: sessionSummaries.total_hits,
      total_misses: sessionSummaries.total_misses,
      total_fa: sessionSummaries.total_fa,
      total_cr: sessionSummaries.total_cr,
      global_d_prime: sessionSummaries.global_d_prime,
      accuracy: sessionSummaries.accuracy,
      generator: sessionSummaries.generator,
      game_mode: sessionSummaries.game_mode,
      passed: sessionSummaries.passed,
      reason: sessionSummaries.reason,
      journey_stage_id: sessionSummaries.journey_stage_id,
      journey_id: sessionSummaries.journey_id,
      play_context: sessionSummaries.play_context,
      ups_score: sessionSummaries.ups_score,
      ups_accuracy: sessionSummaries.ups_accuracy,
      ups_confidence: sessionSummaries.ups_confidence,
      avg_response_time_ms: sessionSummaries.avg_response_time_ms,
      median_response_time_ms: sessionSummaries.median_response_time_ms,
      response_time_std_dev: sessionSummaries.response_time_std_dev,
      avg_press_duration_ms: sessionSummaries.avg_press_duration_ms,
      press_duration_std_dev: sessionSummaries.press_duration_std_dev,
      responses_during_stimulus: sessionSummaries.responses_during_stimulus,
      responses_after_stimulus: sessionSummaries.responses_after_stimulus,
      focus_lost_count: sessionSummaries.focus_lost_count,
      focus_lost_total_ms: sessionSummaries.focus_lost_total_ms,
      active_modalities_csv: ACTIVE_MODALITIES_CSV_EXPR,
    })
    .from(sessionSummaries)
    .where(userScopeCondition(userIds))
    .orderBy(desc(sessionSummaries.created_at));

  const query = typeof limit === 'number' ? baseQuery.limit(limit) : baseQuery;
  return compileQuery(query);
}

export function buildSessionsByGameModeCompiledQuery(
  userIds: readonly string[],
  gameMode: string,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      duration_ms: sessionSummaries.duration_ms,
      trials_count: sessionSummaries.trials_count,
      total_hits: sessionSummaries.total_hits,
      total_misses: sessionSummaries.total_misses,
      total_fa: sessionSummaries.total_fa,
      total_cr: sessionSummaries.total_cr,
      global_d_prime: sessionSummaries.global_d_prime,
      accuracy: sessionSummaries.accuracy,
      generator: sessionSummaries.generator,
      game_mode: sessionSummaries.game_mode,
      passed: sessionSummaries.passed,
      reason: sessionSummaries.reason,
      journey_stage_id: sessionSummaries.journey_stage_id,
      journey_id: sessionSummaries.journey_id,
      play_context: sessionSummaries.play_context,
      ups_score: sessionSummaries.ups_score,
      ups_accuracy: sessionSummaries.ups_accuracy,
      ups_confidence: sessionSummaries.ups_confidence,
      avg_response_time_ms: sessionSummaries.avg_response_time_ms,
      median_response_time_ms: sessionSummaries.median_response_time_ms,
      response_time_std_dev: sessionSummaries.response_time_std_dev,
      avg_press_duration_ms: sessionSummaries.avg_press_duration_ms,
      press_duration_std_dev: sessionSummaries.press_duration_std_dev,
      responses_during_stimulus: sessionSummaries.responses_during_stimulus,
      responses_after_stimulus: sessionSummaries.responses_after_stimulus,
      focus_lost_count: sessionSummaries.focus_lost_count,
      focus_lost_total_ms: sessionSummaries.focus_lost_total_ms,
      active_modalities_csv: ACTIVE_MODALITIES_CSV_EXPR,
    })
    .from(sessionSummaries)
    .where(
      combineConditions([userScopeCondition(userIds), eq(sessionSummaries.game_mode, gameMode)]),
    )
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id));
  return compileQuery(query);
}

export function buildJourneySessionsCompiledQuery(userIds: readonly string[]): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      duration_ms: sessionSummaries.duration_ms,
      trials_count: sessionSummaries.trials_count,
      total_hits: sessionSummaries.total_hits,
      total_misses: sessionSummaries.total_misses,
      total_fa: sessionSummaries.total_fa,
      total_cr: sessionSummaries.total_cr,
      global_d_prime: sessionSummaries.global_d_prime,
      accuracy: sessionSummaries.accuracy,
      generator: sessionSummaries.generator,
      game_mode: sessionSummaries.game_mode,
      passed: sessionSummaries.passed,
      reason: sessionSummaries.reason,
      journey_stage_id: sessionSummaries.journey_stage_id,
      journey_id: sessionSummaries.journey_id,
      play_context: sessionSummaries.play_context,
      ups_score: sessionSummaries.ups_score,
      ups_accuracy: sessionSummaries.ups_accuracy,
      ups_confidence: sessionSummaries.ups_confidence,
      avg_response_time_ms: sessionSummaries.avg_response_time_ms,
      median_response_time_ms: sessionSummaries.median_response_time_ms,
      response_time_std_dev: sessionSummaries.response_time_std_dev,
      avg_press_duration_ms: sessionSummaries.avg_press_duration_ms,
      press_duration_std_dev: sessionSummaries.press_duration_std_dev,
      responses_during_stimulus: sessionSummaries.responses_during_stimulus,
      responses_after_stimulus: sessionSummaries.responses_after_stimulus,
      focus_lost_count: sessionSummaries.focus_lost_count,
      focus_lost_total_ms: sessionSummaries.focus_lost_total_ms,
      active_modalities_csv: ACTIVE_MODALITIES_CSV_EXPR,
    })
    .from(sessionSummaries)
    .where(
      combineConditions([
        userScopeCondition(userIds),
        eq(sessionSummaries.play_context, 'journey'),
      ]),
    )
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id));
  return compileQuery(query);
}

export function buildLatestJourneySessionCompiledQuery(
  userIds: readonly string[],
  journeyId: string,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
    })
    .from(sessionSummaries)
    .where(
      combineConditions([
        userScopeCondition(userIds),
        eq(sessionSummaries.play_context, 'journey'),
        completedSessionsCondition(),
        eq(sessionSummaries.journey_id, journeyId),
      ]),
    )
    .orderBy(desc(sessionSummaries.created_at), desc(sessionSummaries.session_id))
    .limit(1);
  return compileQuery(query);
}

export function buildSessionSummariesCompiledQuery(
  userIds: readonly string[],
  includeAbandoned: boolean,
): CompiledSqlQuery {
  const conditions: Array<SQL | undefined> = [userScopeCondition(userIds)];
  if (!includeAbandoned) conditions.push(nonAbandonedSessionsCondition());

  const query = historyQueryBuilder
    .select()
    .from(sessionSummaries)
    .where(combineConditions(conditions.filter(nonNullable)))
    .orderBy(desc(sessionSummaries.created_at));
  return compileQuery(query);
}

export function buildBrainWorkshopStrikesCompiledQuery(
  userIds: readonly string[],
  journeyId: string,
  limit: number,
): CompiledSqlQuery {
  const query = historyQueryBuilder
    .select({
      session_id: sessionSummaries.session_id,
      created_at: sessionSummaries.created_at,
      n_level: sessionSummaries.n_level,
      total_hits: sessionSummaries.total_hits,
      total_misses: sessionSummaries.total_misses,
      total_fa: sessionSummaries.total_fa,
      journey_context: sessionSummaries.journey_context,
    })
    .from(sessionSummaries)
    .where(
      combineConditions([
        userScopeCondition(userIds),
        eq(sessionSummaries.journey_id, journeyId),
        eq(sessionSummaries.game_mode, 'sim-brainworkshop'),
        completedSessionsCondition(),
      ]),
    )
    .orderBy(desc(sessionSummaries.created_at))
    .limit(limit);
  return compileQuery(query);
}
