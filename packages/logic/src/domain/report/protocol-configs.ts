/**
 * Progression Protocol Configs
 *
 * Derives ProgressionProtocolConfig from SimulatorSpecs (single source of truth).
 * The spec's `indicator` field drives ruleset, explanation, messages, and post-processing.
 */

import type { JourneyProtocol, HybridJourneyStageProgress } from '../../types/journey';
import type { ProgressionRuleset, ProgressionZone } from '../progression/progression-engine';
import {
  JAEGGI_RULESET,
  BW_RULESET,
  ACCURACY_RULESET,
  TRACE_ACCURACY_RULESET,
} from '../progression/rulesets';
import type {
  ProgressionMessageKind,
  HybridJourneyDisplay,
  DualTrackJourneyDisplay,
} from './progression-types';
import type { TrackDetails } from '../../types/session-report';
import type { SessionEndReportModel } from '../../types/session-report';
import { SimulatorSpecs, type IndicatorConfig } from '../../specs/journey.spec';
import { buildDualTrackJourneyDisplay } from './dual-track-journey-display';

// =============================================================================
// Types
// =============================================================================

export interface PostProcessorContext {
  readonly report: SessionEndReportModel;
  readonly tone: 'up' | 'stay' | 'down';
  readonly zone: ProgressionZone;
  readonly journeyDecision?: string;
  readonly journeySessionRole?: string;
  readonly hybridProgress?: SessionEndReportModel['journeyContext'] extends infer T
    ? T extends { hybridProgress?: infer H }
      ? H
      : undefined
    : undefined;
  readonly explanation: {
    readonly protocol: string;
    readonly maxErrors?: number;
    readonly thresholdUp?: number;
    readonly thresholdDown?: number;
    readonly scorePercent?: number;
  };
}

export interface PostProcessorResult {
  readonly toneOverride?: 'up' | 'stay' | 'down';
  readonly journeyDecisionOverride?: string;
  readonly hybridJourneyDisplay?: HybridJourneyDisplay;
  readonly dualTrackJourneyDisplay?: DualTrackJourneyDisplay;
  readonly messageKindOverride?: ProgressionMessageKind;
}

export interface ProgressionProtocolConfig {
  readonly id: string;
  readonly match: {
    readonly gameModes: readonly string[];
    readonly journeyProtocol?: JourneyProtocol;
  };
  readonly ruleset: ProgressionRuleset;
  readonly explanationKind: 'jaeggi' | 'brainworkshop' | 'accuracy';
  readonly messageKindMap: {
    readonly free?: Partial<Record<ProgressionZone, ProgressionMessageKind>>;
    readonly journey?: Partial<Record<ProgressionZone, ProgressionMessageKind>>;
    readonly strikes?: Record<number, ProgressionMessageKind>;
    readonly completed?: ProgressionMessageKind;
  };
  readonly freeActions: { readonly kind: 'standard' };
  readonly journeyActions: { readonly kind: 'go-to-stage' };
  readonly postProcess?: (ctx: PostProcessorContext) => PostProcessorResult;
}

// =============================================================================
// Registries
// =============================================================================

/** Registry of all rulesets, keyed by rulesetId from the spec. */
export const RULESET_REGISTRY: Record<string, ProgressionRuleset> = {
  jaeggi: JAEGGI_RULESET,
  brainworkshop: BW_RULESET,
  accuracy: ACCURACY_RULESET,
  'trace-accuracy': TRACE_ACCURACY_RULESET,
};

/** Registry of post-processors, keyed by postProcessorId from the spec. */
export const POST_PROCESSORS: Record<string, ProgressionProtocolConfig['postProcess']> = {
  'hybrid-jaeggi': hybridJaeggiPostProcessor,
  'dual-track': dualTrackPostProcessor,
};

// =============================================================================
// Spec-Driven Derivation
// =============================================================================

/**
 * Derive a ProgressionProtocolConfig from SimulatorSpecs for a given gameMode.
 *
 * @param gameMode - The game mode ID.
 * @param journeyProtocol - Optional journey protocol (e.g. 'hybrid-jaeggi').
 * @returns The derived config, or null if the spec has no indicator.
 */
