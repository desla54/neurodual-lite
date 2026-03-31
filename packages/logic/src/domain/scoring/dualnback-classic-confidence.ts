/**
 * JaeggiConfidenceCalculator
 *
 * Calcule le score de confiance pour le mode Jaeggi classique.
 * Formule conditionnelle basée sur l'accuracy :
 *
 * Si accuracy >= 90% (joueur rapide ET bon = vivacité) :
 *   Confidence = RTStability*0.40 + ErrorAwareness*0.30 + FocusScore*0.20 + PressStability*0.10
 *
 * Si accuracy < 90% (réponse rapide peut être fébrilité) :
 *   Confidence = RTStability*0.35 + ErrorAwareness*0.25 + FocusScore*0.20 + TimingDiscipline*0.10 + PressStability*0.10
 *
 * Principe : Si le joueur répond vite pendant le stimulus, on le pénalise SAUF s'il a un bon score.
 * "Tu réponds ultra vite ? Ok, montre-moi que t'assures."
 *
 * Les poids sont lus depuis la spec si fournie, sinon depuis thresholds.ts (defaults).
 */

import type { JaeggiConfidenceResult, TempoResponseData } from '../../types/ups';
import type { TempoConfidenceDebug } from '../../types/session-report';
import type { DualnbackClassicConfidenceSpec } from '../../specs/types';
import type { TempoConfidenceContext } from './tempo-confidence';
import {
  JAEGGI_ACCURACY_THRESHOLD,
  JAEGGI_WEIGHTS_WITH_TIMING,
  JAEGGI_WEIGHTS_WITHOUT_TIMING,
  MOUSE_INPUT_THRESHOLDS,
  TEMPO_CONFIDENCE_NEUTRAL,
  TEMPO_FOCUS_THRESHOLDS,
  TEMPO_PES_THRESHOLDS,
  TEMPO_STABILITY_THRESHOLDS,
  UPS_MIN_TRIALS_FOR_CONFIDENCE,
} from '../../types/ups';

// =============================================================================
// Spec-Driven Weights
// =============================================================================

/**
 * Jaeggi with-timing weights structure (numeric values, not literal types).
 */
interface JaeggiWithTimingWeights {
  readonly rtStability: number;
  readonly errorAwareness: number;
  readonly focusScore: number;
  readonly timingDiscipline: number;
  readonly pressStability: number;
}

/**
 * Jaeggi without-timing weights structure (numeric values, not literal types).
 */
interface JaeggiWithoutTimingWeights {
  readonly rtStability: number;
  readonly errorAwareness: number;
  readonly focusScore: number;
  readonly pressStability: number;
}

/**
 * Combined Jaeggi weights structure.
 */
interface JaeggiWeights {
  readonly accuracyThreshold: number;
  readonly withTiming: JaeggiWithTimingWeights;
  readonly withoutTiming: JaeggiWithoutTimingWeights;
}

type ConfidenceComponentWeights = {
  readonly timingDiscipline: number;
  readonly rtStability: number;
  readonly pressStability: number;
  readonly errorAwareness: number;
  readonly focusScore: number;
};

/**
 * Get Jaeggi confidence weights from spec or defaults.
 */
function getJaeggiWeights(spec?: DualnbackClassicConfidenceSpec): JaeggiWeights {
  if (spec) {
    return {
      accuracyThreshold: spec.accuracyThreshold,
      withTiming: {
        rtStability: spec.withTiming.rtStability,
        errorAwareness: spec.withTiming.errorAwareness,
        focusScore: spec.withTiming.focusScore,
        timingDiscipline: spec.withTiming.timingDiscipline,
        pressStability: spec.withTiming.pressStability,
      },
      withoutTiming: {
        rtStability: spec.withoutTiming.rtStability,
        errorAwareness: spec.withoutTiming.errorAwareness,
        focusScore: spec.withoutTiming.focusScore,
        pressStability: spec.withoutTiming.pressStability,
      },
    };
  }

  // Defaults from thresholds.ts
  return {
    accuracyThreshold: JAEGGI_ACCURACY_THRESHOLD,
    withTiming: JAEGGI_WEIGHTS_WITH_TIMING,
    withoutTiming: JAEGGI_WEIGHTS_WITHOUT_TIMING,
  };
}

