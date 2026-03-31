/**
 * Progression Indicator Types & Explanation Builders
 *
 * Extracted from progression-indicator.ts to break the circular dependency
 * between progression-indicator.ts, indicator-pipeline.ts, protocol-configs.ts,
 * and dual-track-journey-display.ts.
 */

import type { SessionEndReportModel, UnifiedModalityStats } from '../../types/session-report';
import type {
  HybridJourneyStageProgress,
  JourneyDecision,
  JourneyProtocol,
  JourneySessionRole,
} from '../../types/journey';
import { BW_STRIKES_TO_DOWN } from '../../specs/thresholds';
import { evaluateProgression } from '../progression/progression-engine';
import { JAEGGI_RULESET, BW_RULESET } from '../progression/rulesets';

// =============================================================================
// Types
// =============================================================================

export type ProgressionIndicatorScope = 'free' | 'journey';
export type ProgressionIndicatorTone = 'up' | 'stay' | 'down';
export type ProgressionIndicatorHeadline = 'up' | 'stay' | 'down' | 'strike';

export type ProgressionMessageKind =
  // Journey completed
  | 'journey-completed'
  // Hybrid journey phases
  | 'hybrid-track-progress'
  | 'hybrid-validation-progress'
  | 'hybrid-stay-progress'
  | 'hybrid-failure-progress'
  | 'hybrid-up-decision'
  | 'hybrid-stay-decision'
  | 'hybrid-down-decision'
  | 'hybrid-pending-pair'
  // Brain Workshop
  | 'bw-up'
  | 'bw-stay'
  | 'bw-strike-1'
  | 'bw-strike-2'
  | 'bw-down'
  // Jaeggi journey
  | 'jaeggi-up'
  | 'jaeggi-stay'
  | 'jaeggi-down'
  // Dual Trace journey
  | 'trace-up'
  | 'trace-stay'
  // Dual Track journey
  | 'track-up'
  | 'track-stay'
  | 'track-down'
  | 'track-promoted'
  // Free training
  | 'free-up'
  | 'free-stay'
  | 'free-down';

export type ProgressionIndicatorAction =
  | {
      readonly kind: 'replay_current_level';
      readonly level: number;
    }
  | {
      readonly kind: 'play_at_level';
      readonly level: number;
    }
  | {
      readonly kind: 'journey_go_to_stage';
      readonly stageId: number;
      readonly level: number;
    }
  | { readonly kind: 'back_to_home' };

export interface ModalityErrorInfo {
  readonly modalityId: string;
  readonly errors: number;
  readonly zone: 'up' | 'stay' | 'down';
}

export type ProgressionExplanation =
  | {
      readonly protocol: 'jaeggi';
      readonly errorsByModality: readonly ModalityErrorInfo[];
      readonly maxErrors: number;
      readonly thresholdUp: number;
      readonly thresholdDown: number;
    }
  | {
      readonly protocol: 'brainworkshop';
      readonly scorePercent: number;
      readonly upPercent: number;
      readonly downPercent: number;
      readonly strikesAfter: number;
      readonly strikesToDown: number;
    }
  | {
      readonly protocol: 'accuracy';
      readonly accuracyPercent: number;
      readonly passPercent: number;
    };

export type JourneyCompletionState = 'in-progress' | 'stage-completed' | 'journey-completed';

export type HybridJourneyDisplayKind =
  | 'track-progress'
  | 'validation-progress'
  | 'stay-progress'
  | 'failure-progress'
  | 'up-decision'
  | 'stay-decision'
  | 'down-decision';

export interface HybridJourneyDisplay {
  readonly kind: HybridJourneyDisplayKind;
  readonly current?: number;
  readonly total?: number;
}

export interface DualTrackJourneyDisplay {
  readonly phaseIdentityMode: 'classic' | 'audio' | 'color' | 'audio-color';
  readonly tierInPhase: number;
  readonly tiersPerPhase: number;
  readonly stageProgressPct: number;
  readonly performanceBand?: 'mastery' | 'solid' | 'building' | 'struggling';
  readonly promotedTargetCount: boolean;
  readonly tierDirection: 'up' | 'down' | 'stay';
}

