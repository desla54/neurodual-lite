/**
 * Journey State Projection (fact-driven)
 *
 * Rebuilds journey state from session_summaries using `projectJourneyFromHistory()`.
 * The projection is disposable: any rule change triggers a full rebuild from facts.
 *
 * Old event-driven handler (JOURNEY_TRANSITION_DECIDED) is replaced by
 * `rebuildJourneyProjection()` called after each journey session summary insert.
 */
import {
  projectJourneyFromHistory,
  resolveHybridJourneyStrategyConfig,
  isSimulatorMode,
  normalizeModeId,
  getAcceptedGameModesForJourney,
  deriveNextSession,
  type JourneyProjectionSession,
  type JourneyState,
  type JourneyWorkflowConfig,
} from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { ProjectionDefinition } from './projection-definition';
import { clearProjectionEffects } from './projection-effects';
import { JOURNEY_RULES_VERSION } from './journey-rules-version';
import { parseSqlDateToMs, safeJsonParse } from '../db/sql-helpers';

// =============================================================================
// Types
// =============================================================================

export interface RebuildJourneyConfig {
  readonly journeyId: string;
  readonly userId: string;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
  readonly strategyConfig?: {
    readonly trackSessionsPerBlock?: number;
    readonly dnbSessionsPerBlock?: number;
  };
}

interface SessionSummaryRow {
  session_id: string;
  journey_stage_id: string | null;
  journey_id: string | null;
  n_level: number | null;
  global_d_prime: number | null;
  game_mode: string | null;
  ups_score: number | null;
  created_at: string | null;
  by_modality: string | null;
  passed: number | null;
  adaptive_path_progress_pct: number | null;
}

// =============================================================================
// Fact-driven rebuild
// =============================================================================

function rowToProjectionSession(row: SessionSummaryRow): JourneyProjectionSession {
  let byModality:
    | Record<
        string,
        { hits: number; misses: number; falseAlarms: number; correctRejections: number }
      >
    | undefined;
  if (row.by_modality) {
    byModality =
      safeJsonParse<Record<
        string,
        { hits: number; misses: number; falseAlarms: number; correctRejections: number }
      > | null>(row.by_modality, null) ?? undefined;
  }

  return {
    sessionId: row.session_id,
    journeyStageId: row.journey_stage_id != null ? Number(row.journey_stage_id) : undefined,
    journeyId: row.journey_id ?? undefined,
    nLevel: row.n_level ?? undefined,
    dPrime: row.global_d_prime ?? 0,
    gameMode: row.game_mode ?? undefined,
    upsScore: row.ups_score ?? undefined,
    timestamp: parseSqlDateToMs(row.created_at) ?? undefined,
    byModality,
    passed: row.passed != null ? row.passed === 1 : undefined,
    adaptivePathProgressPct: row.adaptive_path_progress_pct ?? undefined,
  };
}

/**
 * Rebuild the journey_state_projection for a given journey from session_summaries.
 *
 * 1. Queries all completed journey sessions from session_summaries
 * 2. Projects the full journey state using `projectJourneyFromHistory()`
 * 3. Upserts the result + rules_version into journey_state_projection
 */