export function deriveProtocolConfig(
  gameMode: string,
  journeyProtocol?: JourneyProtocol,
): ProgressionProtocolConfig | null {
  const spec = SimulatorSpecs[gameMode];
  if (!spec?.indicator) return null;

  const ind = spec.indicator;
  const ruleset = RULESET_REGISTRY[ind.rulesetId];
  if (!ruleset) return null;

  // For hybrid-jaeggi, the spec lives on the journey mode (dual-track-dnb-hybrid)
  // but the indicator matches the DNB gameMode (dualnback-classic) in journey scope.
  // When journeyProtocol === 'hybrid-jaeggi', use the hybrid post-processor.
  if (journeyProtocol === 'hybrid-jaeggi' && ind.postProcessorId === 'hybrid-jaeggi') {
    return buildConfigFromIndicator(ind, gameMode, ruleset, journeyProtocol);
  }
  // For hybrid-jaeggi: if the spec declares a hybrid postProcessor but we're not
  // in that protocol context, fall back to the base gameMode's spec.
  // For dual-track: the postProcessor applies directly (no separate protocol).
  if (ind.postProcessorId === 'hybrid-jaeggi' && !journeyProtocol) {
    return null;
  }

  return buildConfigFromIndicator(ind, gameMode, ruleset, journeyProtocol);
}

function buildConfigFromIndicator(
  ind: IndicatorConfig,
  gameMode: string,
  ruleset: ProgressionRuleset,
  journeyProtocol?: JourneyProtocol,
): ProgressionProtocolConfig {
  const postProcess = ind.postProcessorId ? POST_PROCESSORS[ind.postProcessorId] : undefined;

  return {
    id: ind.postProcessorId ?? ind.rulesetId,
    match: {
      gameModes: [gameMode],
      journeyProtocol,
    },
    ruleset,
    explanationKind: ind.explanationKind,
    messageKindMap: ind.messageKindMap as ProgressionProtocolConfig['messageKindMap'],
    freeActions: { kind: 'standard' },
    journeyActions: { kind: 'go-to-stage' },
    postProcess,
  };
}

// =============================================================================
// Hybrid Jaeggi Post-Processor
// =============================================================================

function hybridJaeggiPostProcessor(ctx: PostProcessorContext): PostProcessorResult {
  let effectiveDecision = ctx.journeyDecision;
  if (
    ctx.explanation.protocol === 'jaeggi' &&
    ctx.explanation.maxErrors !== undefined &&
    ctx.explanation.thresholdUp !== undefined &&
    ctx.explanation.thresholdDown !== undefined
  ) {
    const report = ctx.report;
    const jCtx = report.journeyContext;
    if (
      jCtx &&
      jCtx.guidanceSource !== 'current-state' &&
      jCtx.nextSessionGameMode !== 'dualnback-classic'
    ) {
      if (ctx.explanation.maxErrors < ctx.explanation.thresholdUp) {
        effectiveDecision = 'up';
      } else if (ctx.explanation.maxErrors > ctx.explanation.thresholdDown) {
        effectiveDecision = 'down';
      } else {
        effectiveDecision = 'stay';
      }
    }
  }

  const journeyDecisionOverride =
    effectiveDecision !== ctx.journeyDecision ? effectiveDecision : undefined;

  const hybridProgress = ctx.report.journeyContext?.hybridProgress;
  const hybridJourneyDisplay = resolveHybridJourneyDisplayFromCtx({
    journeyDecision: effectiveDecision,
    journeySessionRole: ctx.journeySessionRole,
    hybridProgress,
  });

  let toneOverride: PostProcessorResult['toneOverride'];
  let messageKindOverride: ProgressionMessageKind | undefined;

  if (hybridJourneyDisplay) {
    switch (hybridJourneyDisplay.kind) {
      case 'validation-progress':
        toneOverride = 'up';
        messageKindOverride = 'hybrid-validation-progress';
        break;
      case 'failure-progress':
        toneOverride = 'down';
        messageKindOverride = 'hybrid-failure-progress';
        break;
      case 'track-progress':
        messageKindOverride = 'hybrid-track-progress';
        break;
      case 'stay-progress':
        messageKindOverride = 'hybrid-stay-progress';
        break;
      case 'up-decision':
        toneOverride = 'up';
        messageKindOverride = 'hybrid-up-decision';
        break;
      case 'down-decision':
        toneOverride = 'down';
        messageKindOverride = 'hybrid-down-decision';
        break;
      case 'stay-decision':
        messageKindOverride = 'hybrid-stay-decision';
        break;
    }
  } else if (ctx.journeySessionRole === 'track-half' || effectiveDecision === 'pending-pair') {
    messageKindOverride = 'hybrid-pending-pair';
  } else if (effectiveDecision === 'up') {
    messageKindOverride = 'hybrid-up-decision';
  } else if (effectiveDecision === 'down') {
    messageKindOverride = 'hybrid-down-decision';
  } else {
    messageKindOverride = 'hybrid-stay-decision';
  }

  return {
    toneOverride,
    journeyDecisionOverride,
    hybridJourneyDisplay,
    messageKindOverride,
  };
}

