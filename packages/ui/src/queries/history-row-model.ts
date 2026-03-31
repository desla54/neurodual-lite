import { z } from 'zod';
import type {
  HistoryModalityStats,
  SessionEndReason,
  SessionHistoryItem,
  SessionSummaryRow as SessionSummaryRowPort,
} from '@neurodual/logic';
import { computeUnifiedMetrics, normalizeModeId } from '@neurodual/logic';

export interface SessionSummaryRowDb {
  id: string;
  session_id: string;
  user_id: string | null;
  session_type: string | null;
  created_at: string | null;
  n_level: number;
  duration_ms: number;
  trials_count: number;
  total_hits: number | null;
  total_misses: number | null;
  total_fa: number | null;
  total_cr: number | null;
  global_d_prime: number | null;
  accuracy: number | null;
  generator: string | null;
  game_mode: string | null;
  passed: number | null;
  reason: string | null;
  journey_stage_id: string | null;
  journey_id: string | null;
  by_modality: string | null;
  flow_confidence_score: number | null;
  flow_directness_ratio: number | null;
  flow_wrong_slot_dwell_ms: number | null;
  recall_confidence_score: number | null;
  recall_fluency_score: number | null;
  recall_corrections_count: number | null;
  ups_score: number | null;
  ups_accuracy: number | null;
  ups_confidence: number | null;
  avg_response_time_ms: number | null;
  median_response_time_ms: number | null;
  response_time_std_dev: number | null;
  avg_press_duration_ms: number | null;
  press_duration_std_dev: number | null;
  responses_during_stimulus: number | null;
  responses_after_stimulus: number | null;
  focus_lost_count: number | null;
  focus_lost_total_ms: number | null;
  xp_breakdown: string | null;
  worst_modality_error_rate?: number | null;
  journey_context: string | null;
  input_methods: string | null;
  play_context: 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' | null;
}

export interface SessionSummaryListRowDb {
  session_id: string;
  created_at: string | null;
  n_level: number;
  duration_ms: number;
  trials_count: number;
  total_hits: number | null;
  total_misses: number | null;
  total_fa: number | null;
  total_cr: number | null;
  global_d_prime: number | null;
  accuracy: number | null;
  generator: string | null;
  game_mode: string | null;
  passed: number | null;
  reason: string | null;
  journey_stage_id: string | null;
  journey_id: string | null;
  ups_score: number | null;
  ups_accuracy: number | null;
  ups_confidence: number | null;
  avg_response_time_ms: number | null;
  median_response_time_ms: number | null;
  response_time_std_dev: number | null;
  avg_press_duration_ms: number | null;
  press_duration_std_dev: number | null;
  responses_during_stimulus: number | null;
  responses_after_stimulus: number | null;
  focus_lost_count: number | null;
  focus_lost_total_ms: number | null;
  by_modality?: string | null;
  active_modalities_csv?: string | null;
  play_context?: 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' | null;
}

export interface LatestJourneySessionRowDb {
  session_id: string;
  created_at: string | null;
  n_level: number | null;
}

const PlayContextSchema = z
  .enum(['journey', 'free', 'synergy', 'calibration', 'profile'])
  .nullable();

const SessionSummaryListRowSchema: z.ZodType<SessionSummaryListRowDb> = z.object({
  session_id: z.string(),
  created_at: z.string().nullable(),
  n_level: z.number(),
  duration_ms: z.number(),
  trials_count: z.number(),
  total_hits: z.number().nullable(),
  total_misses: z.number().nullable(),
  total_fa: z.number().nullable(),
  total_cr: z.number().nullable(),
  global_d_prime: z.number().nullable(),
  accuracy: z.number().nullable(),
  generator: z.string().nullable(),
  game_mode: z.string().nullable(),
  passed: z.number().nullable(),
  reason: z.string().nullable(),
  journey_stage_id: z.string().nullable(),
  journey_id: z.string().nullable(),
  ups_score: z.number().nullable(),
  ups_accuracy: z.number().nullable(),
  ups_confidence: z.number().nullable(),
  avg_response_time_ms: z.number().nullable(),
  median_response_time_ms: z.number().nullable(),
  response_time_std_dev: z.number().nullable(),
  avg_press_duration_ms: z.number().nullable(),
  press_duration_std_dev: z.number().nullable(),
  responses_during_stimulus: z.number().nullable(),
  responses_after_stimulus: z.number().nullable(),
  focus_lost_count: z.number().nullable(),
  focus_lost_total_ms: z.number().nullable(),
  by_modality: z.string().nullable().optional(),
  active_modalities_csv: z.string().nullable().optional(),
  play_context: PlayContextSchema,
});

