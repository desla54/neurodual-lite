/**
 * Journey Adapter
 *
 * Implements JourneyPort with per-journey isolation.
 * All methods take JourneyConfig as first parameter for multi-journey support.
 *
 * Reactivity is handled by PowerSync watched queries in the UI layer.
 * This adapter only provides imperative methods (mutations + synchronous lookups).
 */

import {
  decideJourneyAttempt,
  resolveHybridJourneyStrategyConfig,
  getStageDefinition,
  getTotalStagesForTarget,
  getAcceptedGameModesForJourney,
  isSimulatorMode,
  normalizeModeId,
  projectJourneyFromHistory,
  type AttemptResult,
  type HistoryPort,
  type JourneyConfig,
  type JourneyPort,
  type JourneyProjectionSession,
  type JourneyRecordableSession,
  type JourneyStageDefinition,
  type JourneyState,
} from '@neurodual/logic';

interface JourneyAdapterOptions {
  readonly getProjectedState?: (config: JourneyConfig) => Promise<JourneyState> | JourneyState;
}

/**
 * Wrapper around projectJourneyFromHistory with atomic expansion:
 * if suggestedStartLevel < startLevel, re-project with the lower startLevel
 * so that stages below the original startLevel are generated in one pass.
 */
function projectWithAutoExpansion(
  sessions: JourneyProjectionSession[],
  targetLevel: number,
  startLevel: number,
  journeyId: string,
  isSimulator: boolean,
  gameMode?: string,
  hybridOptions?: { trackSessionsPerBlock?: number; dnbSessionsPerBlock?: number },
): JourneyState {
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

  return state;
}

// =============================================================================
// Factory (Injection-based)
// =============================================================================

/**
 * Keep projection input aligned with UI Journey query semantics:
 * - only completed sessions contribute
 * - timestamps are normalized to number
 * - fields are explicitly mapped to satisfy JourneyProjectionSession
 */
function toJourneyProjectionSessions(
  sessions: Awaited<ReturnType<HistoryPort['getSessions']>>,
  gameMode?: string,
): JourneyProjectionSession[] {
  const expectedModes = new Set(
    (getAcceptedGameModesForJourney(gameMode) ?? []).map((mode) => normalizeModeId(mode)),
  );
  const shouldFilterByMode = expectedModes.size > 0;

  return sessions
    .filter((s) => s.reason === 'completed')
    .filter((s) => {
      if (!shouldFilterByMode) return true;
      if (!s.gameMode) return true;
      return expectedModes.has(normalizeModeId(s.gameMode));
    })
    .map(
      (s): JourneyProjectionSession => ({
        sessionId: s.id,
        journeyStageId: s.journeyStageId,
        journeyId: s.journeyId,
        nLevel: s.nLevel,
        dPrime: s.dPrime,
        gameMode: s.gameMode,
        upsScore: s.upsScore,
        timestamp: s.createdAt.getTime(),
        byModality: s.byModality,
        passed: s.passed,
      }),
    );
}

/**
 * Create a JourneyPort with explicit history injection.
 */
export function createJourneyAdapter(
  historyPort: HistoryPort,
  options?: JourneyAdapterOptions,
): JourneyPort {
  async function getProjectedStateOrNull(config: JourneyConfig): Promise<JourneyState | null> {
    if (!options?.getProjectedState) return null;
    return await options.getProjectedState(config);
  }

  return {
    async getJourneyState(config: JourneyConfig): Promise<JourneyState> {
      const projected = await getProjectedStateOrNull(config);
      if (projected) {
        return projected;
      }

      const { journeyId, startLevel, targetLevel, gameMode } = config;
      const isSimulator = isSimulatorMode(gameMode);
      const acceptedModes = getAcceptedGameModesForJourney(gameMode) ?? undefined;
      const hybridStrategy = resolveHybridJourneyStrategyConfig(config);

      const allSessions = historyPort.getJourneySessions
        ? await historyPort.getJourneySessions(journeyId, { gameModes: acceptedModes })
        : await historyPort.getSessions();
      const sessionsWithTimestamp = toJourneyProjectionSessions(allSessions, gameMode);

      return projectWithAutoExpansion(
        sessionsWithTimestamp,
        targetLevel,
        startLevel,
        journeyId,
        isSimulator,
        gameMode,
        {
          trackSessionsPerBlock: hybridStrategy.trackSessionsPerBlock,
          dnbSessionsPerBlock: hybridStrategy.dnbSessionsPerBlock,
        },
      );
    },

    async recordAttempt(
      config: JourneyConfig,
      stageId: number,
      session: JourneyRecordableSession,
    ): Promise<AttemptResult> {
      const projectedState = await getProjectedStateOrNull(config);
      if (projectedState) {
        return decideJourneyAttempt({
          config,
          currentState: projectedState,
          stageId,
          session,
        });
      }

      const { journeyId, startLevel, targetLevel, gameMode } = config;
      const isSimulator = isSimulatorMode(gameMode);
      const totalStages = getTotalStagesForTarget(targetLevel, startLevel, isSimulator);
      const safeStageId = Math.max(1, Math.min(Math.round(stageId), totalStages));
      const acceptedModes = getAcceptedGameModesForJourney(gameMode) ?? undefined;
      const hybridStrategy = resolveHybridJourneyStrategyConfig(config);
      const allSessions = historyPort.getJourneySessions
        ? await historyPort.getJourneySessions(journeyId, { gameModes: acceptedModes })
        : await historyPort.getSessions();
      const sessionAlreadyPersisted = allSessions.some((item) => item.id === session.sessionId);
      const state = sessionAlreadyPersisted
        ? projectWithAutoExpansion(
            toJourneyProjectionSessions(
              allSessions.filter((item) => item.id !== session.sessionId),
              gameMode,
            ),
            targetLevel,
            startLevel,
            journeyId,
            isSimulator,
            gameMode,
            {
              trackSessionsPerBlock: hybridStrategy.trackSessionsPerBlock,
              dnbSessionsPerBlock: hybridStrategy.dnbSessionsPerBlock,
            },
          )
        : await this.getJourneyState(config);
      const attempt = decideJourneyAttempt({
        config,
        currentState: state,
        stageId: safeStageId,
        session,
      });

      if (!state.stages.find((s) => s.stageId === safeStageId)) {
        throw new Error(`Stage ${safeStageId} not found in journey ${journeyId}`);
      }

      return attempt;
    },

    getStageDefinition(stageId: number, config: JourneyConfig): JourneyStageDefinition | undefined {
      const { startLevel, targetLevel, gameMode } = config;
      const isSimulator = isSimulatorMode(gameMode);

      return getStageDefinition(stageId, targetLevel, startLevel, isSimulator);
    },

    async getCurrentStageDefinition(config: JourneyConfig): Promise<JourneyStageDefinition | null> {
      const state = await this.getJourneyState(config);
      const { startLevel, targetLevel, gameMode } = config;
      const isSimulator = isSimulatorMode(gameMode);

      const totalStages = getTotalStagesForTarget(targetLevel, startLevel, isSimulator);

      if (state.currentStage > totalStages) {
        return null; // Journey complete
      }

      return getStageDefinition(state.currentStage, targetLevel, startLevel, isSimulator) ?? null;
    },
  };
}
