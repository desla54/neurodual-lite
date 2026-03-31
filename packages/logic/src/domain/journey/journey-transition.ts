import type { AttemptResult } from '../../ports/journey-port';
import type { JourneyMeta } from '../../types/journey';
import type { JourneyContext } from '../../types/session-report';
import {
  JOURNEY_MIN_PASSING_SCORE,
  getSessionsRequired,
  getStageDefinition,
  isSimulatorMode,
} from './constants';

export interface JourneyTransitionRecord {
  readonly journeyId: string;
  readonly journeyStartLevel: number;
  readonly journeyTargetLevel: number;
  readonly journeyGameMode?: string;
  readonly journeyStrategyConfig?: JourneyMeta['strategyConfig'];
  readonly stageId: number;
  readonly stageMode: JourneyContext['stageMode'];
  readonly nLevel: number;
  readonly journeyName: string;
  readonly journeyNameShort?: string;
  readonly upsThreshold: number;
  readonly isValidating: boolean;
  readonly validatingSessions: number;
  readonly sessionsRequired: number;
  readonly progressPct?: number;
  readonly bestScore?: number | null;
  readonly stageCompleted: boolean;
  readonly nextStageUnlocked: number | null;
  readonly nextPlayableStage?: number | null;
  readonly nextSessionGameMode?: string;
  readonly consecutiveStrikes?: number;
  readonly suggestedStartLevel?: number;
  readonly journeyProtocol?: JourneyContext['journeyProtocol'];
  readonly sessionRole?: JourneyContext['sessionRole'];
  readonly journeyDecision?: JourneyContext['journeyDecision'];
  readonly guidanceSource?: JourneyContext['guidanceSource'];
  readonly hybridProgress?: JourneyContext['hybridProgress'];
}

function deriveJourneyProtocol(gameMode: string | undefined) {
  if (gameMode === 'dual-track-dnb-hybrid') return 'hybrid-jaeggi' as const;
  if (gameMode === 'dualnback-classic') return 'jaeggi' as const;
  if (gameMode === 'sim-brainworkshop') return 'brainworkshop' as const;
  if (gameMode === 'dual-track') return 'dual-track-mastery' as const;
  return 'standard' as const;
}

function deriveJourneyShortName(
  gameMode: string | undefined,
  journeyName: string | undefined,
): string {
  if (gameMode === 'dual-track-dnb-hybrid') return 'Hybride DNB + Track';
  return journeyName ?? 'Parcours';
}

/**
 * Build a flat, persistable JourneyTransitionRecord directly from
 * AttemptResult + JourneyMeta + stage definition.
 *
 * This replaces the former indirection through `buildJourneyContext()`.
 */
export function buildJourneyTransitionRecord(input: {
  readonly stageId: number;
  readonly journeyMeta: JourneyMeta;
  readonly attempt: AttemptResult;
}): JourneyTransitionRecord | null {
  const { stageId, journeyMeta, attempt } = input;
  const { startLevel, targetLevel, gameMode, journeyName } = journeyMeta;

  const isSimulator = isSimulatorMode(gameMode);
  const stageDef = getStageDefinition(stageId, targetLevel, startLevel, isSimulator);
  if (!stageDef) return null;

  const progressPct =
    typeof attempt.progressPct === 'number' && Number.isFinite(attempt.progressPct)
      ? Math.max(0, Math.min(100, attempt.progressPct))
      : null;

  const sessionsRequiredFromScore =
    progressPct === null ? getSessionsRequired(attempt.score) : null;
  const sessionsRequired =
    progressPct !== null
      ? 100
      : sessionsRequiredFromScore &&
          Number.isFinite(sessionsRequiredFromScore) &&
          sessionsRequiredFromScore > 0
        ? sessionsRequiredFromScore
        : Math.max(1, Math.round(attempt.totalValidatingSessions + attempt.sessionsRemaining));

  return {
    journeyId: journeyMeta.journeyId,
    journeyStartLevel: journeyMeta.startLevel,
    journeyTargetLevel: journeyMeta.targetLevel,
    journeyGameMode: gameMode,
    journeyStrategyConfig: journeyMeta.strategyConfig,
    stageId,
    stageMode: stageDef.mode,
    nLevel: stageDef.nLevel,
    journeyName: journeyName ?? 'Parcours',
    journeyNameShort: attempt.journeyNameShort ?? deriveJourneyShortName(gameMode, journeyName),
    upsThreshold: JOURNEY_MIN_PASSING_SCORE,
    isValidating: attempt.isValidating,
    validatingSessions:
      progressPct !== null ? Math.round(progressPct) : attempt.totalValidatingSessions,
    sessionsRequired,
    progressPct: progressPct ?? undefined,
    bestScore: attempt.bestScore,
    stageCompleted: attempt.stageCompleted,
    nextStageUnlocked: attempt.nextStageUnlocked,
    nextPlayableStage: attempt.nextPlayableStage,
    nextSessionGameMode: attempt.nextSessionGameMode,
    consecutiveStrikes: attempt.consecutiveStrikes,
    suggestedStartLevel: attempt.suggestedStartLevel,
    journeyProtocol: attempt.journeyProtocol ?? deriveJourneyProtocol(gameMode),
    sessionRole: attempt.sessionRole ?? 'single-session',
    journeyDecision: attempt.journeyDecision,
    guidanceSource: 'historical-session',
    hybridProgress: attempt.hybridProgress,
  };
}

export function journeyTransitionRecordToContext(record: JourneyTransitionRecord): JourneyContext {
  return {
    journeyId: record.journeyId,
    stageId: record.stageId,
    stageMode: record.stageMode,
    nLevel: record.nLevel,
    journeyName: record.journeyName,
    journeyGameMode: record.journeyGameMode,
    upsThreshold: record.upsThreshold,
    isValidating: record.isValidating,
    validatingSessions: record.validatingSessions,
    sessionsRequired: record.sessionsRequired,
    progressPct: record.progressPct,
    bestScore: record.bestScore,
    stageCompleted: record.stageCompleted,
    nextStageUnlocked: record.nextStageUnlocked,
    nextPlayableStage: record.nextPlayableStage,
    nextSessionGameMode: record.nextSessionGameMode,
    consecutiveStrikes: record.consecutiveStrikes,
    suggestedStartLevel: record.suggestedStartLevel,
    journeyProtocol: record.journeyProtocol,
    sessionRole: record.sessionRole,
    journeyDecision: record.journeyDecision,
    journeyNameShort: record.journeyNameShort,
    guidanceSource: record.guidanceSource,
    hybridProgress: record.hybridProgress,
  };
}
