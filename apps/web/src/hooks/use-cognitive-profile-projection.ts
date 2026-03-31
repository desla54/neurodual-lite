import {
  type CalibrationState,
  type ModalityCalibrationState,
  DEFAULT_CALIBRATION_STATE,
  type NextTrainingSession,
  pickNextTrainingSession,
} from '@neurodual/logic';
import { usePowerSyncWatch } from './use-powersync-watch';

export type CalibrationEvidenceSource = 'none' | 'baseline' | 'session';

export interface CognitiveProfileStepEvidence {
  readonly baselineLevel: number | null;
  readonly source: CalibrationEvidenceSource;
}

interface CognitiveProfileProjectionRow {
  phase: string | null;
  current_step_index: number | null;
  results_json: string | null;
  recent_step_keys_json: string | null;
  baseline_level: number | null;
  modality_sources_json: string | null;
  next_recommended_session_json: string | null;
  global_score: number | null;
  strongest_modality: string | null;
  weakest_modality: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface CognitiveProfileProjectionView {
  readonly calibrationState: CalibrationState;
  readonly recentStepKeys: string[];
  readonly baselineLevel: number | null;
  readonly modalitySources: Record<string, CognitiveProfileStepEvidence>;
  readonly nextRecommendedSession: NextTrainingSession | null;
  readonly globalScore: number;
  readonly strongestModality: string | null;
  readonly weakestModality: string | null;
  readonly updatedAt: string | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

function parseResultsJson(value: string | null): Record<string, ModalityCalibrationState> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, ModalityCalibrationState>;
  } catch {
    return {};
  }
}

function parseStringArrayJson(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function parseStepEvidenceJson(value: string | null): Record<string, CognitiveProfileStepEvidence> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed).flatMap(([key, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      const source = candidate['source'];
      const baselineLevel = candidate['baselineLevel'];
      if (source !== 'none' && source !== 'baseline' && source !== 'session') {
        return [];
      }

      return [
        [
          key,
          {
            source,
            baselineLevel: typeof baselineLevel === 'number' ? baselineLevel : null,
          } satisfies CognitiveProfileStepEvidence,
        ] as const,
      ];
    });

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function parseNextRecommendedSessionJson(value: string | null): NextTrainingSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const modality = candidate['modality'];
    const gameMode = candidate['gameMode'];
    const level = candidate['level'];
    const interval = candidate['interval'];
    const overdueRatio = candidate['overdueRatio'];
    const reason = candidate['reason'];

    if (
      typeof modality !== 'string' ||
      typeof gameMode !== 'string' ||
      typeof level !== 'number' ||
      typeof interval !== 'number' ||
      typeof overdueRatio !== 'number' ||
      (reason !== 'weakest' &&
        reason !== 'catch-up' &&
        reason !== 'maintain' &&
        reason !== 'master' &&
        reason !== 'training')
    ) {
      return null;
    }

    return {
      modality,
      gameMode,
      level,
      interval,
      overdueRatio,
      reason,
    } as NextTrainingSession;
  } catch {
    return null;
  }
}

export function useCognitiveProfileProjection(userId: string): CognitiveProfileProjectionView {
  const query = usePowerSyncWatch<CognitiveProfileProjectionRow>(
    `SELECT phase, current_step_index, results_json, recent_step_keys_json, baseline_level,
            modality_sources_json, next_recommended_session_json, global_score,
            strongest_modality, weakest_modality, started_at, completed_at, updated_at
     FROM cognitive_profile_projection
     WHERE user_id IN (?, 'local')
     LIMIT 1`,
    [userId],
  );

  const row = query.data[0] ?? null;
  const results = parseResultsJson(row?.results_json ?? null);
  const recentStepKeys = parseStringArrayJson(row?.recent_step_keys_json ?? null);
  const nextRecommendedSession =
    parseNextRecommendedSessionJson(row?.next_recommended_session_json ?? null) ??
    pickNextTrainingSession(results, recentStepKeys);

  return {
    calibrationState: {
      phase: (row?.phase as CalibrationState['phase'] | null) ?? DEFAULT_CALIBRATION_STATE.phase,
      currentStepIndex: row?.current_step_index ?? DEFAULT_CALIBRATION_STATE.currentStepIndex,
      results,
      startedAt: row?.started_at ? new Date(row.started_at).getTime() : null,
      completedAt: row?.completed_at ? new Date(row.completed_at).getTime() : null,
    },
    recentStepKeys,
    baselineLevel: row?.baseline_level ?? null,
    modalitySources: parseStepEvidenceJson(row?.modality_sources_json ?? null),
    nextRecommendedSession,
    globalScore: row?.global_score ?? 0,
    strongestModality: row?.strongest_modality ?? null,
    weakestModality: row?.weakest_modality ?? null,
    updatedAt: row?.updated_at ?? null,
    isLoading: query.isPending,
    error: query.error,
  };
}