function getPesLookaheadTrials(spec?: DualnbackClassicConfidenceSpec): number {
  const fromSpec = spec?.pesLookaheadTrials;
  if (typeof fromSpec === 'number' && Number.isFinite(fromSpec) && fromSpec >= 1) {
    return Math.floor(fromSpec);
  }
  return TEMPO_PES_THRESHOLDS.lookaheadTrials;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate mean of an array of numbers.
 */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation of an array of numbers.
 */
function std(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Calculate median of an array of numbers.
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/**
 * Calculate coefficient of variation (CV = std/mean).
 */
function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return std(values) / m;
}

function isMostlyPointerInput(responses: readonly TempoResponseData[]): boolean {
  if (responses.length === 0) return false;
  const pointerCount = responses.filter(
    (r) => r.inputMethod === 'mouse' || r.inputMethod === 'touch',
  ).length;
  return pointerCount / responses.length >= MOUSE_INPUT_THRESHOLDS.responseThreshold;
}

function normalizeComponentWeights(
  weights: ConfidenceComponentWeights,
): ConfidenceComponentWeights {
  const sum =
    weights.timingDiscipline +
    weights.rtStability +
    weights.pressStability +
    weights.errorAwareness +
    weights.focusScore;

  if (sum <= 0) return weights;

  return {
    timingDiscipline: weights.timingDiscipline / sum,
    rtStability: weights.rtStability / sum,
    pressStability: weights.pressStability / sum,
    errorAwareness: weights.errorAwareness / sum,
    focusScore: weights.focusScore / sum,
  };
}

// =============================================================================
// Sub-score Calculators (reused from TempoConfidence)
// =============================================================================

function adjustRTForMouseInput(response: TempoResponseData): number {
  if (response.inputMethod !== 'mouse') {
    return response.reactionTimeMs;
  }

  if (response.cursorTravelDistance !== undefined && response.cursorTravelDistance > 0) {
    const estimatedTravelTimeMs =
      response.cursorTravelDistance / MOUSE_INPUT_THRESHOLDS.cursorSpeedPxPerMs;
    return Math.max(50, response.reactionTimeMs - estimatedTravelTimeMs);
  }

  return response.reactionTimeMs;
}

function getRTSamplesForStability(responses: readonly TempoResponseData[]): number[] {
  // Use ONE RT sample per trial: the first user action in the trial.
  // This avoids mixing single-match trials with dual-match second responses,
  // which are expected to be slower due to sequential inputs.

  type Pick = { idx: number; rt: number };

  const bestByTrial = new Map<number, Pick>();

  for (const r of responses) {
    if (r.reactionTimeMs <= 0) continue;

    const rt = adjustRTForMouseInput(r);
    if (rt <= 0) continue;

    const idx = r.responseIndexInTrial ?? 0;
    const existing = bestByTrial.get(r.trialIndex);

    if (!existing) {
      bestByTrial.set(r.trialIndex, { idx, rt });
      continue;
    }

    if (idx < existing.idx || (idx === existing.idx && rt < existing.rt)) {
      bestByTrial.set(r.trialIndex, { idx, rt });
    }
  }

  return [...bestByTrial.values()].map((x) => x.rt);
}

/**
 * Check if response has valid RT data.
 */
function isValidRT(response: TempoResponseData): boolean {
  return (
    Number.isFinite(response.reactionTimeMs) &&
    response.reactionTimeMs > 0 &&
    // pressDurationMs is optional/meaningless for pointer input; RT validity should not depend on it.
    true
  );
}

/**
 * Calculate TimingDiscipline: penalize early responses.
 * Higher = better (fewer responses during stimulus).
 */
function calculateTimingDiscipline(responses: readonly TempoResponseData[]): number {
  if (responses.length === 0) return TEMPO_CONFIDENCE_NEUTRAL;

  const earlyCount = responses.filter((r) => r.responsePhase === 'during_stimulus').length;
  const earlyRate = earlyCount / responses.length;

  return Math.round(100 * clamp(1 - earlyRate, 0, 1));
}

/**
 * Calculate RTStability: stability of reaction times.
 * Lower CV = more stable = higher score.
 */
function calculateRTStability(responses: readonly TempoResponseData[]): number {
  const rts = getRTSamplesForStability(responses);

  if (rts.length < 3) return TEMPO_CONFIDENCE_NEUTRAL;

  const cv = coefficientOfVariation(rts);
  const score = 100 * clamp(1 - cv / TEMPO_STABILITY_THRESHOLDS.rtCv, 0, 1);

  return Math.round(score);
}

/**
 * Calculate PressStability: stability of press durations.
 * Lower CV = more stable = higher score.
 */
function calculatePressStability(responses: readonly TempoResponseData[]): number {
  // Touch press duration is too noisy (tap vs slide); ignore pointer and fallback to neutral
  // when we don't have enough non-pointer samples.
  const pressDurations = responses
    .filter((r) => r.inputMethod !== 'mouse' && r.inputMethod !== 'touch')
    .map((r) => r.pressDurationMs)
    .filter((pd): pd is number => pd !== null && pd > 0);

  if (pressDurations.length < 3) return TEMPO_CONFIDENCE_NEUTRAL;

  const cv = coefficientOfVariation(pressDurations);
  const score = 100 * clamp(1 - cv / TEMPO_STABILITY_THRESHOLDS.pressCv, 0, 1);

  return Math.round(score);
}

function countEligiblePressSamples(responses: readonly TempoResponseData[]): number {
  return responses
    .filter((r) => r.inputMethod !== 'mouse' && r.inputMethod !== 'touch')
    .map((r) => r.pressDurationMs)
    .filter((pd): pd is number => pd !== null && pd > 0).length;
}

function calculateInputControlScore(args: {
  readonly validResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): number | null {
  if (!args.context) return null;
  const misfires = args.context?.misfireCount ?? 0;
  const duplicates = args.context?.duplicateCount ?? 0;

  const actions = Math.max(1, args.validResponses.length);
  const misfireRate = misfires / actions;
  const duplicateRate = duplicates / actions;
  const penalty = 1.4 * misfireRate + 0.8 * duplicateRate;
  const worst = 0.25;
  const score = 100 * clamp(1 - penalty / worst, 0, 1);
  return Math.round(score);
}

function calculatePressStabilitySlot(args: {
  readonly validResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): { score: number; kind: 'pressDuration' | 'inputControl' | 'none' } {
  const eligiblePressSamples = countEligiblePressSamples(args.validResponses);
  const canUsePressDuration =
    eligiblePressSamples >= 3 && !isMostlyPointerInput(args.validResponses);
  if (canUsePressDuration) {
    return { score: calculatePressStability(args.validResponses), kind: 'pressDuration' };
  }

  const inputControl = calculateInputControlScore(args);
  if (inputControl !== null) return { score: inputControl, kind: 'inputControl' };

  return { score: TEMPO_CONFIDENCE_NEUTRAL, kind: 'none' };
}

function getEffectiveComponentWeights(args: {
  readonly timingPenaltyApplied: boolean;
  readonly weights: JaeggiWeights;
  readonly validResponses: readonly TempoResponseData[];
  readonly allResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): ConfidenceComponentWeights {
  const base: ConfidenceComponentWeights = args.timingPenaltyApplied
    ? {
        timingDiscipline: args.weights.withTiming.timingDiscipline,
        rtStability: args.weights.withTiming.rtStability,
        pressStability: args.weights.withTiming.pressStability,
        errorAwareness: args.weights.withTiming.errorAwareness,
        focusScore: args.weights.withTiming.focusScore,
      }
    : {
        timingDiscipline: 0,
        rtStability: args.weights.withoutTiming.rtStability,
        pressStability: args.weights.withoutTiming.pressStability,
        errorAwareness: args.weights.withoutTiming.errorAwareness,
        focusScore: args.weights.withoutTiming.focusScore,
      };

  // Press duration is not reliable / not available for pointer input (touch/mouse).
  // If we don't have enough eligible samples, zero-out the weight and renormalize.
  const eligiblePressSamples = countEligiblePressSamples(args.validResponses);
  const hasInputControl =
    (args.context?.misfireCount ?? 0) > 0 || (args.context?.duplicateCount ?? 0) > 0;

  const withMaybeDisabled: ConfidenceComponentWeights = {
    ...base,
    pressStability: eligiblePressSamples >= 3 || hasInputControl ? base.pressStability : 0,
    // Error awareness has an inhibition fallback when there are no errors.
    errorAwareness: base.errorAwareness,
  };

  return normalizeComponentWeights(withMaybeDisabled);
}

/**
 * Calculate ErrorAwareness based on Post-Error Slowing (PES).
 * If user slows down after an error, it indicates metacognitive awareness.
 */
function calculateErrorAwareness(
  responses: readonly TempoResponseData[],
  pesLookaheadTrials: number,
): number {
  if (responses.length === 0) return TEMPO_CONFIDENCE_NEUTRAL;

  const totalErrors = responses.filter(
    (r) => r.result === 'miss' || r.result === 'falseAlarm',
  ).length;

  const validActions = responses.filter(
    (r) => r.reactionTimeMs > 0 && (r.result === 'hit' || r.result === 'falseAlarm'),
  );
  const inhibition = calculateInhibitionScore(validActions);

  if (totalErrors === 0) return inhibition ?? TEMPO_CONFIDENCE_NEUTRAL;

  const { pesScore, recoveryScore } = computeErrorAwarenessSignals(responses, pesLookaheadTrials);
  const base =
    recoveryScore === null ? pesScore : Math.round(0.65 * pesScore + 0.35 * recoveryScore);
  const pesNotMeasurable = pesScore === TEMPO_CONFIDENCE_NEUTRAL && recoveryScore === null;
  if (pesNotMeasurable) return inhibition ?? TEMPO_CONFIDENCE_NEUTRAL;
  if (inhibition == null) return base;
  return Math.round(0.8 * base + 0.2 * inhibition);
}

function calculateInhibitionScore(actions: readonly TempoResponseData[]): number | null {
  if (actions.length < 5) return null;
  const falseAlarms = actions.filter((r) => r.result === 'falseAlarm').length;
  const frac = falseAlarms / Math.max(1, actions.length);
  const score = 100 * clamp(1 - frac / 0.2, 0, 1);
  return Math.round(score);
}

function computeErrorAwarenessSignals(
  responses: readonly TempoResponseData[],
  pesLookaheadTrials: number,
): { pesScore: number; recoveryScore: number | null } {
  const responsesByModality = new Map<string, TempoResponseData[]>();
  for (const response of responses) {
    const bucket = responsesByModality.get(response.modality);
    if (bucket) bucket.push(response);
    else responsesByModality.set(response.modality, [response]);
  }

  const pesScores: Array<{ score: number; pairs: number }> = [];
  const recoveryScores: Array<{ score: number; targets: number }> = [];

  for (const modalityResponses of responsesByModality.values()) {
    const sorted = [...modalityResponses].sort((a, b) => a.trialIndex - b.trialIndex);

    // PES
    const hitRTs: number[] = [];
    const postErrorRTs: number[] = [];
    let errorCount = 0;

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      if (!current) continue;

      if (current.result === 'hit' && isValidRT(current)) {
        hitRTs.push(adjustRTForMouseInput(current));
      }

      if (current.result === 'miss' || current.result === 'falseAlarm') {
        errorCount++;
        const maxTrialIndex = current.trialIndex + Math.max(1, pesLookaheadTrials);
        for (let j = i + 1; j < sorted.length; j++) {
          const next = sorted[j];
          if (!next) continue;
          if (next.trialIndex > maxTrialIndex) break;
          if (next.result === 'hit' && isValidRT(next)) {
            postErrorRTs.push(adjustRTForMouseInput(next));
            break;
          }
        }
      }
    }

    if (
      errorCount > 0 &&
      postErrorRTs.length >= TEMPO_PES_THRESHOLDS.minPairs &&
      hitRTs.length > 0 &&
      mean(hitRTs) > 0
    ) {
      const pesRatio = mean(postErrorRTs) / mean(hitRTs);
      const score =
        100 *
        clamp(
          (pesRatio - TEMPO_PES_THRESHOLDS.minRatio) /
            (TEMPO_PES_THRESHOLDS.maxRatio - TEMPO_PES_THRESHOLDS.minRatio),
          0,
          1,
        );
      pesScores.push({ score: Math.round(score), pairs: postErrorRTs.length });
    } else if (errorCount > 0) {
      pesScores.push({ score: TEMPO_CONFIDENCE_NEUTRAL, pairs: 0 });
    }

    // Recovery accuracy
    const errorTrials = sorted
      .filter((r) => r.result === 'miss' || r.result === 'falseAlarm')
      .map((r) => r.trialIndex);

    const targetOutcomeByTrial = new Map<number, 'hit' | 'miss'>();
    for (const r of sorted) {
      if (r.result === 'hit' || r.result === 'miss') {
        targetOutcomeByTrial.set(r.trialIndex, r.result);
      }
    }

    if (errorTrials.length >= 2 && targetOutcomeByTrial.size > 0) {
      const postErrorTargetTrials = new Set<number>();
      for (const e of errorTrials) {
        const max = e + Math.max(1, pesLookaheadTrials);
        for (let t = e + 1; t <= max; t++) {
          if (targetOutcomeByTrial.has(t)) postErrorTargetTrials.add(t);
        }
      }

      const allTargetTrials = [...targetOutcomeByTrial.keys()];
      const baselineTrials = allTargetTrials.filter((t) => !postErrorTargetTrials.has(t));
      const baselinePool = baselineTrials.length >= 5 ? baselineTrials : allTargetTrials;
      const baselineHits = baselinePool.filter((t) => targetOutcomeByTrial.get(t) === 'hit').length;
      const baselineRate = baselineHits / Math.max(1, baselinePool.length);

      const postTargets = [...postErrorTargetTrials];
      const postCount = postTargets.length;
      if (postCount >= 3) {
        const postHits = postTargets.filter((t) => targetOutcomeByTrial.get(t) === 'hit').length;
        const postRate = postHits / postCount;
        const absScore = 100 * clamp(postRate, 0, 1);
        const improvement = postRate - baselineRate;
        const impScore = 100 * clamp((improvement + 0.05) / 0.2, 0, 1);
        const score = Math.round(0.75 * absScore + 0.25 * impScore);
        recoveryScores.push({ score, targets: postCount });
      }
    }
  }

  const pesScore =
    pesScores.length === 0
      ? TEMPO_CONFIDENCE_NEUTRAL
      : Math.round(pesScores.reduce((acc, x) => acc + x.score, 0) / Math.max(1, pesScores.length));
  const recoveryScore =
    recoveryScores.length === 0
      ? null
      : Math.round(
          recoveryScores.reduce((acc, x) => acc + x.score, 0) / Math.max(1, recoveryScores.length),
        );
  return { pesScore, recoveryScore };
}

/**
 * Calculate FocusScore based on micro-lapse detection (PVT).
 * Lapses are RTs > 2.5x median RT.
 */
function calculateEngagementScore(allResponses: readonly TempoResponseData[]): number | null {
  const d = computeTargetNoActionDiagnostics(allResponses);
  if (d.targetTrials <= 0) return null;

  const noActionRate = d.targetTrialsNoAction / Math.max(1, d.targetTrials);
  let score = 100 * clamp(1 - noActionRate, 0, 1);

  const streak = d.targetTrialsNoActionMaxStreak;
  if (streak >= 3) {
    const extra = clamp((streak - 2) * 0.05, 0, 0.3);
    score = score * (1 - extra);
  }

  return Math.round(score);
}

function calculateFocusScore(
  validResponses: readonly TempoResponseData[],
  allResponses: readonly TempoResponseData[],
  context?: TempoConfidenceContext,
): number {
  const engagementScore = calculateEngagementScore(allResponses);

  const focusInterruptionsScore = (() => {
    const count = context?.focusLostCount;
    const totalMs = context?.focusLostTotalMs;
    if (count === undefined && totalMs === undefined) return null;
    const c = Math.max(0, count ?? 0);
    const ms = Math.max(0, totalMs ?? 0);
    const countPenalty = c * 15;
    const durationPenalty = (ms / 1000) * 5;
    return Math.round(Math.max(0, 100 - countPenalty - durationPenalty));
  })();

  const hits = validResponses.filter((r) => r.result === 'hit');
  const hitRTs = hits
    .map((r) => adjustRTForMouseInput(r))
    .filter((rt) => Number.isFinite(rt) && rt > 0);

  const microLapseScore = (() => {
    if (hitRTs.length < TEMPO_FOCUS_THRESHOLDS.minHits) return null;
    const medianRT = median(hitRTs);
    const lapseThreshold = medianRT * TEMPO_FOCUS_THRESHOLDS.lapseMultiplier;
    const lapseCount = hitRTs.filter((rt) => rt > lapseThreshold).length;
    const lapseRate = lapseCount / hitRTs.length;
    return Math.round(100 * clamp(1 - lapseRate, 0, 1));
  })();

  const parts: Array<{ score: number; w: number }> = [];
  if (microLapseScore !== null) parts.push({ score: microLapseScore, w: 0.55 });
  if (engagementScore !== null) parts.push({ score: engagementScore, w: 0.25 });
  if (focusInterruptionsScore !== null) parts.push({ score: focusInterruptionsScore, w: 0.2 });

  if (parts.length === 0) return TEMPO_CONFIDENCE_NEUTRAL;
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  const v = parts.reduce((s, p) => s + p.score * p.w, 0) / Math.max(1e-9, wSum);
  return Math.round(v);
}

// =============================================================================
// Debug Data Extraction
// =============================================================================

interface RawDebugData {
  totalResponses: number;
  responsesDuringStimulus: number;
  responsesAfterStimulus: number;
  rtCV: number | null;
  rtMean: number | null;
  pressCV: number | null;
  pressMean: number | null;
  pesRatio: number | null;
  pesErrorPairs: number;
  lapseCount: number;
  lapseHitsTotal: number;

  misfireCount?: number;
  duplicateCount?: number;
  pressStabilityKind?: 'pressDuration' | 'inputControl';

  // Engagement diagnostics
  targetTrials?: number;
  targetTrialsNoAction?: number;
  targetTrialsNoActionMaxStreak?: number;
  trialsWithAnyAction?: number;
}

function computeTargetNoActionDiagnostics(responses: readonly TempoResponseData[]): {
  targetTrials: number;
  targetTrialsNoAction: number;
  targetTrialsNoActionMaxStreak: number;
  trialsWithAnyAction: number;
} {
  type TrialAgg = { hasAction: boolean; hasTarget: boolean };
  const byTrial = new Map<number, TrialAgg>();

  for (const r of responses) {
    const t = byTrial.get(r.trialIndex) ?? { hasAction: false, hasTarget: false };
    if (r.result === 'hit' || r.result === 'miss') t.hasTarget = true;
    if (Number.isFinite(r.reactionTimeMs) && r.reactionTimeMs > 0) t.hasAction = true;
    byTrial.set(r.trialIndex, t);
  }

  const trialIndices = [...byTrial.keys()].sort((a, b) => a - b);
  let targetTrials = 0;
  let targetTrialsNoAction = 0;
  let trialsWithAnyAction = 0;
  let maxStreak = 0;
  let currentStreak = 0;

  for (const idx of trialIndices) {
    const t = byTrial.get(idx);
    if (!t) continue;

    if (t.hasAction) trialsWithAnyAction += 1;

    if (t.hasTarget) {
      targetTrials += 1;
      if (!t.hasAction) {
        targetTrialsNoAction += 1;
        currentStreak += 1;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    } else {
      currentStreak = 0;
    }
  }

  return {
    targetTrials,
    targetTrialsNoAction,
    targetTrialsNoActionMaxStreak: maxStreak,
    trialsWithAnyAction,
  };
}

/**
 * Extract raw debug data from responses for algorithm analysis.
 */
function extractRawDebugData(
  responses: readonly TempoResponseData[],
  validResponses: readonly TempoResponseData[],
  pesLookaheadTrials: number,
): RawDebugData {
  // Timing data
  const responsesDuringStimulus = validResponses.filter(
    (r) => r.responsePhase === 'during_stimulus',
  ).length;
  const responsesAfterStimulus = validResponses.filter(
    (r) => r.responsePhase === 'after_stimulus',
  ).length;

  // RT data (same sampling/corrections as RT stability)
  const rts = getRTSamplesForStability(validResponses);
  const rtCV = rts.length >= 3 ? coefficientOfVariation(rts) : null;
  const rtMean = rts.length > 0 ? mean(rts) : null;

  // Press duration data
  const pressDurations = validResponses
    .filter((r) => r.inputMethod !== 'mouse' && r.inputMethod !== 'touch')
    .map((r) => r.pressDurationMs)
    .filter((pd): pd is number => pd !== null && pd > 0);
  const pressCV = pressDurations.length >= 3 ? coefficientOfVariation(pressDurations) : null;
  const pressMean = pressDurations.length > 0 ? mean(pressDurations) : null;

  // PES data (aggregate across all modalities)
  let totalPesErrorPairs = 0;
  let totalPesRatioSum = 0;
  let modalitiesWithPes = 0;

  const responsesByModality = new Map<string, TempoResponseData[]>();
  for (const response of responses) {
    const bucket = responsesByModality.get(response.modality);
    if (bucket) {
      bucket.push(response);
    } else {
      responsesByModality.set(response.modality, [response]);
    }
  }

  for (const modalityResponses of responsesByModality.values()) {
    const sorted = [...modalityResponses].sort((a, b) => a.trialIndex - b.trialIndex);
    const hitRTs: number[] = [];
    const postErrorRTs: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      if (!current) continue;

      if (current.result === 'hit' && isValidRT(current)) {
        hitRTs.push(current.reactionTimeMs);
      }

      if (current.result === 'miss' || current.result === 'falseAlarm') {
        const maxTrialIndex = current.trialIndex + Math.max(1, pesLookaheadTrials);
        for (let j = i + 1; j < sorted.length; j++) {
          const next = sorted[j];
          if (!next) continue;
          if (next.trialIndex > maxTrialIndex) break;
          if (next.result === 'hit' && isValidRT(next)) {
            postErrorRTs.push(next.reactionTimeMs);
            break;
          }
        }
      }
    }

    totalPesErrorPairs += postErrorRTs.length;

    if (postErrorRTs.length >= TEMPO_PES_THRESHOLDS.minPairs && hitRTs.length > 0) {
      const avgRTCorrect = mean(hitRTs);
      const avgRTPostError = mean(postErrorRTs);
      if (avgRTCorrect > 0) {
        totalPesRatioSum += avgRTPostError / avgRTCorrect;
        modalitiesWithPes++;
      }
    }
  }

  const pesRatio = modalitiesWithPes > 0 ? totalPesRatioSum / modalitiesWithPes : null;

  // Focus/lapse data
  const hits = validResponses.filter((r) => r.result === 'hit');
  const hitRTs = hits.map((r) => r.reactionTimeMs).filter((rt) => rt > 0);
  let lapseCount = 0;

  if (hitRTs.length >= TEMPO_FOCUS_THRESHOLDS.minHits) {
    const medianRT = median(hitRTs);
    const lapseThreshold = medianRT * TEMPO_FOCUS_THRESHOLDS.lapseMultiplier;
    lapseCount = hitRTs.filter((rt) => rt > lapseThreshold).length;
  }

  const engagement = computeTargetNoActionDiagnostics(responses);

  return {
    totalResponses: validResponses.length,
    responsesDuringStimulus,
    responsesAfterStimulus,
    rtCV,
    rtMean,
    pressCV,
    pressMean,
    pesRatio,
    pesErrorPairs: totalPesErrorPairs,
    lapseCount,
    lapseHitsTotal: hitRTs.length,

    targetTrials: engagement.targetTrials,
    targetTrialsNoAction: engagement.targetTrialsNoAction,
    targetTrialsNoActionMaxStreak: engagement.targetTrialsNoActionMaxStreak,
    trialsWithAnyAction: engagement.trialsWithAnyAction,
  };
}

// =============================================================================
// Main Calculator
// =============================================================================

/**
 * JaeggiConfidenceCalculator
 *
 * Calculates confidence score for Jaeggi mode sessions.
 * Uses a conditional formula based on session accuracy.
 * Weights are read from spec if provided, otherwise from thresholds.ts defaults.
 */
export class JaeggiConfidenceCalculator {
  /**
   * Calculate the full JaeggiConfidence result from response data.
   *
   * @param responses - Array of response data from the session
   * @param accuracy - Session accuracy (0-1 range, e.g., 0.85 for 85%)
   * @param spec - Optional DualnbackClassicConfidenceSpec for spec-driven weights
   */
  static calculate(
    responses: readonly TempoResponseData[],
    accuracy: number,
    spec?: DualnbackClassicConfidenceSpec,
    context?: TempoConfidenceContext,
  ): JaeggiConfidenceResult {
    const validResponses = responses.filter(isValidRT);
    const hasEnoughData = validResponses.length >= UPS_MIN_TRIALS_FOR_CONFIDENCE;

    if (!hasEnoughData) {
      return {
        score: TEMPO_CONFIDENCE_NEUTRAL,
        components: {
          rtStability: TEMPO_CONFIDENCE_NEUTRAL,
          errorAwareness: TEMPO_CONFIDENCE_NEUTRAL,
          focusScore: TEMPO_CONFIDENCE_NEUTRAL,
          pressStability: TEMPO_CONFIDENCE_NEUTRAL,
          timingDiscipline: null,
        },
        hasEnoughData: false,
        timingPenaltyApplied: false,
        sessionAccuracy: accuracy,
      };
    }

    // Get weights from spec or defaults
    const weights = getJaeggiWeights(spec);
    const pesLookaheadTrials = getPesLookaheadTrials(spec);

    const pressSlot = calculatePressStabilitySlot({ validResponses, context });

    // Calculate base components (always computed)
    const rtStability = calculateRTStability(validResponses);
    const errorAwareness = calculateErrorAwareness(responses, pesLookaheadTrials);
    const focusScore = calculateFocusScore(validResponses, responses, context);
    const pressStability = pressSlot.score;

    // Determine if timing penalty should be applied
    const timingPenaltyApplied = accuracy < weights.accuracyThreshold;

    // Effective weights may disable press stability for pointer sessions
    const effectiveWeights = getEffectiveComponentWeights({
      timingPenaltyApplied,
      weights,
      validResponses,
      allResponses: responses,
      context,
    });

    const timingDiscipline = timingPenaltyApplied
      ? // accuracy < threshold: apply timing penalty
        calculateTimingDiscipline(validResponses)
      : // accuracy >= threshold: no timing penalty (player is fast AND good)
        null;

    const score = Math.round(
      rtStability * effectiveWeights.rtStability +
        errorAwareness * effectiveWeights.errorAwareness +
        focusScore * effectiveWeights.focusScore +
        pressStability * effectiveWeights.pressStability +
        (timingPenaltyApplied && timingDiscipline !== null
          ? timingDiscipline * effectiveWeights.timingDiscipline
          : 0),
    );

    return {
      score: clamp(score, 0, 100),
      components: {
        rtStability,
        errorAwareness,
        focusScore,
        pressStability,
        timingDiscipline,
      },
      hasEnoughData: true,
      timingPenaltyApplied,
      sessionAccuracy: accuracy,
    };
  }

  /**
   * Calculate confidence score only (without components).
   * Useful when you just need the final number.
   *
   * @param responses - Array of response data from the session
   * @param accuracy - Session accuracy (0-1 range, e.g., 0.85 for 85%)
   * @param spec - Optional DualnbackClassicConfidenceSpec for spec-driven weights
   */
  static calculateScore(
    responses: readonly TempoResponseData[],
    accuracy: number,
    spec?: DualnbackClassicConfidenceSpec,
    context?: TempoConfidenceContext,
  ): number | null {
    const result = JaeggiConfidenceCalculator.calculate(responses, accuracy, spec, context);
    if (!result.hasEnoughData) {
      return null;
    }
    return result.score;
  }

  /**
   * Calculate with full debug data for algorithm analysis.
   * Returns components + raw data used for each calculation.
   *
   * @param responses - Array of response data from the session
   * @param accuracy - Session accuracy (0-1 range, e.g., 0.85 for 85%)
   * @param spec - Optional DualnbackClassicConfidenceSpec for spec-driven weights
   */
  static calculateWithDebug(
    responses: readonly TempoResponseData[],
    accuracy: number,
    spec?: DualnbackClassicConfidenceSpec,
    context?: TempoConfidenceContext,
  ): TempoConfidenceDebug {
    const validResponses = responses.filter(isValidRT);
    const hasEnoughData = validResponses.length >= UPS_MIN_TRIALS_FOR_CONFIDENCE;

    // Get weights from spec or defaults
    const weights = getJaeggiWeights(spec);
    const pesLookaheadTrials = getPesLookaheadTrials(spec);

    const pressSlot = calculatePressStabilitySlot({ validResponses, context });

    // Calculate base components (always computed)
    const rtStability = hasEnoughData
      ? calculateRTStability(validResponses)
      : TEMPO_CONFIDENCE_NEUTRAL;
    const errorAwareness = hasEnoughData
      ? calculateErrorAwareness(responses, pesLookaheadTrials)
      : TEMPO_CONFIDENCE_NEUTRAL;
    const focusScore = hasEnoughData
      ? calculateFocusScore(validResponses, responses, context)
      : TEMPO_CONFIDENCE_NEUTRAL;
    const pressStability = hasEnoughData ? pressSlot.score : TEMPO_CONFIDENCE_NEUTRAL;

    // Determine if timing penalty should be applied
    const timingPenaltyApplied = accuracy < weights.accuracyThreshold;

    // TimingDiscipline is only relevant when penalty is applied
    const timingDiscipline =
      hasEnoughData && timingPenaltyApplied
        ? calculateTimingDiscipline(validResponses)
        : TEMPO_CONFIDENCE_NEUTRAL;

    const effectiveWeights = getEffectiveComponentWeights({
      timingPenaltyApplied,
      weights,
      validResponses,
      allResponses: responses,
      context,
    });

    let score: number;

    if (hasEnoughData) {
      score = Math.round(
        clamp(
          rtStability * effectiveWeights.rtStability +
            errorAwareness * effectiveWeights.errorAwareness +
            focusScore * effectiveWeights.focusScore +
            pressStability * effectiveWeights.pressStability +
            (timingPenaltyApplied ? timingDiscipline * effectiveWeights.timingDiscipline : 0),
          0,
          100,
        ),
      );
    } else {
      score = TEMPO_CONFIDENCE_NEUTRAL;
    }

    // Extract raw debug data
    const rawData = extractRawDebugData(responses, validResponses, pesLookaheadTrials);

    // Inhibition diagnostics (false-alarm fraction among actions)
    const actionRows = validResponses.filter(
      (r) => r.result === 'hit' || r.result === 'falseAlarm',
    );
    const actionCount = actionRows.length;
    const falseAlarmActions = actionRows.filter((r) => r.result === 'falseAlarm').length;
    const falseAlarmFraction = actionCount > 0 ? falseAlarmActions / actionCount : undefined;

    const totalErrors = responses.filter(
      (r) => r.result === 'miss' || r.result === 'falseAlarm',
    ).length;
    const inhibitionOnly = totalErrors === 0;
    const errorAwarenessKind: 'inhibition' | undefined = inhibitionOnly ? 'inhibition' : undefined;

    const rawWithContext = {
      ...rawData,
      misfireCount: context?.misfireCount,
      duplicateCount: context?.duplicateCount,
      pressStabilityKind: pressSlot.kind === 'none' ? undefined : pressSlot.kind,

      falseAlarmActions,
      actionCount,
      falseAlarmFraction,
      errorAwarenessKind,
    };

    return {
      score,
      hasEnoughData,
      weights: effectiveWeights,
      components: {
        timingDiscipline,
        rtStability,
        pressStability,
        errorAwareness,
        focusScore,
      },
      rawData: rawWithContext,
    };
  }
}