export const SessionSummaryDetailsRowSchema: z.ZodType<SessionSummaryRowDb> = z.object({
  id: z.string(),
  session_id: z.string(),
  user_id: z.string().nullable(),
  session_type: z.string().nullable(),
  created_at: z.string().nullable(),
  n_level: z.number(),
  duration_ms: z.number(),
  trials_count: z.number(),
  total_hits: z.number().nullable(),
  total_misses: z.number().nullable(),
  total_fa: z.number().nullable(),
  total_cr: z.number().nullable(),
  global_d_prime: z.number().nullable(),
  accuracy: z.number().nullable(),
  generator: z.string().nullable(),
  game_mode: z.string().nullable(),
  passed: z.number().nullable(),
  reason: z.string().nullable(),
  journey_stage_id: z.string().nullable(),
  journey_id: z.string().nullable(),
  by_modality: z.string().nullable(),
  flow_confidence_score: z.number().nullable(),
  flow_directness_ratio: z.number().nullable(),
  flow_wrong_slot_dwell_ms: z.number().nullable(),
  recall_confidence_score: z.number().nullable(),
  recall_fluency_score: z.number().nullable(),
  recall_corrections_count: z.number().nullable(),
  ups_score: z.number().nullable(),
  ups_accuracy: z.number().nullable(),
  ups_confidence: z.number().nullable(),
  avg_response_time_ms: z.number().nullable(),
  median_response_time_ms: z.number().nullable(),
  response_time_std_dev: z.number().nullable(),
  avg_press_duration_ms: z.number().nullable(),
  press_duration_std_dev: z.number().nullable(),
  responses_during_stimulus: z.number().nullable(),
  responses_after_stimulus: z.number().nullable(),
  focus_lost_count: z.number().nullable(),
  focus_lost_total_ms: z.number().nullable(),
  xp_breakdown: z.string().nullable(),
  journey_context: z.string().nullable(),
  input_methods: z.string().nullable(),
  worst_modality_error_rate: z.number().nullable().optional(),
  play_context: PlayContextSchema,
});

export const LatestJourneySessionRowSchema: z.ZodType<LatestJourneySessionRowDb> = z.object({
  session_id: z.string(),
  created_at: z.string().nullable(),
  n_level: z.number().nullable(),
});

