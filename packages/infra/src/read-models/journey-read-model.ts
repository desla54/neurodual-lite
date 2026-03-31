/**
 * Journey Read Model
 *
 * Transforms the raw reactive `JourneyState` into a `NextJourneySession` —
 * the single source of truth for "what session to launch next in this journey".
 *
 * Encapsulates all the stageId→nLevel derivation, hybrid mode alternation,
 * and route resolution that was previously scattered across game pages.
 */

import {
  ALTERNATING_JOURNEY_FIRST_MODE,
  getRouteForGameMode,
  getStageDefinition,
  isAlternatingJourneyMode,
  isSimulatorMode,
  mapSubscribable,
  type JourneyConfig,
  type JourneyState,
  type JourneyStrategyConfig,
  type ReadModelPort,
  type ReadModelSnapshot,
  type Subscribable,
} from '@neurodual/logic';

// =============================================================================
// Public types
// =============================================================================

export interface NextJourneySession {
  /** Journey ID (from config) */
  readonly journeyId: string;
  /** Authoritative N-level for the next session */
  readonly nLevel: number;
  /** Game mode to launch (respects hybrid alternation) */
  readonly gameMode: string;
  /** Stage ID (1-based index in the generated stages array) */
  readonly stageId: number;
  /** Route path for React Router navigation */
  readonly route: string;
  /** Current startLevel (may have been expanded by BW regression) */
  readonly startLevel: number;
  /** Target level for the journey */
  readonly targetLevel: number;
  /** Base journey game mode (the config-level mode, e.g. 'dual-track-dnb-hybrid') */
  readonly journeyGameMode: string;
  /** Strategy config for the journey (if any) */
  readonly strategyConfig?: JourneyStrategyConfig;
  /** Whether the journey is completed */
  readonly isComplete: boolean;
}

export interface JourneyReadModelResult {
  readonly nextSession: NextJourneySession | null;
  readonly journeyState: JourneyState;
  readonly isPending: boolean;
}

export interface JourneyReadModel {
  getNextSession(
    config: JourneyConfig,
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<JourneyReadModelResult>>;
}

// =============================================================================
// Implementation
// =============================================================================

const journeyCache = new Map<string, Subscribable<ReadModelSnapshot<JourneyReadModelResult>>>();

export function createJourneyReadModel(readModels: ReadModelPort): JourneyReadModel {
  return {
    getNextSession(
      config: JourneyConfig,
      userId: string | null,
    ): Subscribable<ReadModelSnapshot<JourneyReadModelResult>> {
      const cacheKey = `journey:${config.journeyId}:${userId ?? 'local'}`;
      const existing = journeyCache.get(cacheKey);
      if (existing) return existing;

      const source = readModels.journeyState(config, userId);

      const mapped = mapSubscribable(source, (state: JourneyState): JourneyReadModelResult => {
        const isSimulator = isSimulatorMode(config.gameMode);
        const isComplete = state.currentStage > state.stages.length;

        // Fast path: use the persisted nextSession from the workflow if available
        if (state.nextSession && !isComplete) {
          return {
            nextSession: {
              journeyId: config.journeyId,
              nLevel: state.nextSession.nLevel,
              gameMode: state.nextSession.gameMode,
              stageId: state.nextSession.stageId,
              route: state.nextSession.route,
              startLevel: state.startLevel,
              targetLevel: state.targetLevel,
              journeyGameMode: config.gameMode ?? 'dualnback',
              strategyConfig: config.strategyConfig,
              isComplete: false,
            },
            journeyState: state,
            isPending: false,
          };
        }

        // Fallback: derive from state (backward compat for projections without nextSession)
        if (isComplete) {
          return {
            nextSession: {
              journeyId: config.journeyId,
              nLevel: state.targetLevel,
              gameMode: config.gameMode ?? 'dualnback',
              stageId: state.currentStage,
              route: getRouteForGameMode(config.gameMode ?? 'dualnback'),
              startLevel: state.startLevel,
              targetLevel: state.targetLevel,
              journeyGameMode: config.gameMode ?? 'dualnback',
              strategyConfig: config.strategyConfig,
              isComplete: true,
            },
            journeyState: state,
            isPending: false,
          };
        }

        const stageDef = getStageDefinition(
          state.currentStage,
          state.targetLevel,
          state.startLevel,
          isSimulator,
        );

        const nLevel = stageDef?.nLevel ?? state.startLevel;

        // For hybrid journeys, the journey projector stores `nextSessionGameMode`
        // on the state to indicate which mode to play next.
        // When nextSessionGameMode is not yet projected, hybrid journeys must
        // fall back to the first concrete mode (not the abstract hybrid ID).
        const configMode = config.gameMode ?? 'dualnback';
        const effectiveGameMode =
          state.nextSessionGameMode ??
          (isAlternatingJourneyMode(configMode) ? ALTERNATING_JOURNEY_FIRST_MODE : configMode);
        const route = getRouteForGameMode(effectiveGameMode);

        return {
          nextSession: {
            journeyId: config.journeyId,
            nLevel,
            gameMode: effectiveGameMode,
            stageId: state.currentStage,
            route,
            startLevel: state.startLevel,
            targetLevel: state.targetLevel,
            journeyGameMode: config.gameMode ?? 'dualnback',
            strategyConfig: config.strategyConfig,
            isComplete: false,
          },
          journeyState: state,
          isPending: false,
        };
      });

      // Cache with auto-eviction on last unsubscribe.
      const cached: Subscribable<ReadModelSnapshot<JourneyReadModelResult>> = {
        subscribe(listener) {
          const unsub = mapped.subscribe(listener);
          return () => {
            unsub();
            queueMicrotask(() => {
              journeyCache.delete(cacheKey);
            });
          };
        },
        getSnapshot: () => mapped.getSnapshot(),
      };

      journeyCache.set(cacheKey, cached);
      return cached;
    },
  };
}