export async function rebuildJourneyProjection(
  db: AbstractPowerSyncDatabase,
  config: RebuildJourneyConfig,
): Promise<JourneyState> {
  const { journeyId, userId, startLevel, targetLevel, gameMode, strategyConfig } = config;

  // 1. Query all completed journey sessions
  const rows = await db.getAll<SessionSummaryRow>(
    `SELECT session_id, journey_stage_id, journey_id, n_level, global_d_prime,
            game_mode, ups_score, created_at, by_modality, passed, adaptive_path_progress_pct
     FROM session_summaries
     WHERE play_context = 'journey'
       AND journey_id = ?
       AND reason = 'completed'
     ORDER BY created_at ASC`,
    [journeyId],
  );

  // 2. Map to JourneyProjectionSession[] with mode filtering
  const expectedModes = new Set(
    (getAcceptedGameModesForJourney(gameMode) ?? []).map((m) => normalizeModeId(m)),
  );
  const shouldFilterByMode = expectedModes.size > 0;

  const sessions: JourneyProjectionSession[] = rows.map(rowToProjectionSession).filter((s) => {
    if (!shouldFilterByMode) return true;
    if (!s.gameMode) return true;
    return expectedModes.has(normalizeModeId(s.gameMode));
  });

  // 3. Project journey state
  const isSimulator = isSimulatorMode(gameMode);
  const hybridOptions = strategyConfig
    ? {
        trackSessionsPerBlock: strategyConfig.trackSessionsPerBlock,
        dnbSessionsPerBlock: strategyConfig.dnbSessionsPerBlock,
      }
    : gameMode
      ? resolveHybridJourneyStrategyConfig({ gameMode })
      : undefined;

  let effectiveStartLevel = startLevel;
  let state = projectJourneyFromHistory(
    sessions,
    targetLevel,
    effectiveStartLevel,
    journeyId,
    isSimulator,
    gameMode,
    hybridOptions,
  );

  // 3b. Auto-expand: if the player regressed below startLevel, re-project
  // with the lower startLevel so that stages are generated correctly.
  // This makes the expansion atomic — no need for a separate async round-trip
  // through the settings store + JourneyExpansionHandler component.
  if (
    typeof state.suggestedStartLevel === 'number' &&
    state.suggestedStartLevel < effectiveStartLevel
  ) {
    effectiveStartLevel = state.suggestedStartLevel;
    state = projectJourneyFromHistory(
      sessions,
      targetLevel,
      effectiveStartLevel,
      journeyId,
      isSimulator,
      gameMode,
      hybridOptions,
    );
  }

  // 4. Derive the NextSessionCommand and attach to state
  const workflowConfig: JourneyWorkflowConfig = {
    journeyId,
    startLevel: effectiveStartLevel,
    targetLevel,
    gameMode,
    isSimulator,
    hybridTrackSessionsPerBlock: strategyConfig?.trackSessionsPerBlock,
    hybridDnbSessionsPerBlock: strategyConfig?.dnbSessionsPerBlock,
  };
  const nextSessionCmd = deriveNextSession(state, workflowConfig);
  if (nextSessionCmd) {
    state.nextSession = {
      stageId: nextSessionCmd.stageId,
      nLevel: nextSessionCmd.nLevel,
      gameMode: nextSessionCmd.gameMode,
      route: nextSessionCmd.route,
    };
  } else {
    state.nextSession = undefined;
  }

  // 5. Write into journey_state_projection
  // PowerSync local-only tables are views — UPSERT ("ON CONFLICT DO UPDATE") is not
  // supported on views. Use INSERT OR IGNORE + UPDATE (proven pattern from
  // streak-projection, daily-activity-projection, projection-processor).
  const key = `${userId}:${journeyId}`;
  const stateJson = JSON.stringify(state);
  const now = new Date().toISOString();

  await db.execute(
    `INSERT OR IGNORE INTO journey_state_projection
       (id, user_id, journey_id, journey_game_mode, state_json, updated_at, rules_version)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [key, userId, journeyId, gameMode ?? null, stateJson, now, JOURNEY_RULES_VERSION],
  );
  await db.execute(
    `UPDATE journey_state_projection
     SET state_json = ?, journey_game_mode = ?, updated_at = ?, rules_version = ?
     WHERE id = ?`,
    [stateJson, gameMode ?? null, now, JOURNEY_RULES_VERSION, key],
  );

  return state;
}

// =============================================================================
// Legacy event-driven handler (disabled — kept as no-op for backward compat)
// =============================================================================

export const journeyStateProjectionDefinition: ProjectionDefinition = {
  id: 'journey-state',
  version: 1,
  canHandle: new Set(['JOURNEY_TRANSITION_DECIDED']),

  // No-op: journey state is now rebuilt from session_summaries after each session.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handle(_events, _db: AbstractPowerSyncDatabase) {
    // Intentionally empty — rebuild is triggered by session-summaries-projection.
  },

  async truncate(db: AbstractPowerSyncDatabase) {
    await db.execute('DELETE FROM journey_state_projection');
    await clearProjectionEffects(db, 'journey-state-v1');
  },
};