export function filterValidRows<T>(
  rows: readonly unknown[] | undefined,
  schema: z.ZodType<T>,
  source: string,
): T[] {
  if (!rows || rows.length === 0) return [];
  if (!import.meta.env.DEV) {
    const objectRows = rows.filter((row): row is T => row != null && typeof row === 'object');
    if (objectRows.length === 0) return objectRows;

    const sampleIndex = Math.min(objectRows.length - 1, Math.floor(objectRows.length / 2));
    const sampled = schema.safeParse(objectRows[sampleIndex]);
    if (!sampled.success) {
      const issue = sampled.error.issues[0];
      const path = issue?.path?.join('.') || '<root>';
      console.warn(
        `[history] Sampled schema mismatch in ${source} (${path}) at index ${sampleIndex}:`,
        issue?.message,
      );
    }

    return objectRows;
  }
  const out: T[] = [];
  let dropped = 0;
  const maxWarnings = 5;
  for (let index = 0; index < rows.length; index++) {
    const parsed = schema.safeParse(rows[index]);
    if (parsed.success) {
      out.push(parsed.data);
      continue;
    }
    dropped++;
    const issue = parsed.error.issues[0];
    if (dropped <= maxWarnings) {
      const path = issue?.path?.join('.') || '<root>';
      console.warn(
        `[history] Dropped invalid row from ${source} at index ${index} (${path}):`,
        issue?.message,
      );
    }
  }
  if (dropped > maxWarnings) {
    console.warn(
      `[history] Dropped ${dropped} invalid rows from ${source} (showing first ${maxWarnings})`,
    );
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickFirst(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return toFiniteNumberOrNull(value) ?? fallback;
}

function normalizeSqlDateString(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const date = new Date(numeric);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
}

export function parseSqlDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = normalizeSqlDateString(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

export function parseSqlDateToMs(value: unknown): number | null {
  return parseSqlDate(value)?.getTime() ?? null;
}

export function resolvePlayContext(
  value: unknown,
  row?: { journey_stage_id?: string | null; journey_id?: string | null },
): SessionHistoryItem['playContext'] {
  if (
    value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
  ) {
    return value;
  }
  if (row?.journey_stage_id || row?.journey_id) return 'journey';
  return 'free';
}

function toNullablePlayContext(
  value: unknown,
): 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' | null {
  return value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
    ? value
    : null;
}

function normalizeSessionSummaryListRow(row: unknown): SessionSummaryListRowDb | null {
  const record = asRecord(row);
  if (!record) return null;

  const sessionId = toNullableString(pickFirst(record, ['session_id', 'sessionId', 'id']));
  if (!sessionId) return null;

  const passedRaw = pickFirst(record, ['passed']);
  const passed =
    typeof passedRaw === 'boolean' ? (passedRaw ? 1 : 0) : toFiniteNumberOrNull(passedRaw);

  return {
    session_id: sessionId,
    created_at: toNullableString(pickFirst(record, ['created_at', 'createdAt'])),
    n_level: toFiniteNumber(pickFirst(record, ['n_level', 'nLevel']), 1),
    duration_ms: toFiniteNumber(pickFirst(record, ['duration_ms', 'durationMs']), 0),
    trials_count: toFiniteNumber(pickFirst(record, ['trials_count', 'trialsCount']), 0),
    total_hits: toFiniteNumberOrNull(pickFirst(record, ['total_hits', 'totalHits'])),
    total_misses: toFiniteNumberOrNull(pickFirst(record, ['total_misses', 'totalMisses'])),
    total_fa: toFiniteNumberOrNull(pickFirst(record, ['total_fa', 'totalFa'])),
    total_cr: toFiniteNumberOrNull(pickFirst(record, ['total_cr', 'totalCr'])),
    global_d_prime: toFiniteNumberOrNull(pickFirst(record, ['global_d_prime', 'globalDPrime'])),
    accuracy: toFiniteNumberOrNull(pickFirst(record, ['accuracy'])),
    generator: toNullableString(pickFirst(record, ['generator'])),
    game_mode: toNullableString(pickFirst(record, ['game_mode', 'gameMode'])),
    passed,
    reason: toNullableString(pickFirst(record, ['reason'])),
    journey_stage_id: toNullableString(
      pickFirst(record, ['journey_stage_id', 'journeyStageId', 'journey_stage']),
    ),
    journey_id: toNullableString(pickFirst(record, ['journey_id', 'journeyId'])),
    ups_score: toFiniteNumberOrNull(pickFirst(record, ['ups_score', 'upsScore'])),
    ups_accuracy: toFiniteNumberOrNull(pickFirst(record, ['ups_accuracy', 'upsAccuracy'])),
    ups_confidence: toFiniteNumberOrNull(pickFirst(record, ['ups_confidence', 'upsConfidence'])),
    avg_response_time_ms: toFiniteNumberOrNull(
      pickFirst(record, ['avg_response_time_ms', 'avgResponseTimeMs']),
    ),
    median_response_time_ms: toFiniteNumberOrNull(
      pickFirst(record, ['median_response_time_ms', 'medianResponseTimeMs']),
    ),
    response_time_std_dev: toFiniteNumberOrNull(
      pickFirst(record, ['response_time_std_dev', 'responseTimeStdDev']),
    ),
    avg_press_duration_ms: toFiniteNumberOrNull(
      pickFirst(record, ['avg_press_duration_ms', 'avgPressDurationMs']),
    ),
    press_duration_std_dev: toFiniteNumberOrNull(
      pickFirst(record, ['press_duration_std_dev', 'pressDurationStdDev']),
    ),
    responses_during_stimulus: toFiniteNumberOrNull(
      pickFirst(record, ['responses_during_stimulus', 'responsesDuringStimulus']),
    ),
    responses_after_stimulus: toFiniteNumberOrNull(
      pickFirst(record, ['responses_after_stimulus', 'responsesAfterStimulus']),
    ),
    focus_lost_count: toFiniteNumberOrNull(
      pickFirst(record, ['focus_lost_count', 'focusLostCount']),
    ),
    focus_lost_total_ms: toFiniteNumberOrNull(
      pickFirst(record, ['focus_lost_total_ms', 'focusLostTotalMs']),
    ),
    by_modality: toNullableString(pickFirst(record, ['by_modality', 'byModality'])),
    active_modalities_csv: toNullableString(
      pickFirst(record, ['active_modalities_csv', 'activeModalitiesCsv']),
    ),
    play_context: toNullablePlayContext(pickFirst(record, ['play_context', 'playContext'])),
  };
}

export function normalizeSessionSummaryListRows(
  rows: readonly unknown[] | undefined,
  source: string,
): SessionSummaryListRowDb[] {
  if (!rows || rows.length === 0) return [];

  if (!import.meta.env.DEV) {
    return rows
      .map((row) => normalizeSessionSummaryListRow(row))
      .filter((row): row is SessionSummaryListRowDb => row != null);
  }

  const out: SessionSummaryListRowDb[] = [];
  let repaired = 0;
  let dropped = 0;
  const maxWarnings = 5;

  for (let index = 0; index < rows.length; index++) {
    const parsed = SessionSummaryListRowSchema.safeParse(rows[index]);
    if (parsed.success) {
      out.push(parsed.data);
      continue;
    }

    const normalized = normalizeSessionSummaryListRow(rows[index]);
    if (normalized) {
      repaired++;
      out.push(normalized);
      const issue = parsed.error.issues[0];
      if (repaired <= maxWarnings) {
        const path = issue?.path?.join('.') || '<root>';
        console.warn(
          `[history] Repaired malformed row from ${source} at index ${index} (${path}):`,
          issue?.message,
        );
      }
      continue;
    }

    dropped++;
    const issue = parsed.error.issues[0];
    if (dropped <= maxWarnings) {
      const path = issue?.path?.join('.') || '<root>';
      console.warn(
        `[history] Dropped unrecoverable row from ${source} at index ${index} (${path}):`,
        issue?.message,
      );
    }
  }

  if (repaired > maxWarnings) {
    console.warn(
      `[history] Repaired ${repaired} malformed rows from ${source} (showing first ${maxWarnings})`,
    );
  }
  if (dropped > maxWarnings) {
    console.warn(
      `[history] Dropped ${dropped} unrecoverable rows from ${source} (showing first ${maxWarnings})`,
    );
  }

  return out;
}

function safeParseRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function safeParseNullableRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseHistoryModalityStats(
  value: string | null | undefined,
): Record<string, HistoryModalityStats> {
  const parsed = safeParseRecord(value ?? null);
  const byModality: Record<string, HistoryModalityStats> = {};

  for (const [key, raw] of Object.entries(parsed)) {
    const stats = raw as Record<string, unknown>;
    byModality[key] = {
      hits: toFiniteNumber(stats['hits'], 0),
      misses: toFiniteNumber(stats['misses'], 0),
      falseAlarms: toFiniteNumber(stats['falseAlarms'], 0),
      correctRejections: toFiniteNumber(stats['correctRejections'], 0),
      avgRT: toFiniteNumber(stats['avgRT'], 0),
      dPrime: toFiniteNumber(stats['dPrime'], 0),
    };
  }

  return byModality;
}

export function parseSessionXpBreakdown(
  value: string | null | undefined,
): SessionHistoryItem['xpBreakdown'] {
  const parsed = safeParseNullableRecord(value ?? null);
  return parsed ? (parsed as unknown as SessionHistoryItem['xpBreakdown']) : undefined;
}

export function parseSessionJourneyContext(
  value: string | null | undefined,
): SessionHistoryItem['journeyContext'] {
  const parsed = safeParseNullableRecord(value ?? null);
  return parsed ? (parsed as unknown as SessionHistoryItem['journeyContext']) : undefined;
}

export function parseConsecutiveStrikesFromJourneyContext(
  value: string | null | undefined,
  maxValue: number,
): number | null {
  const parsed = safeParseNullableRecord(value ?? null);
  const strikes = parsed?.['consecutiveStrikes'];
  if (typeof strikes !== 'number' || !Number.isFinite(strikes)) return null;
  const normalized = Math.trunc(strikes);
  if (normalized < 0 || normalized > maxValue) return null;
  return normalized;
}

export function dbRowToSessionSummaryRow(row: SessionSummaryRowDb): SessionSummaryRowPort {
  return {
    session_id: row.session_id,
    user_id: row.user_id,
    session_type: row.session_type ?? 'tempo',
    created_at: row.created_at ?? new Date().toISOString(),
    n_level: row.n_level,
    duration_ms: row.duration_ms,
    trials_count: row.trials_count,
    total_hits: row.total_hits ?? null,
    total_misses: row.total_misses ?? null,
    total_fa: row.total_fa ?? null,
    total_cr: row.total_cr ?? null,
    global_d_prime: row.global_d_prime ?? null,
    accuracy: row.accuracy ?? null,
    generator: row.generator ?? null,
    game_mode: row.game_mode ?? null,
    passed: row.passed == null ? null : row.passed === 1,
    reason: row.reason ?? null,
    journey_stage_id: row.journey_stage_id ?? null,
    journey_id: row.journey_id ?? null,
    play_context: row.play_context ?? null,
    by_modality: safeParseRecord(row.by_modality),
    flow_confidence_score: row.flow_confidence_score ?? null,
    flow_directness_ratio: row.flow_directness_ratio ?? null,
    flow_wrong_slot_dwell_ms: row.flow_wrong_slot_dwell_ms ?? null,
    recall_confidence_score: row.recall_confidence_score ?? null,
    recall_fluency_score: row.recall_fluency_score ?? null,
    recall_corrections_count: row.recall_corrections_count ?? null,
    ups_score: row.ups_score ?? null,
    ups_accuracy: row.ups_accuracy ?? null,
    ups_confidence: row.ups_confidence ?? null,
    avg_response_time_ms: row.avg_response_time_ms ?? null,
    median_response_time_ms: row.median_response_time_ms ?? null,
    response_time_std_dev: row.response_time_std_dev ?? null,
    avg_press_duration_ms: row.avg_press_duration_ms ?? null,
    press_duration_std_dev: row.press_duration_std_dev ?? null,
    responses_during_stimulus: row.responses_during_stimulus ?? null,
    responses_after_stimulus: row.responses_after_stimulus ?? null,
    focus_lost_count: row.focus_lost_count ?? null,
    focus_lost_total_ms: row.focus_lost_total_ms ?? null,
    xp_breakdown: safeParseNullableRecord(row.xp_breakdown),
    worst_modality_error_rate: row.worst_modality_error_rate ?? null,
    journey_context: safeParseNullableRecord(row.journey_context),
    input_methods: row.input_methods ?? null,
  };
}

function parseActiveModalitiesCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseJourneyStageId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function rowToHistoryItem(row: SessionSummaryRowDb): SessionHistoryItem {
  const byModality = parseHistoryModalityStats(row.by_modality);

  const activeModalities = Object.keys(byModality);
  if (activeModalities.length === 0) {
    activeModalities.push('position', 'audio');
  }

  const accuracy =
    row.ups_accuracy != null
      ? row.ups_accuracy / 100
      : (row.accuracy ?? (row.global_d_prime ? row.global_d_prime / 3 : 0));
  const unifiedMetrics = computeUnifiedMetrics(accuracy, row.n_level);

  const createdAt = parseSqlDate(row.created_at) ?? new Date(0);

  const xpBreakdown = parseSessionXpBreakdown(row.xp_breakdown);
  const journeyContext = parseSessionJourneyContext(row.journey_context);

  const journeyStageId = parseJourneyStageId(row.journey_stage_id);
  const journeyId = row.journey_id ?? undefined;
  const playContext = resolvePlayContext(row.play_context, row);

  return {
    id: row.session_id,
    createdAt,
    nLevel: row.n_level,
    dPrime: row.global_d_prime ?? 0,
    passed: row.passed === 1,
    trialsCount: row.trials_count,
    durationMs: Number(row.duration_ms),
    byModality,
    generator: row.generator ?? 'BrainWorkshop',
    gameMode: row.game_mode ? normalizeModeId(row.game_mode) : undefined,
    activeModalities,
    reason: (row.reason as SessionEndReason) ?? 'completed',
    journeyStageId,
    journeyId,
    playContext,
    journeyContext,
    unifiedMetrics,
    upsScore: row.ups_score ?? undefined,
    upsAccuracy: row.ups_accuracy ?? undefined,
    upsConfidence: row.ups_confidence ?? undefined,
    flowConfidenceScore: row.flow_confidence_score ?? undefined,
    flowDirectnessRatio: row.flow_directness_ratio ?? undefined,
    flowWrongSlotDwellMs: row.flow_wrong_slot_dwell_ms ?? undefined,
    recallConfidenceScore: row.recall_confidence_score ?? undefined,
    recallFluencyScore: row.recall_fluency_score ?? undefined,
    recallCorrectionsCount: row.recall_corrections_count ?? undefined,
    xpBreakdown,
    avgResponseTimeMs: row.avg_response_time_ms ?? undefined,
    medianResponseTimeMs: row.median_response_time_ms ?? undefined,
    responseTimeStdDev: row.response_time_std_dev ?? undefined,
    avgPressDurationMs: row.avg_press_duration_ms ?? undefined,
    pressDurationStdDev: row.press_duration_std_dev ?? undefined,
    responsesDuringStimulus: row.responses_during_stimulus ?? undefined,
    responsesAfterStimulus: row.responses_after_stimulus ?? undefined,
    focusLostCount: row.focus_lost_count ?? undefined,
    focusLostTotalMs: row.focus_lost_total_ms ?? undefined,
  };
}

export function rowToHistoryItemLite(row: SessionSummaryListRowDb): SessionHistoryItem {
  const byModality = parseHistoryModalityStats(row.by_modality);
  const activeModalities = parseActiveModalitiesCsv(row.active_modalities_csv);
  if (activeModalities.length === 0) {
    activeModalities.push(...Object.keys(byModality));
  }
  if (activeModalities.length === 0) {
    activeModalities.push('position', 'audio');
  }

  const accuracy =
    row.ups_accuracy != null
      ? row.ups_accuracy / 100
      : (row.accuracy ?? (row.global_d_prime != null ? row.global_d_prime / 3 : 0));
  const unifiedMetrics = computeUnifiedMetrics(accuracy, row.n_level);

  const createdAt = parseSqlDate(row.created_at) ?? new Date(0);

  const journeyStageId = parseJourneyStageId(row.journey_stage_id);
  const journeyId = row.journey_id ?? undefined;
  const playContext = resolvePlayContext(row.play_context, row);

  return {
    id: row.session_id,
    createdAt,
    nLevel: row.n_level,
    dPrime: row.global_d_prime ?? 0,
    passed: row.passed === 1,
    trialsCount: row.trials_count,
    durationMs: Number(row.duration_ms),
    byModality,
    generator: row.generator ?? 'BrainWorkshop',
    gameMode: row.game_mode ? normalizeModeId(row.game_mode) : undefined,
    activeModalities,
    reason: (row.reason as SessionEndReason) ?? 'completed',
    journeyStageId,
    journeyId,
    playContext,
    unifiedMetrics,
    upsScore: row.ups_score ?? undefined,
    upsAccuracy: row.ups_accuracy ?? undefined,
    upsConfidence: row.ups_confidence ?? undefined,
    avgResponseTimeMs: row.avg_response_time_ms ?? undefined,
    medianResponseTimeMs: row.median_response_time_ms ?? undefined,
    responseTimeStdDev: row.response_time_std_dev ?? undefined,
    avgPressDurationMs: row.avg_press_duration_ms ?? undefined,
    pressDurationStdDev: row.press_duration_std_dev ?? undefined,
    responsesDuringStimulus: row.responses_during_stimulus ?? undefined,
    responsesAfterStimulus: row.responses_after_stimulus ?? undefined,
    focusLostCount: row.focus_lost_count ?? undefined,
    focusLostTotalMs: row.focus_lost_total_ms ?? undefined,
  };
}

export function historyLiteSignature(row: SessionSummaryListRowDb): string {
  return [
    row.session_id,
    row.created_at,
    row.n_level,
    row.duration_ms,
    row.trials_count,
    row.total_hits,
    row.total_misses,
    row.total_fa,
    row.total_cr,
    row.global_d_prime,
    row.accuracy,
    row.generator,
    row.game_mode,
    row.passed,
    row.reason,
    row.journey_stage_id,
    row.journey_id,
    row.play_context,
    row.active_modalities_csv,
    row.ups_score,
    row.ups_accuracy,
    row.ups_confidence,
    row.avg_response_time_ms,
    row.median_response_time_ms,
    row.response_time_std_dev,
    row.avg_press_duration_ms,
    row.press_duration_std_dev,
    row.responses_during_stimulus,
    row.responses_after_stimulus,
    row.focus_lost_count,
    row.focus_lost_total_ms,
  ].join('|');
}
