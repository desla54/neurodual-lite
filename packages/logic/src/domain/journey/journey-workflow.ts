/**
 * Journey Workflow
 *
 * Emmett-style workflow: decide(sessions, state, config) → JourneyOutput[]
 *
 * Phase 1: wraps the existing projector logic. The outputs are derived
 * by diffing the state before/after projection. The key deliverable is
 * the NextSessionCommand — a single authoritative "what to play next"
 * that consumers read directly instead of re-deriving.
 */

import type { JourneyConfig, JourneyState } from '../../types/journey';
import { JOURNEY_MODE_TO_GAME_MODE } from '../../types/journey';
import { getStageDefinition, getTotalStagesForTarget, isSimulatorMode } from './constants';
import { getRouteForGameMode } from './router';
import { ALTERNATING_JOURNEY_FIRST_MODE, isAlternatingJourneyMode } from '../../specs/journey.spec';
import type { NextSessionCommand } from './journey-workflow-types';

// =============================================================================
// Workflow Config
// =============================================================================

export interface JourneyWorkflowConfig {
  readonly journeyId: string;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
  readonly isSimulator: boolean;
  readonly hybridTrackSessionsPerBlock?: number;
  readonly hybridDnbSessionsPerBlock?: number;
}

// =============================================================================
// NextSession derivation
// =============================================================================

/**
 * Derives a NextSessionCommand from the projected JourneyState.
 *
 * This is the single source of truth for "what session to launch next".
 * It replaces the scattered getStageDefinition() + getRouteForGameMode()
 * calls that were previously done independently by each UI page.
 */
export function deriveNextSession(
  state: JourneyState,
  config: JourneyWorkflowConfig,
): NextSessionCommand | null {
  const totalStages = getTotalStagesForTarget(
    state.targetLevel,
    state.startLevel,
    state.isSimulator ?? false,
  );

  // Journey completed — no next session
  if (state.currentStage > totalStages) {
    return null;
  }

  const stageDef = getStageDefinition(
    state.currentStage,
    state.targetLevel,
    state.startLevel,
    state.isSimulator ?? false,
  );
  if (!stageDef) return null;

  // For hybrid/alternating journeys, use the nextSessionGameMode from state.
  // When nextSessionGameMode is not yet projected (first launch), fall back
  // to the first concrete mode — never expose the abstract hybrid ID.
  let effectiveGameMode: string;
  if (isAlternatingJourneyMode(config.gameMode)) {
    effectiveGameMode = state.nextSessionGameMode ?? ALTERNATING_JOURNEY_FIRST_MODE;
  } else if (config.gameMode) {
    // Simulator modes: use the configured gameMode
    effectiveGameMode = config.gameMode;
  } else {
    // Standard journey: derive game mode from stage definition mode type
    effectiveGameMode = JOURNEY_MODE_TO_GAME_MODE[stageDef.mode] ?? 'dual-pick';
  }

  const route = getRouteForGameMode(effectiveGameMode);

  return {
    kind: 'Command',
    type: 'NextSession',
    stageId: state.currentStage,
    nLevel: stageDef.nLevel,
    gameMode: effectiveGameMode,
    route,
  };
}

/**
 * Builds a JourneyWorkflowConfig from a JourneyConfig.
 */
export function toWorkflowConfig(config: JourneyConfig): JourneyWorkflowConfig {
  return {
    journeyId: config.journeyId,
    startLevel: config.startLevel,
    targetLevel: config.targetLevel,
    gameMode: config.gameMode,
    isSimulator: isSimulatorMode(config.gameMode),
    hybridTrackSessionsPerBlock: config.hybridTrackSessionsPerBlock,
    hybridDnbSessionsPerBlock: config.hybridDnbSessionsPerBlock,
  };
}