// =============================================================================
// resolveHybridJourneyDisplay
// =============================================================================

function resolveHybridJourneyDisplayFromCtx(params: {
  readonly journeyDecision?: string;
  readonly journeySessionRole?: string;
  readonly hybridProgress?: HybridJourneyStageProgress;
}): HybridJourneyDisplay | undefined {
  const { journeyDecision, journeySessionRole, hybridProgress } = params;

  if (journeyDecision === 'up') return { kind: 'up-decision' };
  if (journeyDecision === 'down') return { kind: 'down-decision' };
  if (journeyDecision === 'stay' && hybridProgress?.loopPhase !== 'dnb') {
    return { kind: 'stay-decision' };
  }

  if (!hybridProgress) {
    if (journeySessionRole === 'track-half' || journeyDecision === 'pending-pair') {
      return { kind: 'track-progress' };
    }
    if (journeyDecision === 'stay') return { kind: 'stay-decision' };
    return undefined;
  }

  if (hybridProgress.loopPhase === 'track') {
    return {
      kind: 'track-progress',
      current: hybridProgress.trackSessionsCompleted,
      total: hybridProgress.trackSessionsRequired,
    };
  }

  if (hybridProgress.decisionZone === 'clean') {
    return {
      kind: 'validation-progress',
      current: hybridProgress.decisionStreakCount ?? hybridProgress.dnbSessionsCompleted,
      total: hybridProgress.decisionStreakRequired ?? 2,
    };
  }

  if (hybridProgress.decisionZone === 'down') {
    return {
      kind: 'failure-progress',
      current: hybridProgress.decisionStreakCount ?? hybridProgress.dnbSessionsCompleted,
      total: hybridProgress.decisionStreakRequired ?? 2,
    };
  }

  if (journeyDecision === 'stay') {
    return { kind: 'stay-decision' };
  }

  return {
    kind: 'stay-progress',
    current: hybridProgress.dnbSessionsCompleted,
    total: hybridProgress.dnbSessionsRequired,
  };
}

// =============================================================================
// Dual Track Post-Processor
// =============================================================================

function dualTrackPostProcessor(ctx: PostProcessorContext): PostProcessorResult {
  const report = ctx.report;
  const trackDetails =
    report.modeDetails?.kind === 'track' ? (report.modeDetails as TrackDetails) : null;

  if (!trackDetails) return {};
  const dualTrackJourneyDisplay = buildDualTrackJourneyDisplay(trackDetails);
  if (!dualTrackJourneyDisplay) return {};

  // Tone: green for progression, red for regression
  const toneOverride: 'up' | 'down' | 'stay' = dualTrackJourneyDisplay.promotedTargetCount
    ? 'up'
    : dualTrackJourneyDisplay.tierDirection;

  // Message kind
  let messageKindOverride: ProgressionMessageKind;
  if (dualTrackJourneyDisplay.promotedTargetCount) {
    messageKindOverride = 'track-promoted';
  } else if (dualTrackJourneyDisplay.tierDirection === 'up') {
    messageKindOverride = 'track-up';
  } else if (dualTrackJourneyDisplay.tierDirection === 'down') {
    messageKindOverride = 'track-down';
  } else {
    messageKindOverride = 'track-stay';
  }

  return {
    toneOverride,
    dualTrackJourneyDisplay,
    messageKindOverride,
  };
}
