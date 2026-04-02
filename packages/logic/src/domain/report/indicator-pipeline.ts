/**
 * Indicator Pipeline
 *
 * Generic pipeline that transforms a SessionEndReportModel into a
 * ProgressionIndicatorModel using declarative protocol configs.
 *
 * The pipeline never changes. Adding a new protocol = adding a config
 * in protocol-configs.ts.
 */

import type { SessionEndReportModel } from '../../types/session-report';
import type { JourneyDecision } from '../../types/journey';
import { BW_STRIKES_TO_DOWN } from '../../specs/thresholds';
import {
  computeJaeggiExplanation,
  computeBrainWorkshopExplanation,
  computeAccuracyExplanation,
  resolveJourneyCompletion,
} from './progression-types';
import type {
  ProgressionExplanation,
  ProgressionIndicatorAction,
  ProgressionIndicatorHeadline,
  ProgressionIndicatorModel,
  ProgressionIndicatorScope,
  ProgressionIndicatorTone,
  ProgressionMessageKind,
} from './progression-types';
import type { ProgressionProtocolConfig, PostProcessorContext } from './protocol-configs';
import { deriveProtocolConfig } from './protocol-configs';

// =============================================================================
// Internal Helpers (extracted from progression-indicator.ts)
// =============================================================================

function clampInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}

