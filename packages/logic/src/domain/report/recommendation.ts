/**
 * Report Recommendation Engine
 *
 * Single source of truth for progression recommendations displayed in reports.
 * Covers:
 * - Free-mode next level recommendation (up/same/down)
 * - Journey stage recommendation (next/current/previous stage)
 */

import type { SDTCounts } from '../../types/core';
import { SDT_DPRIME_DOWN, SDT_DPRIME_PASS } from '../../specs/thresholds';
import { SimulatorSpecs } from '../../specs/journey.spec';
import { detectScoringStrategy } from '../scoring/session-passed';
import { evaluateBrainWorkshopProgression, evaluateJaeggiProgression } from '../n-level-evaluator';

export type RecommendationDirection = 'up' | 'same' | 'down';

export interface LevelRecommendation {
  readonly nextLevel: number;
  readonly direction: RecommendationDirection;
}

export interface TempoLevelRecommendationInput {
  readonly currentLevel: number;
  readonly gameMode?: string;
  readonly generator?: string;
  readonly byModality: Readonly<Record<string, SDTCounts>>;
  readonly globalDPrime: number;
  /**
   * Optional fallback for legacy rows without modality details.
   * Used only when byModality is empty for binary strategies.
   */
  readonly passed?: boolean;
  /**
   * BrainWorkshop only: strikes already accumulated at current level.
   */
  readonly currentStrikes?: number;
}

export interface JourneyStageRecommendation {
  readonly targetStage: number;
  readonly direction: RecommendationDirection;
}

export interface JourneyStageRecommendationInput {
  readonly stageId: number;
  readonly gameMode?: string;
  readonly byModality?: Readonly<Record<string, SDTCounts>>;
  readonly globalDPrime?: number;
  readonly passed?: boolean;
  readonly stageCompleted?: boolean;
  readonly nextStageUnlocked?: number | null;
  readonly consecutiveStrikes?: number;
  readonly minStage?: number;
  readonly maxStage?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toDirection(delta: number): RecommendationDirection {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'same';
}

/**
 * Report recommendations should not clamp below the player's current level range.
 * Keep at least N-10 support (UI/home) and preserve higher existing levels.
 */
function getRecommendationMaxLevel(currentLevel: number): number {
  return Math.max(10, currentLevel);
}

/**
 * Accuracy-based recommendation (Flow/Recall/Trace/DualPick style).
 */
export function recommendNextLevelFromPassed(
  currentLevel: number,
  passed: boolean,
): LevelRecommendation {
  const delta = passed ? 1 : 0;
  const nextLevel = clamp(currentLevel + delta, 1, getRecommendationMaxLevel(currentLevel));
  return { nextLevel, direction: toDirection(nextLevel - currentLevel) };
}

/**
 * Tempo recommendation (SDT, Dual N-Back Classic, BrainWorkshop).
 */
export function recommendNextLevelForTempo(
  input: TempoLevelRecommendationInput,
): LevelRecommendation {
  // Phase 2: derive strategy from spec when available, fallback to detectScoringStrategy
  const rulesetId = input.gameMode
    ? SimulatorSpecs[input.gameMode]?.indicator?.rulesetId
    : undefined;
  const strategy =
    rulesetId === 'jaeggi'
      ? 'dualnback-classic'
      : rulesetId === 'brainworkshop'
        ? 'brainworkshop'
        : detectScoringStrategy(input.generator, input.gameMode);
  const entries = Object.entries(input.byModality);
  const hasByModality = entries.length > 0;

  if (strategy === 'dualnback-classic') {
    if (!hasByModality) {
      return recommendNextLevelFromPassed(input.currentLevel, Boolean(input.passed));
    }

    const result = evaluateJaeggiProgression({
      currentNLevel: input.currentLevel,
      byModality: new Map(entries),
    });
    const nextLevel = clamp(
      input.currentLevel + result.delta,
      1,
      getRecommendationMaxLevel(input.currentLevel),
    );
    return { nextLevel, direction: toDirection(result.delta) };
  }

  if (strategy === 'brainworkshop') {
    if (!hasByModality) {
      return recommendNextLevelFromPassed(input.currentLevel, Boolean(input.passed));
    }

    const result = evaluateBrainWorkshopProgression(
      {
        currentNLevel: input.currentLevel,
        byModality: new Map(entries),
      },
      { currentStrikes: input.currentStrikes ?? 0 },
    );
    const nextLevel = clamp(
      input.currentLevel + result.delta,
      1,
      getRecommendationMaxLevel(input.currentLevel),
    );
    return { nextLevel, direction: toDirection(result.delta) };
  }

  // Default SDT strategy (Dual Catch / Custom / fallback tempo):
  // - d' >= pass -> up
  // - d' < down -> down
  // - else stay
  let delta = 0;
  if (input.globalDPrime >= SDT_DPRIME_PASS) {
    delta = 1;
  } else if (input.globalDPrime < SDT_DPRIME_DOWN && input.currentLevel > 1) {
    delta = -1;
  }
  const nextLevel = clamp(
    input.currentLevel + delta,
    1,
    getRecommendationMaxLevel(input.currentLevel),
  );
  return { nextLevel, direction: toDirection(delta) };
}

/**
 * Journey recommendation for report action cards.
 * Stage IDs are sequential, so level delta maps directly to stage delta.
 */
export function recommendJourneyStage(
  input: JourneyStageRecommendationInput,
): JourneyStageRecommendation {
  const minStage = input.minStage ?? 1;
  const maxStage = input.maxStage ?? Number.MAX_SAFE_INTEGER;
  const currentStage = clamp(input.stageId, minStage, maxStage);

  let direction: RecommendationDirection = 'same';

  if (input.byModality && Object.keys(input.byModality).length > 0) {
    direction = recommendNextLevelForTempo({
      currentLevel: currentStage,
      gameMode: input.gameMode,
      byModality: input.byModality,
      globalDPrime: input.globalDPrime ?? 0,
      passed: input.passed,
      currentStrikes: input.consecutiveStrikes,
    }).direction;
  } else if (input.stageCompleted && typeof input.nextStageUnlocked === 'number') {
    direction = 'up';
  }

  let targetStage = currentStage;
  if (direction === 'up') {
    targetStage =
      typeof input.nextStageUnlocked === 'number' ? input.nextStageUnlocked : currentStage + 1;
  } else if (direction === 'down') {
    targetStage = currentStage - 1;
  } else if (input.stageCompleted && typeof input.nextStageUnlocked === 'number') {
    targetStage = input.nextStageUnlocked;
  }

  return {
    targetStage: clamp(targetStage, minStage, maxStage),
    direction,
  };
}
