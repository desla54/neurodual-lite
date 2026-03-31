import type { JourneyStageDefinition, JourneyState } from '../../types/journey';
import type { JourneyContext, SessionEndReportModel } from '../../types/session-report';

interface BuildCurrentJourneyGuidanceContextInput {
  readonly report: SessionEndReportModel;
  readonly reportJourneyGameMode?: string;
  readonly reportRecommendedStageId: number | null;
  readonly reportRecommendedModeId: string | null;
  readonly currentJourneyState: JourneyState;
  readonly currentJourneyStageDef: JourneyStageDefinition | null;
  readonly currentJourneyStageId: number | null;
  readonly currentJourneyModeId: string | null;
}

export function buildCurrentJourneyGuidanceContext(
  input: BuildCurrentJourneyGuidanceContextInput,
): JourneyContext | null {
  const {
    report,
    reportJourneyGameMode,
    reportRecommendedStageId,
    reportRecommendedModeId,
    currentJourneyState,
    currentJourneyStageDef,
    currentJourneyStageId,
    currentJourneyModeId,
  } = input;

  const existingJourneyContext = report.journeyContext;
  const currentJourneyStageProgress =
    currentJourneyStageId !== null
      ? (currentJourneyState.stages.find((stage) => stage.stageId === currentJourneyStageId) ??
        null)
      : null;
  const resolvedCurrentJourneyModeId =
    currentJourneyModeId ??
    (reportJourneyGameMode === 'dual-track-dnb-hybrid'
      ? currentJourneyStageProgress?.hybridProgress?.loopPhase === 'dnb'
        ? 'dualnback-classic'
        : 'dual-track'
      : null);
  const isOutdatedJourneyReport =
    reportJourneyGameMode === existingJourneyContext?.journeyGameMode &&
    currentJourneyStageId !== null &&
    reportRecommendedStageId !== null &&
    currentJourneyStageId !== reportRecommendedStageId;
  const isMismatchedJourneyRecommendation =
    reportJourneyGameMode === existingJourneyContext?.journeyGameMode &&
    reportJourneyGameMode !== undefined &&
    currentJourneyStageId !== null &&
    (currentJourneyStageId !== reportRecommendedStageId ||
      (resolvedCurrentJourneyModeId !== null &&
        resolvedCurrentJourneyModeId !== reportRecommendedModeId));

  if (
    !currentJourneyStageDef ||
    currentJourneyStageId === null ||
    (!isOutdatedJourneyReport && !isMismatchedJourneyRecommendation)
  ) {
    return null;
  }

  return {
    ...(existingJourneyContext ?? {
      journeyName: 'Parcours',
      journeyNameShort: undefined,
      journeyGameMode: reportJourneyGameMode,
      upsThreshold: 50,
      isValidating: false,
      validatingSessions: 0,
      sessionsRequired: 1,
      stageCompleted: false,
      nextStageUnlocked: null,
    }),
    journeyId: report.journeyId ?? existingJourneyContext?.journeyId ?? '',
    stageId:
      currentJourneyState.currentStage > currentJourneyState.stages.length
        ? Math.max(1, currentJourneyState.stages.length)
        : currentJourneyState.currentStage,
    stageMode: currentJourneyStageDef.mode,
    nLevel: currentJourneyStageDef.nLevel,
    journeyGameMode: reportJourneyGameMode,
    journeyProtocol:
      reportJourneyGameMode === 'dual-track-dnb-hybrid'
        ? 'hybrid-jaeggi'
        : existingJourneyContext?.journeyProtocol,
    sessionRole:
      reportJourneyGameMode === 'dual-track-dnb-hybrid'
        ? currentJourneyStageProgress?.hybridProgress?.loopPhase === 'dnb' &&
          (currentJourneyStageProgress.hybridProgress.dnbSessionsCompleted ?? 0) === 0
          ? 'track-half'
          : 'decision-half'
        : existingJourneyContext?.sessionRole,
    journeyNameShort:
      reportJourneyGameMode === 'dual-track-dnb-hybrid'
        ? (existingJourneyContext?.journeyNameShort ?? 'Hybride DNB + Track')
        : existingJourneyContext?.journeyNameShort,
    validatingSessions:
      currentJourneyStageProgress?.validatingSessions ??
      existingJourneyContext?.validatingSessions ??
      0,
    bestScore: currentJourneyStageProgress?.bestScore ?? existingJourneyContext?.bestScore,
    progressPct: currentJourneyStageProgress?.progressPct ?? existingJourneyContext?.progressPct,
    hybridProgress: currentJourneyStageProgress?.hybridProgress,
    nextPlayableStage:
      currentJourneyState.currentStage > currentJourneyState.stages.length
        ? null
        : currentJourneyState.currentStage,
    nextSessionGameMode:
      currentJourneyState.currentStage > currentJourneyState.stages.length
        ? undefined
        : (resolvedCurrentJourneyModeId ?? undefined),
    stageCompleted:
      reportRecommendedStageId !== null && currentJourneyStageId > reportRecommendedStageId,
    nextStageUnlocked:
      reportRecommendedStageId !== null &&
      currentJourneyStageId > reportRecommendedStageId &&
      currentJourneyState.currentStage <= currentJourneyState.stages.length
        ? currentJourneyStageId
        : null,
    journeyDecision: (() => {
      if (reportRecommendedStageId === null) return undefined;
      if (currentJourneyStageId > reportRecommendedStageId) return 'up' as const;
      if (currentJourneyStageId < reportRecommendedStageId) return 'down' as const;
      return resolvedCurrentJourneyModeId === 'dualnback-classic'
        ? ('pending-pair' as const)
        : ('stay' as const);
    })(),
    guidanceSource: 'current-state',
  };
}