function uniqueLevels(
  actions: readonly ProgressionIndicatorAction[],
): ProgressionIndicatorAction[] {
  const seen = new Set<string>();
  const out: ProgressionIndicatorAction[] = [];
  for (const action of actions) {
    const key =
      action.kind === 'back_to_home'
        ? 'back_to_home'
        : action.kind === 'journey_go_to_stage'
          ? `${action.kind}:${action.stageId}`
          : `${action.kind}:${action.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

function mapJourneyDecisionToTone(decision: JourneyDecision): ProgressionIndicatorTone {
  if (decision === 'up') return 'up';
  if (decision === 'down') return 'down';
  return 'stay';
}

// =============================================================================
// Pipeline Steps
// =============================================================================

function matchProtocol(report: SessionEndReportModel): ProgressionProtocolConfig | null {
  const journeyProtocol =
    report.journeyContext?.journeyProtocol ??
    (report.journeyContext?.journeyGameMode === 'dual-track-dnb-hybrid'
      ? 'hybrid-jaeggi'
      : undefined);

  // Phase 2: derive from spec first
  const scope = deriveScope(report);
  const effectiveProtocol = scope === 'journey' ? journeyProtocol : undefined;

  // For hybrid journey, the indicator spec lives on the journey gameMode
  const journeyGameMode = report.journeyContext?.journeyGameMode;
  if (scope === 'journey' && journeyGameMode && effectiveProtocol) {
    const derived = deriveProtocolConfig(journeyGameMode, effectiveProtocol);
    if (derived) return derived;
  }

  // Try direct gameMode lookup
  return deriveProtocolConfig(report.gameMode, effectiveProtocol);
}

function deriveScope(report: SessionEndReportModel): ProgressionIndicatorScope {
  if (report.playContext === 'journey') return 'journey';
  if (report.playContext === 'free') return 'free';
  const hasJourneyMarkers =
    report.journeyContext != null ||
    typeof report.journeyId === 'string' ||
    typeof report.journeyStageId === 'number';
  return hasJourneyMarkers ? 'journey' : 'free';
}

function buildExplanation(
  report: SessionEndReportModel,
  cfg: ProgressionProtocolConfig,
): ProgressionExplanation {
  if (cfg.explanationKind === 'jaeggi') {
    return computeJaeggiExplanation(report.byModality, report.activeModalities, cfg.ruleset);
  }
  if (cfg.explanationKind === 'accuracy') {
    return computeAccuracyExplanation(report.byModality, cfg.ruleset);
  }
  return computeBrainWorkshopExplanation(
    report.byModality,
    report.brainWorkshop ?? null,
    cfg.ruleset,
  );
}

function extractStrike(
  report: SessionEndReportModel,
  cfg: ProgressionProtocolConfig,
): { current: number; total: number } | null {
  // Spec-driven: only extract strikes if the ruleset declares a strike system
  if (!cfg.ruleset.strikes) return null;
  if (!report.brainWorkshop) return null;
  const current = Math.max(0, Math.min(2, clampInt(report.brainWorkshop.strikesAfter, 0)));
  const total = Math.max(1, clampInt(report.brainWorkshop.strikesToDown, 3));
  if (current <= 0) return null;
  return { current, total } as const;
}

function deriveRawTone(
  journeyDecision: JourneyDecision | undefined,
  nextPlayableStage: number,
  stageId: number,
): ProgressionIndicatorTone {
  if (typeof journeyDecision === 'string' && journeyDecision !== 'pending-pair') {
    return mapJourneyDecisionToTone(journeyDecision);
  }
  if (nextPlayableStage > stageId) return 'up';
  if (nextPlayableStage < stageId) return 'down';
  return 'stay';
}

function applyFloorRegression(
  tone: ProgressionIndicatorTone,
  report: SessionEndReportModel,
  explanation: ProgressionExplanation,
): { tone: ProgressionIndicatorTone; triggered: boolean } {
  if (tone !== 'stay') return { tone, triggered: false };

  const ctx = report.journeyContext;
  if (!ctx) return { tone, triggered: false };
  if (typeof ctx.suggestedStartLevel !== 'number') return { tone, triggered: false };

  const currentLevel = Math.max(1, clampInt(report.nLevel, 1));
  if (currentLevel <= 1) return { tone, triggered: false };
  if (ctx.suggestedStartLevel >= currentLevel) return { tone, triggered: false };

  if (explanation.protocol === 'jaeggi') {
    if (explanation.errorsByModality.some((modality) => modality.zone === 'down')) {
      return { tone: 'down', triggered: true };
    }
    return { tone, triggered: false };
  }

  // BrainWorkshop-style floor regression: trigger down when at max strikes but reset
  if (explanation.protocol !== 'brainworkshop') return { tone, triggered: false };
  if (!report.brainWorkshop) return { tone, triggered: false };
  const strikesBefore = clampInt(report.brainWorkshop.strikesBefore, 0);
  const strikesAfter = clampInt(report.brainWorkshop.strikesAfter, 0);
  if (strikesBefore !== BW_STRIKES_TO_DOWN - 1) return { tone, triggered: false };
  if (strikesAfter !== 0) return { tone, triggered: false };
  if (explanation.scorePercent < explanation.downPercent) {
    return { tone: 'down', triggered: true };
  }

  return { tone, triggered: false };
}

function resolveTargetLevel(
  tone: ProgressionIndicatorTone,
  currentLevel: number,
  floorRegressionTriggered: boolean,
  suggestedStartLevel: number | undefined,
  isHybridProgressPhase: boolean,
): number {
  if (isHybridProgressPhase) return currentLevel;
  if (tone === 'up') return currentLevel + 1;
  if (tone !== 'down') return currentLevel;
  if (
    floorRegressionTriggered &&
    typeof suggestedStartLevel === 'number' &&
    Number.isFinite(suggestedStartLevel)
  ) {
    return Math.max(1, Math.min(currentLevel - 1, clampInt(suggestedStartLevel, 1)));
  }
  return Math.max(1, currentLevel - 1);
}

function resolveHeadline(
  tone: ProgressionIndicatorTone,
  strike: { current: number; total: number } | null,
): ProgressionIndicatorHeadline {
  return tone === 'stay' && strike ? 'strike' : tone;
}

function resolveMessageKindFromConfig(
  cfg: ProgressionProtocolConfig,
  scope: ProgressionIndicatorScope,
  tone: ProgressionIndicatorTone,
  journeyCompletion: string | undefined,
  headline: ProgressionIndicatorHeadline,
  strike: { current: number; total: number } | null,
  messageKindOverride: ProgressionMessageKind | undefined,
): ProgressionMessageKind {
  // 1. Post-processor override takes precedence
  if (messageKindOverride) return messageKindOverride;

  // 2. Journey completed
  if (journeyCompletion === 'journey-completed' && cfg.messageKindMap.completed) {
    return cfg.messageKindMap.completed;
  }

  // 3. Strike
  if (headline === 'strike' && strike && cfg.messageKindMap.strikes) {
    const strikeKind = cfg.messageKindMap.strikes[strike.current];
    if (strikeKind) return strikeKind;
  }

  // 4. Scope + zone lookup
  const scopeMap = cfg.messageKindMap[scope];
  if (scopeMap) {
    // Map tone to zone (tone matches ProgressionZone values)
    const kind = scopeMap[tone];
    if (kind) return kind;
  }

  // Fallback (should never happen with correct configs)
  return scope === 'free' ? 'free-stay' : 'jaeggi-stay';
}

function resolveFreeActions(
  tone: ProgressionIndicatorTone,
  currentLevel: number,
  nextLevel: number,
  _strike: { current: number; total: number } | null,
): {
  primaryAction: ProgressionIndicatorAction;
  secondaryActions: readonly ProgressionIndicatorAction[];
} {
  const actions: ProgressionIndicatorAction[] = [
    { kind: 'replay_current_level', level: currentLevel },
  ];
  if (tone === 'stay') {
    if (currentLevel > 1) {
      actions.push({ kind: 'play_at_level', level: Math.max(1, currentLevel - 1) });
    }
    actions.push({ kind: 'play_at_level', level: currentLevel + 1 });
  } else {
    actions.push({ kind: 'play_at_level', level: nextLevel });
  }

  const deduped = uniqueLevels(actions);
  // biome-ignore lint/style/noNonNullAssertion: deduped always has at least one element
  const fallbackAction = deduped[0]!;
  const primaryAction =
    tone === 'stay'
      ? fallbackAction
      : (deduped.find((a) => a.kind !== 'replay_current_level') ?? fallbackAction);
  const secondaryActions = deduped.filter((a) => a !== primaryAction);
  return { primaryAction, secondaryActions };
}

// =============================================================================
// Main Pipeline
// =============================================================================

export function runIndicatorPipeline(
  report: SessionEndReportModel,
): ProgressionIndicatorModel | null {
  // --- Match protocol ---
  const cfg = matchProtocol(report);
  if (!cfg) return null;

  const scope = deriveScope(report);
  const currentLevel = Math.max(1, clampInt(report.nLevel, 1));
  const explanation = buildExplanation(report, cfg);
  const brainWorkshopStrike = extractStrike(report, cfg);

  // --- Journey path ---
  if (scope === 'journey') {
    const ctx = report.journeyContext ?? undefined;
    if (!ctx) return null;

    const journeyProtocol =
      ctx.journeyProtocol ??
      (ctx.journeyGameMode === 'dual-track-dnb-hybrid' ? 'hybrid-jaeggi' : undefined);
    const journeySessionRole = ctx.sessionRole;
    let journeyDecision = ctx.journeyDecision;
    const journeyDisplayName =
      ctx.journeyNameShort ??
      (journeyProtocol === 'hybrid-jaeggi' ? 'Hybride DNB + Track' : ctx.journeyName);
    const journeyCompletion = resolveJourneyCompletion(ctx);

    // --- Post-process (hybrid only) ---
    let hybridJourneyDisplay: ProgressionIndicatorModel['hybridJourneyDisplay'];
    let dualTrackJourneyDisplay: ProgressionIndicatorModel['dualTrackJourneyDisplay'];
    let messageKindOverride: ProgressionMessageKind | undefined;
    let toneOverride: ProgressionIndicatorTone | undefined;

    if (cfg.postProcess) {
      const postCtx: PostProcessorContext = {
        report,
        tone: 'stay', // preliminary, will be overridden
        zone: 'stay',
        journeyDecision: journeyDecision as string | undefined,
        journeySessionRole: journeySessionRole as string | undefined,
        hybridProgress: ctx.hybridProgress,
        // biome-ignore lint/suspicious/noExplicitAny: explanation shape varies by post-processor
        explanation: explanation as any,
      };
      const postResult = cfg.postProcess(postCtx);
      if (postResult.journeyDecisionOverride) {
        journeyDecision = postResult.journeyDecisionOverride as typeof journeyDecision;
      }
      hybridJourneyDisplay = postResult.hybridJourneyDisplay;
      dualTrackJourneyDisplay = postResult.dualTrackJourneyDisplay;
      messageKindOverride = postResult.messageKindOverride;
      toneOverride = postResult.toneOverride;
    }

    // --- Journey completed early exit ---
    if (journeyCompletion === 'journey-completed') {
      const primaryAction: ProgressionIndicatorAction = { kind: 'back_to_home' };
      const mk = resolveMessageKindFromConfig(
        cfg,
        scope,
        'up',
        journeyCompletion,
        'up',
        null,
        messageKindOverride,
      );
      return {
        kind: 'progression-indicator',
        scope,
        gameMode: report.gameMode,
        journeyProtocol,
        journeySessionRole,
        journeyDecision,
        journeyDisplayName,
        currentLevel,
        tone: 'up',
        headline: 'up',
        messageKind: mk,
        explanation,
        targetLevel: currentLevel,
        journeyCompletion,
        suggestedStartLevel: ctx.suggestedStartLevel,
        primaryAction,
        secondaryActions: [],
      };
    }

    // --- Stage + nextPlayableStage resolution ---
    const stageId = Math.max(
      1,
      clampInt(
        ctx.stageId ?? (typeof report.journeyStageId === 'number' ? report.journeyStageId : null),
        1,
      ),
    );

    const nextPlayableStage = (() => {
      if (journeyDecision === 'up') {
        if (typeof ctx.nextPlayableStage === 'number' && ctx.nextPlayableStage > stageId) {
          return Math.max(1, clampInt(ctx.nextPlayableStage, stageId + 1));
        }
        return stageId + 1;
      }
      if (journeyDecision === 'down') {
        if (typeof ctx.nextPlayableStage === 'number') {
          return Math.max(1, clampInt(ctx.nextPlayableStage, stageId));
        }
        return Math.max(1, stageId - 1);
      }
      if (typeof ctx.nextPlayableStage === 'number') {
        return Math.max(1, clampInt(ctx.nextPlayableStage, stageId));
      }
      return stageId;
    })();

    // --- Tone derivation ---
    let tone: ProgressionIndicatorTone;
    if (toneOverride) {
      tone = toneOverride;
    } else if (hybridJourneyDisplay) {
      // Hybrid display overrides tone
      tone =
        hybridJourneyDisplay.kind === 'validation-progress'
          ? 'up'
          : hybridJourneyDisplay.kind === 'failure-progress'
            ? 'down'
            : hybridJourneyDisplay.kind === 'up-decision'
              ? 'up'
              : hybridJourneyDisplay.kind === 'down-decision'
                ? 'down'
                : deriveRawTone(journeyDecision, nextPlayableStage, stageId);
    } else {
      tone = deriveRawTone(journeyDecision, nextPlayableStage, stageId);
    }

    // --- Floor regression ---
    const floorResult = applyFloorRegression(tone, report, explanation);
    tone = floorResult.tone;

    // --- Hybrid progress phase detection ---
    const isHybridProgressPhase =
      hybridJourneyDisplay?.kind === 'track-progress' ||
      hybridJourneyDisplay?.kind === 'validation-progress' ||
      hybridJourneyDisplay?.kind === 'stay-progress' ||
      hybridJourneyDisplay?.kind === 'failure-progress';

    const targetLevel = resolveTargetLevel(
      tone,
      currentLevel,
      floorResult.triggered,
      ctx.suggestedStartLevel,
      !!isHybridProgressPhase,
    );

    const headline = resolveHeadline(tone, brainWorkshopStrike);

    // --- Journey actions ---
    const primaryAction: ProgressionIndicatorAction = isHybridProgressPhase
      ? { kind: 'journey_go_to_stage', stageId, level: currentLevel }
      : { kind: 'journey_go_to_stage', stageId: nextPlayableStage, level: targetLevel };

    const mk = resolveMessageKindFromConfig(
      cfg,
      scope,
      tone,
      journeyCompletion,
      headline,
      brainWorkshopStrike,
      messageKindOverride,
    );

    return {
      kind: 'progression-indicator',
      scope,
      gameMode: report.gameMode,
      journeyProtocol,
      journeySessionRole,
      journeyDecision,
      journeyDisplayName,
      currentLevel,
      tone,
      headline,
      messageKind: mk,
      ...(headline === 'strike' && brainWorkshopStrike ? { strike: brainWorkshopStrike } : {}),
      explanation,
      targetLevel,
      journeyCompletion,
      suggestedStartLevel: ctx.suggestedStartLevel,
      hybridJourneyDisplay,
      hybridProgress: ctx.hybridProgress,
      dualTrackJourneyDisplay,
      primaryAction,
      secondaryActions: [],
    };
  }

  // --- Free training path ---
  const nextStep = report.nextStep;
  if (!nextStep) return null;

  const tone: ProgressionIndicatorTone =
    nextStep.direction === 'up' ? 'up' : nextStep.direction === 'down' ? 'down' : 'stay';
  const headline = resolveHeadline(tone, brainWorkshopStrike);
  const nextLevel = Math.max(1, clampInt(nextStep.nextLevel, currentLevel));

  const { primaryAction, secondaryActions } = resolveFreeActions(
    tone,
    currentLevel,
    nextLevel,
    brainWorkshopStrike,
  );

  const mk = resolveMessageKindFromConfig(
    cfg,
    'free',
    tone,
    undefined,
    headline,
    brainWorkshopStrike,
    undefined,
  );

  return {
    kind: 'progression-indicator',
    scope: 'free',
    gameMode: report.gameMode,
    currentLevel,
    tone,
    headline,
    messageKind: mk,
    ...(headline === 'strike' && brainWorkshopStrike ? { strike: brainWorkshopStrike } : {}),
    explanation,
    targetLevel: nextLevel,
    primaryAction,
    secondaryActions,
  };
}