export interface ProgressionIndicatorModel {
  readonly kind: 'progression-indicator';
  readonly scope: ProgressionIndicatorScope;
  readonly gameMode: SessionEndReportModel['gameMode'];
  readonly journeyProtocol?: JourneyProtocol;
  readonly journeySessionRole?: JourneySessionRole;
  readonly journeyDecision?: JourneyDecision;
  readonly journeyDisplayName?: string;
  readonly currentLevel: number;
  readonly tone: ProgressionIndicatorTone;
  readonly headline: ProgressionIndicatorHeadline;
  readonly messageKind: ProgressionMessageKind;
  readonly strike?: {
    readonly current: number;
    readonly total: number;
  };
  readonly explanation: ProgressionExplanation;
  readonly targetLevel: number;
  readonly journeyCompletion?: JourneyCompletionState;
  readonly suggestedStartLevel?: number;
  readonly hybridJourneyDisplay?: HybridJourneyDisplay;
  readonly hybridProgress?: HybridJourneyStageProgress;
  readonly dualTrackJourneyDisplay?: DualTrackJourneyDisplay;
  readonly primaryAction: ProgressionIndicatorAction;
  readonly secondaryActions: readonly ProgressionIndicatorAction[];
}

// =============================================================================
// Internal Helpers
// =============================================================================

function clampInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}

// =============================================================================
// Explanation Builders
// =============================================================================

export function computeJaeggiExplanation(
  byModality: Readonly<Record<string, UnifiedModalityStats>>,
  activeModalities: readonly string[],
  ruleset = JAEGGI_RULESET,
): ProgressionExplanation & { protocol: 'jaeggi' } {
  const result = evaluateProgression({ byModality, activeModalities }, ruleset);

  return {
    protocol: 'jaeggi',
    errorsByModality: (result.perModality ?? []).map((m) => ({
      modalityId: m.modalityId,
      errors: m.value,
      zone: m.zone,
    })),
    maxErrors: result.metricValue,
    thresholdUp: ruleset.zones.up.value,
    thresholdDown: ruleset.zones.down.value,
  };
}

export function computeBrainWorkshopExplanation(
  byModality: Readonly<Record<string, UnifiedModalityStats>>,
  brainWorkshop: NonNullable<SessionEndReportModel['brainWorkshop']> | null,
  ruleset = BW_RULESET,
): ProgressionExplanation & { protocol: 'brainworkshop' } {
  const result = evaluateProgression(
    { byModality, activeModalities: Object.keys(byModality) },
    ruleset,
  );

  return {
    protocol: 'brainworkshop',
    scorePercent: result.metricValue,
    upPercent: ruleset.zones.up.value,
    downPercent: ruleset.zones.down.value,
    strikesAfter: brainWorkshop ? Math.max(0, clampInt(brainWorkshop.strikesAfter, 0)) : 0,
    strikesToDown: ruleset.strikes?.count ?? BW_STRIKES_TO_DOWN,
  };
}

export function computeAccuracyExplanation(
  byModality: Readonly<Record<string, UnifiedModalityStats>>,
  ruleset: { zones: { up: { value: number } } },
): ProgressionExplanation & { protocol: 'accuracy' } {
  let totalH = 0;
  let totalM = 0;
  let totalFA = 0;
  let totalCR = 0;
  for (const stats of Object.values(byModality)) {
    totalH += stats.hits ?? 0;
    totalM += stats.misses ?? 0;
    totalFA += stats.falseAlarms ?? 0;
    totalCR += stats.correctRejections ?? 0;
  }
  const denom = totalH + totalM + totalFA + totalCR;
  const accuracyPercent = denom === 0 ? 0 : Math.floor(((totalH + totalCR) * 100) / denom);

  return {
    protocol: 'accuracy',
    accuracyPercent,
    passPercent: ruleset.zones.up.value,
  };
}

export function resolveJourneyCompletion(
  ctx: NonNullable<SessionEndReportModel['journeyContext']>,
): JourneyCompletionState {
  if (ctx.nextPlayableStage === null) return 'journey-completed';
  if (ctx.stageCompleted) return 'stage-completed';
  return 'in-progress';
}
