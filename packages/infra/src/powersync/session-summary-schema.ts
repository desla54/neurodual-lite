/**
 * Session summary SQL schema helpers.
 *
 * Extracted to break the circular dependency between
 * powersync-persistence-adapter.ts and session-summaries-projection.ts.
 */

import type { SessionSummaryInput } from '@neurodual/logic';

export const SESSION_SUMMARY_INSERT_COLUMNS = [
  'id',
  'session_id',
  'user_id',
  'session_type',
  'created_at',
  'created_date',
  'n_level',
  'duration_ms',
  'trials_count',
  'total_hits',
  'total_misses',
  'total_fa',
  'total_cr',
  'global_d_prime',
  'accuracy',
  'generator',
  'game_mode',
  'passed',
  'reason',
  'journey_stage_id',
  'journey_id',
  'play_context',
  'by_modality',
  'adaptive_path_progress_pct',
  'active_modalities_csv',
  'flow_confidence_score',
  'flow_directness_ratio',
  'flow_wrong_slot_dwell_ms',
  'recall_confidence_score',
  'recall_fluency_score',
  'recall_corrections_count',
  'ups_score',
  'ups_accuracy',
  'ups_confidence',
  'avg_response_time_ms',
  'median_response_time_ms',
  'response_time_std_dev',
  'avg_press_duration_ms',
  'press_duration_std_dev',
  'responses_during_stimulus',
  'responses_after_stimulus',
  'focus_lost_count',
  'focus_lost_total_ms',
  'xp_breakdown',
  'worst_modality_error_rate',
  'journey_context',
  'input_methods',
  'absolute_score',
] as const;

const DEFAULT_ACTIVE_MODALITIES_CSV = 'audio,position';

function buildActiveModalitiesCsv(byModality: Record<string, unknown> | undefined): string {
  if (!byModality) return DEFAULT_ACTIVE_MODALITIES_CSV;
  const keys = Object.keys(byModality)
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .sort();
  return keys.length > 0 ? keys.join(',') : DEFAULT_ACTIVE_MODALITIES_CSV;
}

export function sessionSummaryInsertValues(summary: SessionSummaryInput): unknown[] {
  const byModalityJson = JSON.stringify(summary.byModality ?? {});
  const activeModalitiesCsv = buildActiveModalitiesCsv(summary.byModality);
  const xpBreakdownJson = summary.xpBreakdown ? JSON.stringify(summary.xpBreakdown) : null;
  const journeyContextJson = summary.journeyContext ? JSON.stringify(summary.journeyContext) : null;

  return [
    summary.sessionId, // id
    summary.sessionId, // session_id
    summary.userId ?? 'local',
    summary.sessionType,
    summary.createdAt.toISOString(),
    summary.createdAt.toISOString().substring(0, 10),
    summary.nLevel,
    summary.durationMs,
    summary.trialsCount,
    summary.totalHits ?? 0,
    summary.totalMisses ?? 0,
    summary.totalFa ?? 0,
    summary.totalCr ?? 0,
    summary.globalDPrime ?? null,
    summary.accuracy ?? null,
    summary.generator ?? null,
    summary.gameMode ?? null,
    summary.passed === true ? 1 : summary.passed === false ? 0 : null,
    summary.reason ?? 'completed',
    summary.journeyStageId ?? null,
    summary.journeyId ?? null,
    summary.playContext ?? null,
    byModalityJson,
    summary.adaptivePathProgressPct ?? null,
    activeModalitiesCsv,
    summary.flowConfidenceScore ?? null,
    summary.flowDirectnessRatio ?? null,
    summary.flowWrongSlotDwellMs ?? null,
    summary.recallConfidenceScore ?? null,
    summary.recallFluencyScore ?? null,
    summary.recallCorrectionsCount ?? null,
    summary.upsScore ?? null,
    summary.upsAccuracy ?? null,
    summary.upsConfidence ?? null,
    summary.avgResponseTimeMs ?? null,
    summary.medianResponseTimeMs ?? null,
    summary.responseTimeStdDev ?? null,
    summary.avgPressDurationMs ?? null,
    summary.pressDurationStdDev ?? null,
    summary.responsesDuringStimulus ?? 0,
    summary.responsesAfterStimulus ?? 0,
    summary.focusLostCount ?? 0,
    summary.focusLostTotalMs ?? 0,
    xpBreakdownJson,
    summary.worstModalityErrorRate ?? null,
    journeyContextJson,
    summary.inputMethods ?? null,
    summary.absoluteScore ?? null,
  ];
}
