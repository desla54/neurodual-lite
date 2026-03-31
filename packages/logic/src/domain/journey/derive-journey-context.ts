/**
 * Derive a JourneyContext from the current journey_state_projection + session metadata.
 *
 * Used for historical reports where JOURNEY_TRANSITION_DECIDED is no longer stored.
 * The derived context reflects the CURRENT rules (since journey_state_projection is
 * rebuilt on rules_version bump), so historical reports auto-adapt when rules change.
 *
 * The result carries `guidanceSource: 'current-state'` to signal that values like
 * stageCompleted / nextPlayableStage reflect the latest projection, not a snapshot
 * frozen at session-end time.
 */

import type { JourneyContext } from '../../types/session-report';
import type { JourneyState, JourneyStageProgress, JourneyModeType } from '../../types/journey';
import { getStageDefinition, generateJourneyStages } from './constants';

export interface DeriveJourneyContextInput {
  /** Journey state from journey_state_projection.state_json */
  readonly journeyState: JourneyState;
  /** Stage ID the session was played on */
  readonly sessionStageId: number;
  /** N-level the session was played at (used to disambiguate after stage renumbering) */
  readonly sessionNLevel?: number;
  /** Journey identifier */
  readonly journeyId: string;
  /** Game mode of the journey (e.g. 'dualnback-classic', 'sim-brainworkshop') */
  readonly journeyGameMode?: string;
  /** Journey display name */
  readonly journeyName?: string;
  /** Short journey label for compact cards */
  readonly journeyNameShort?: string;
}

export function deriveJourneyContextFromState(
  input: DeriveJourneyContextInput,
): JourneyContext | null {
  const { journeyState, sessionStageId, sessionNLevel, journeyId } = input;

  // --- Stage resolution with nLevel disambiguation ---
  // After atomic expansion (startLevel lowered), stageIds shift: old stageId=1 (N2)
  // becomes stageId=5 in the expanded projection. We must find the correct stage.
  let stageProgress: JourneyStageProgress | undefined;
  let effectiveStageId = sessionStageId;

  // Strategy 1: direct match by stageId
  stageProgress = journeyState.stages.find((s) => s.stageId === sessionStageId);

  // Strategy 2: if found by ID but nLevel doesn't match, the stage was renumbered.
  // Use nLevel to find the correct stage instead.
  if (stageProgress && sessionNLevel != null) {
    const stageDefs = generateJourneyStages(
      journeyState.targetLevel,
      journeyState.startLevel,
      journeyState.isSimulator ?? false,
    );
    const defForStageId = stageDefs.find((d) => d.stageId === sessionStageId);
    if (defForStageId && defForStageId.nLevel !== sessionNLevel) {
      // StageId maps to a different nLevel after expansion — find by nLevel instead
      // For simulator journeys (1 stage per nLevel), nLevel is unique.
      // For classic (4 modes per nLevel), pick the first stage at that nLevel.
      const correctDef = stageDefs.find((d) => d.nLevel === sessionNLevel);
      if (correctDef) {
        const correctedProgress = journeyState.stages.find((s) => s.stageId === correctDef.stageId);
        if (correctedProgress) {
          stageProgress = correctedProgress;
          effectiveStageId = correctDef.stageId;
        }
      }
    }
  }

  // Strategy 3: fallback to currentStage if neither ID nor nLevel matched
  if (!stageProgress && journeyState.currentStage <= journeyState.stages.length) {
    stageProgress = journeyState.stages.find((s) => s.stageId === journeyState.currentStage);
    if (stageProgress) {
      effectiveStageId = journeyState.currentStage;
    }
  }
  if (!stageProgress) return null;

  const stageDef = getStageDefinition(
    effectiveStageId,
    journeyState.targetLevel,
    journeyState.startLevel,
    journeyState.isSimulator ?? false,
  );
  if (!stageDef) return null;

  const totalStages = journeyState.stages.length;
  const isLastStage = effectiveStageId === totalStages;
  const stageCompleted = stageProgress.status === 'completed';
  const nextStageUnlocked = stageCompleted ? (isLastStage ? null : effectiveStageId + 1) : null;

  // Determine nextPlayableStage from current journey state
  const nextPlayableStage = (() => {
    if (journeyState.currentStage > totalStages) return null; // journey completed
    return journeyState.currentStage;
  })();

  // Derive journeyDecision by comparing effectiveStageId with current state.
  // Important: do NOT gate on stageCompleted — BrainWorkshop "3 strikes → down"
  // regresses to a lower stage WITHOUT completing the current one. The decision
  // must still reflect the move so the report shows "down" instead of "stay".
  const journeyDecision = (() => {
    if (nextPlayableStage === null) return 'up' as const; // journey completed
    if (nextPlayableStage > effectiveStageId) return 'up' as const;
    if (nextPlayableStage < effectiveStageId) return 'down' as const;
    // Stage not completed and still at the same stage → stay (or still in progress)
    if (stageCompleted) return 'stay' as const;
    return undefined;
  })();

  return {
    journeyId,
    stageId: effectiveStageId,
    stageMode: stageDef.mode as JourneyModeType,
    nLevel: stageDef.nLevel,
    journeyName: input.journeyName ?? journeyId,
    journeyGameMode: input.journeyGameMode,
    upsThreshold: 80, // JOURNEY_MIN_PASSING_SCORE
    isValidating: stageProgress.validatingSessions > 0,
    validatingSessions: stageProgress.validatingSessions,
    sessionsRequired: stageProgress.validatingSessions > 0 ? stageProgress.validatingSessions : 3,
    progressPct: stageProgress.progressPct,
    bestScore: stageProgress.bestScore,
    stageCompleted,
    nextStageUnlocked,
    nextPlayableStage,
    nextSessionGameMode: journeyState.nextSessionGameMode,
    consecutiveStrikes: journeyState.consecutiveStrikes,
    suggestedStartLevel: journeyState.suggestedStartLevel,
    hybridProgress: stageProgress.hybridProgress,
    journeyNameShort: input.journeyNameShort,
    guidanceSource: 'current-state',
    journeyDecision,
  };
}
