/**
 * TempoConfidenceCalculator
 *
 * Calcule le score de confiance pour le mode Tempo à partir des réponses utilisateur.
 * Basé sur 5 sous-scores:
 * - TimingDiscipline: pénalise les réponses pendant le stimulus
 * - RTStability: stabilité des temps de réaction (CV)
 * - PressStability: stabilité des durées d'appui (CV) - SKIPPED for mouse input
 * - ErrorAwareness: Post-Error Slowing (PES)
 * - FocusScore: détection des micro-lapses (PVT)
 *
 * Formule: TempoConfidence = timing*0.35 + rtStability*0.2 + pressStability*0.2 + errorAwareness*0.2 + focusScore*0.05
 *
 * Mouse Input Adjustments:
 * - RT is adjusted by subtracting estimated cursor travel time
 * - Press duration stability returns neutral (meaningless for clicks)
 * - Second responses in dual-match trials are excluded from RT stability
 *
 * Les poids sont lus depuis la spec si fournie, sinon depuis thresholds.ts (defaults).
 */

import type {
  TempoConfidenceComponents,
  TempoConfidenceResult,
  TempoResponseData,
} from '../../types/ups';
import type { TempoConfidenceDebug } from '../../types/session-report';
import type { TempoConfidenceSpec } from '../../specs/types';
import {
  MOUSE_INPUT_THRESHOLDS,
  TEMPO_CONFIDENCE_NEUTRAL,
  TEMPO_CONFIDENCE_WEIGHTS,
  TEMPO_FOCUS_THRESHOLDS,
  TEMPO_PES_THRESHOLDS,
  TEMPO_STABILITY_THRESHOLDS,
  UPS_MIN_TRIALS_FOR_CONFIDENCE,
} from '../../types/ups';

export interface TempoConfidenceContext {
  /** Count of INPUT_MISFIRED events for this session */
  readonly misfireCount?: number;
  /** Count of DUPLICATE_RESPONSE_DETECTED events for this session */
  readonly duplicateCount?: number;
  /** Count of FOCUS_LOST events */
  readonly focusLostCount?: number;
  /** Total ms lost while unfocused (sum of FOCUS_REGAINED.lostDurationMs) */
  readonly focusLostTotalMs?: number;
}

// =============================================================================
// Spec-Driven Weights
// =============================================================================

/**
 * Tempo confidence weights structure (numeric values, not literal types).
 */
interface TempoWeights {
  readonly timingDiscipline: number;
  readonly rtStability: number;
  readonly pressStability: number;
  readonly errorAwareness: number;
  readonly focusScore: number;
}

/**
 * Get Tempo confidence weights from spec or defaults.
 */
function getTempoWeights(spec?: TempoConfidenceSpec): TempoWeights {
  if (spec) {
    return {
      timingDiscipline: spec.timingDiscipline,
      rtStability: spec.rtStability,
      pressStability: spec.pressStability,
      errorAwareness: spec.errorAwareness,
      focusScore: spec.focusScore,
    };
  }

  // Defaults from thresholds.ts
  return TEMPO_CONFIDENCE_WEIGHTS;
}

function getPesLookaheadTrials(spec?: TempoConfidenceSpec): number {
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

/**
 * Check if the majority of responses are from pointer input (mouse or touch).
 * Both have short, meaningless press durations unlike keyboard.
 */
function isMostlyPointerInput(responses: readonly TempoResponseData[]): boolean {
  if (responses.length === 0) return false;
  const pointerCount = responses.filter(
    (r) => r.inputMethod === 'mouse' || r.inputMethod === 'touch',
  ).length;
  return pointerCount / responses.length >= MOUSE_INPUT_THRESHOLDS.responseThreshold;
}

/**
 * Adjust RT for mouse input by subtracting estimated cursor travel time.
 * For non-mouse input, returns the original RT.
 *
 * Formula: adjustedRT = RT - (cursorTravelDistance / cursorSpeed)
 *
 * This accounts for the physical time needed to move the cursor from
 * its position at stimulus time to the button that was clicked.
 */
function adjustRTForMouseInput(response: TempoResponseData): number {
  if (response.inputMethod !== 'mouse') {
    return response.reactionTimeMs;
  }

  // If we have cursor travel distance, subtract estimated travel time
  if (response.cursorTravelDistance !== undefined && response.cursorTravelDistance > 0) {
    const estimatedTravelTimeMs =
      response.cursorTravelDistance / MOUSE_INPUT_THRESHOLDS.cursorSpeedPxPerMs;
    // Ensure RT doesn't go below a minimum threshold (50ms cognitive minimum)
    return Math.max(50, response.reactionTimeMs - estimatedTravelTimeMs);
  }

  // No adjustment if we don't have travel distance data
  return response.reactionTimeMs;
}

// =============================================================================
// Sub-score Calculators
// =============================================================================

function getRTSamplesForStability(responses: readonly TempoResponseData[]): number[] {
  // Use ONE RT sample per trial: the first user action in the trial.
  // This avoids mixing single-match trials with dual-match second responses,
  // which are expected to be slower due to sequential inputs (pointer or thumb).

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

    // Prefer the earliest responseIndexInTrial; break ties with lower RT.
    if (idx < existing.idx || (idx === existing.idx && rt < existing.rt)) {
      bestByTrial.set(r.trialIndex, { idx, rt });
    }
  }

  return [...bestByTrial.values()].map((x) => x.rt);
}

/**
 * Calculate TimingDiscipline: penalize early responses.
 * Higher = better (fewer responses during stimulus).
 */
function calculateTimingDiscipline(responses: readonly TempoResponseData[]): number {
  if (responses.length === 0) return TEMPO_CONFIDENCE_NEUTRAL; // Neutral

  const earlyCount = responses.filter((r) => r.responsePhase === 'during_stimulus').length;
  const earlyRate = earlyCount / responses.length;

  return Math.round(100 * clamp(1 - earlyRate, 0, 1));
}

/**
 * Calculate RTStability: stability of reaction times.
 * Lower CV = more stable = higher score.
 *
 * Pointer-aware adjustments:
 * - For mouse: Adjusts RT by subtracting estimated cursor travel time
 * - For mouse/touch: Excludes second responses in dual-match trials (responseIndexInTrial === 1)
 *   because these are expected to be faster (pointer already near buttons)
 * - For keyboard: Includes ALL responses (both keys can be pressed simultaneously)
 */
function calculateRTStability(responses: readonly TempoResponseData[]): number {
  const rts = getRTSamplesForStability(responses);

  if (rts.length < 3) return TEMPO_CONFIDENCE_NEUTRAL; // Neutral if not enough data

  const cv = coefficientOfVariation(rts);
  // Score: 100 * clamp(1 - cv / threshold, 0, 1)
  const score = 100 * clamp(1 - cv / TEMPO_STABILITY_THRESHOLDS.rtCv, 0, 1);

  return Math.round(score);
}

/**
 * Calculate PressStability: stability of press durations.
 * Lower CV = more stable = higher score.
 *
 * Pointer-aware: Returns neutral if most responses are mouse/touch input,
 * because press duration is meaningless for clicks and taps.
 */
function calculatePressDurationStability(
  validResponses: readonly TempoResponseData[],
): number | null {
  const pressDurations = validResponses
    .filter((r) => r.inputMethod !== 'mouse' && r.inputMethod !== 'touch')
    .map((r) => r.pressDurationMs)
    .filter((pd): pd is number => pd !== null && pd > 0);

  if (pressDurations.length < 3) return null;

  const cv = coefficientOfVariation(pressDurations);
  const score = 100 * clamp(1 - cv / TEMPO_STABILITY_THRESHOLDS.pressCv, 0, 1);
  return Math.round(score);
}

function calculateInputControlScore(args: {
  readonly validResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): number | null {
  if (!args.context) return null;
  const misfires = args.context?.misfireCount ?? 0;
  const duplicates = args.context?.duplicateCount ?? 0;

  // Normalize by action count (valid RT responses). Misfires/duplicates are "extra" actions.
  const actions = Math.max(1, args.validResponses.length);
  const misfireRate = misfires / actions;
  const duplicateRate = duplicates / actions;

  // Simple, explainable penalty: misfires hurt more than duplicates.
  const penalty = 1.4 * misfireRate + 0.8 * duplicateRate;
  const worst = 0.25; // 25% noisy actions => 0
  const score = 100 * clamp(1 - penalty / worst, 0, 1);
  return Math.round(score);
}

function calculatePressStabilitySlot(args: {
  readonly validResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): { score: number; kind: 'pressDuration' | 'inputControl' | 'none' } {
  const pressStability = calculatePressDurationStability(args.validResponses);
  if (pressStability !== null && !isMostlyPointerInput(args.validResponses)) {
    return { score: pressStability, kind: 'pressDuration' };
  }

  const inputControl = calculateInputControlScore(args);
  if (inputControl !== null) {
    return { score: inputControl, kind: 'inputControl' };
  }

  return { score: TEMPO_CONFIDENCE_NEUTRAL, kind: 'none' };
}

/**
 * Calculate ErrorAwareness based on Post-Error Slowing (PES).
 * If user slows down after an error, it indicates metacognitive awareness.
 *
 * Special cases:
 * - No errors: Not measurable (returns neutral; should be excluded via effective weights)
 * - Few errors (< minPairs): Returns neutral (not enough data to measure)
 */
function isValidRT(response: TempoResponseData): boolean {
  return (
    Number.isFinite(response.reactionTimeMs) &&
    response.reactionTimeMs > 0 &&
    // pressDurationMs is optional/meaningless for pointer input; RT validity should not depend on it.
    true
  );
}

function calculateErrorAwareness(
  responses: readonly TempoResponseData[],
  pesLookaheadTrials: number,
): number {
  if (responses.length === 0) return TEMPO_CONFIDENCE_NEUTRAL;

  const actions = responses.filter(
    (r) => r.reactionTimeMs > 0 && (r.result === 'hit' || r.result === 'falseAlarm'),
  );
  const inhibition = calculateInhibitionScore(actions);

  const totalErrors = responses.filter(
    (r) => r.result === 'miss' || r.result === 'falseAlarm',
  ).length;

  // No errors: measure restraint (avoid false alarms) instead of PES.
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

    // --- PES ---
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
      // Errors exist but PES not measurable => neutral.
      pesScores.push({ score: TEMPO_CONFIDENCE_NEUTRAL, pairs: 0 });
    }

    // --- Recovery accuracy ---
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

        // Score is mostly absolute post-error performance, with a small bonus for improvement.
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

function normalizeTempoWeights(weights: TempoWeights): TempoWeights {
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

function countTotalErrors(responses: readonly TempoResponseData[]): number {
  return responses.filter((r) => r.result === 'miss' || r.result === 'falseAlarm').length;
}

function countEligiblePressSamples(responses: readonly TempoResponseData[]): number {
  return responses
    .filter((r) => r.inputMethod !== 'mouse' && r.inputMethod !== 'touch')
    .map((r) => r.pressDurationMs)
    .filter((pd): pd is number => pd !== null && pd > 0).length;
}

function getEffectiveTempoWeights(args: {
  readonly weights: TempoWeights;
  readonly allResponses: readonly TempoResponseData[];
  readonly validResponses: readonly TempoResponseData[];
  readonly context?: TempoConfidenceContext;
}): TempoWeights {
  const base: TempoWeights = {
    timingDiscipline: args.weights.timingDiscipline,
    rtStability: args.weights.rtStability,
    pressStability: args.weights.pressStability,
    errorAwareness: args.weights.errorAwareness,
    focusScore: args.weights.focusScore,
  };

  const eligiblePressSamples = countEligiblePressSamples(args.validResponses);

  const withMaybeDisabled: TempoWeights = {
    ...base,
    // Error awareness has an inhibition fallback (false-alarm restraint) when there are no errors.
    errorAwareness: base.errorAwareness,
    pressStability: (() => {
      const hasPressDuration =
        !isMostlyPointerInput(args.validResponses) && eligiblePressSamples >= 3;
      const hasInputControl = args.context != null;
      return hasPressDuration || hasInputControl ? base.pressStability : 0;
    })(),
  };

  const normalized = normalizeTempoWeights(withMaybeDisabled);
  return normalized;
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

  // Extra penalty for long streaks of "target trials with no action".
  const streak = d.targetTrialsNoActionMaxStreak;
  if (streak >= 3) {
    const extra = clamp((streak - 2) * 0.05, 0, 0.3); // up to -30%
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
    // Simple penalty: losing focus is very meaningful.
    const countPenalty = c * 15;
    const durationPenalty = (ms / 1000) * 5;
    return Math.round(Math.max(0, 100 - countPenalty - durationPenalty));
  })();

  // Only consider hits for micro-lapse detection.
  const hits = validResponses.filter((r) => r.result === 'hit');
  const hitRTs = hits
    .map((r) => adjustRTForMouseInput(r))
    .filter((rt) => Number.isFinite(rt) && rt > 0);

  const hasLapseData = hitRTs.length >= TEMPO_FOCUS_THRESHOLDS.minHits;
  const microLapseScore = (() => {
    if (!hasLapseData) return null;
    const medianRT = median(hitRTs);
    const lapseThreshold = medianRT * TEMPO_FOCUS_THRESHOLDS.lapseMultiplier;
    const lapseCount = hitRTs.filter((rt) => rt > lapseThreshold).length;
    const lapseRate = lapseCount / hitRTs.length;
    return Math.round(100 * clamp(1 - lapseRate, 0, 1));
  })();

  // Blend signals, with graceful fallbacks.
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
// Debug Data Extractors
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

  baselineHitRate?: number;
  postErrorHitRate?: number;
  postErrorTargetCount?: number;

  falseAlarmActions?: number;
  actionCount?: number;
  falseAlarmFraction?: number;
  errorAwarenessKind?: 'pes' | 'recovery' | 'inhibition' | 'mixed';

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
  type TrialAgg = { hasAction: boolean; hasTarget: boolean; hasMiss: boolean };
  const byTrial = new Map<number, TrialAgg>();

  for (const r of responses) {
    const t = byTrial.get(r.trialIndex) ?? { hasAction: false, hasTarget: false, hasMiss: false };
    // Target evidence: hit or miss implies a target existed in that modality.
    if (r.result === 'hit' || r.result === 'miss') t.hasTarget = true;
    if (r.result === 'miss') t.hasMiss = true;
    // Action evidence: any user action yields an RT > 0.
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
      // Non-target trial: reset streak (we only care about consecutive missed target trials)
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

  // Press duration data (ignore pointer)
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

  // Focus/lapse data (use the same adjusted RT sampling as focus score)
  const hits = validResponses.filter((r) => r.result === 'hit');
  const hitRTs = hits
    .map((r) => adjustRTForMouseInput(r))
    .filter((rt) => Number.isFinite(rt) && rt > 0);
  let lapseCount = 0;
  if (hitRTs.length >= TEMPO_FOCUS_THRESHOLDS.minHits) {
    const medianRT = median(hitRTs);
    const lapseThreshold = medianRT * TEMPO_FOCUS_THRESHOLDS.lapseMultiplier;
    lapseCount = hitRTs.filter((rt) => rt > lapseThreshold).length;
  }

  // Recovery accuracy diagnostics (post-error hit rate vs baseline)
  const recoveryDiag = computeRecoveryDiagnostics(responses, pesLookaheadTrials);

  // Inhibition diagnostics (false-alarm fraction among actions)
  const actionRows = validResponses.filter((r) => r.result === 'hit' || r.result === 'falseAlarm');
  const actionCount = actionRows.length;
  const falseAlarmActions = actionRows.filter((r) => r.result === 'falseAlarm').length;
  const falseAlarmFraction = actionCount > 0 ? falseAlarmActions / actionCount : null;

  const totalErrors = countTotalErrors(responses);
  const inhibitionOnly =
    totalErrors === 0 ||
    (totalErrors > 0 &&
      totalPesErrorPairs < TEMPO_PES_THRESHOLDS.minPairs &&
      recoveryDiag.postErrorHitRate == null);

  const errorAwarenessKind: RawDebugData['errorAwarenessKind'] = inhibitionOnly
    ? 'inhibition'
    : recoveryDiag.postErrorHitRate != null
      ? 'mixed'
      : 'pes';

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

    baselineHitRate: recoveryDiag.baselineHitRate ?? undefined,
    postErrorHitRate: recoveryDiag.postErrorHitRate ?? undefined,
    postErrorTargetCount: recoveryDiag.postErrorTargetCount,

    falseAlarmActions,
    actionCount,
    falseAlarmFraction: falseAlarmFraction ?? undefined,
    errorAwarenessKind,

    targetTrials: engagement.targetTrials,
    targetTrialsNoAction: engagement.targetTrialsNoAction,
    targetTrialsNoActionMaxStreak: engagement.targetTrialsNoActionMaxStreak,
    trialsWithAnyAction: engagement.trialsWithAnyAction,
  };
}

function computeRecoveryDiagnostics(
  responses: readonly TempoResponseData[],
  lookaheadTrials: number,
): {
  baselineHitRate: number | null;
  postErrorHitRate: number | null;
  postErrorTargetCount: number;
} {
  const byModality = new Map<string, TempoResponseData[]>();
  for (const r of responses) {
    const arr = byModality.get(r.modality);
    if (arr) arr.push(r);
    else byModality.set(r.modality, [r]);
  }

  let baselineHits = 0;
  let baselineTotal = 0;
  let postHits = 0;
  let postTotal = 0;

  for (const modalityResponses of byModality.values()) {
    const sorted = [...modalityResponses].sort((a, b) => a.trialIndex - b.trialIndex);
    const errorTrials = sorted
      .filter((r) => r.result === 'miss' || r.result === 'falseAlarm')
      .map((r) => r.trialIndex);

    const targetOutcomeByTrial = new Map<number, 'hit' | 'miss'>();
    for (const r of sorted) {
      if (r.result === 'hit' || r.result === 'miss') {
        targetOutcomeByTrial.set(r.trialIndex, r.result);
      }
    }

    if (targetOutcomeByTrial.size === 0) continue;

    const postErrorTargetTrials = new Set<number>();
    for (const e of errorTrials) {
      const max = e + Math.max(1, lookaheadTrials);
      for (let t = e + 1; t <= max; t++) {
        if (targetOutcomeByTrial.has(t)) postErrorTargetTrials.add(t);
      }
    }

    const allTargetTrials = [...targetOutcomeByTrial.keys()];
    const baselineTrials = allTargetTrials.filter((t) => !postErrorTargetTrials.has(t));
    const baselinePool = baselineTrials.length >= 5 ? baselineTrials : allTargetTrials;

    for (const t of baselinePool) {
      baselineTotal += 1;
      if (targetOutcomeByTrial.get(t) === 'hit') baselineHits += 1;
    }

    for (const t of postErrorTargetTrials) {
      postTotal += 1;
      if (targetOutcomeByTrial.get(t) === 'hit') postHits += 1;
    }
  }

  const baselineHitRate = baselineTotal > 0 ? baselineHits / baselineTotal : null;
  const postErrorHitRate = postTotal >= 3 ? postHits / postTotal : null;
  return { baselineHitRate, postErrorHitRate, postErrorTargetCount: postTotal };
}

// =============================================================================
// Main Calculator
// =============================================================================

/**
 * TempoConfidenceCalculator
 *
 * Calculates confidence score for Tempo mode sessions.
 * Weights are read from spec if provided, otherwise from thresholds.ts defaults.
 */
export class TempoConfidenceCalculator {
  /**
   * Calculate the full TempoConfidence result from response data.
   *
   * @param responses - Array of response data from the session
   * @param spec - Optional TempoConfidenceSpec for spec-driven weights
   */
  static calculate(
    responses: readonly TempoResponseData[],
    spec?: TempoConfidenceSpec,
    context?: TempoConfidenceContext,
  ): TempoConfidenceResult {
    const validResponses = responses.filter(isValidRT);
    const hasEnoughData = validResponses.length >= UPS_MIN_TRIALS_FOR_CONFIDENCE;

    if (!hasEnoughData) {
      return {
        score: TEMPO_CONFIDENCE_NEUTRAL, // Neutral when insufficient data
        components: {
          timingDiscipline: TEMPO_CONFIDENCE_NEUTRAL,
          rtStability: TEMPO_CONFIDENCE_NEUTRAL,
          pressStability: TEMPO_CONFIDENCE_NEUTRAL,
          errorAwareness: TEMPO_CONFIDENCE_NEUTRAL,
          focusScore: TEMPO_CONFIDENCE_NEUTRAL,
        },
        hasEnoughData: false,
      };
    }

    // Get weights from spec or defaults
    const weights = getEffectiveTempoWeights({
      weights: getTempoWeights(spec),
      allResponses: responses,
      validResponses,
      context,
    });
    const pesLookaheadTrials = getPesLookaheadTrials(spec);

    const pressSlot = calculatePressStabilitySlot({ validResponses, context });

    // Calculate all sub-scores
    const components: TempoConfidenceComponents = {
      timingDiscipline: calculateTimingDiscipline(validResponses),
      rtStability: calculateRTStability(validResponses),
      pressStability: pressSlot.score,
      errorAwareness: calculateErrorAwareness(responses, pesLookaheadTrials),
      focusScore: calculateFocusScore(validResponses, responses, context),
    };

    // Aggregate with weights
    const score = Math.round(
      components.timingDiscipline * weights.timingDiscipline +
        components.rtStability * weights.rtStability +
        components.pressStability * weights.pressStability +
        components.errorAwareness * weights.errorAwareness +
        components.focusScore * weights.focusScore,
    );

    return {
      score: clamp(score, 0, 100),
      components,
      hasEnoughData: true,
    };
  }

  /**
   * Calculate confidence score only (without components).
   * Useful when you just need the final number.
   *
   * @param responses - Array of response data from the session
   * @param spec - Optional TempoConfidenceSpec for spec-driven weights
   */
  static calculateScore(
    responses: readonly TempoResponseData[],
    spec?: TempoConfidenceSpec,
    context?: TempoConfidenceContext,
  ): number | null {
    const result = TempoConfidenceCalculator.calculate(responses, spec, context);
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
   * @param spec - Optional TempoConfidenceSpec for spec-driven weights
   */
  static calculateWithDebug(
    responses: readonly TempoResponseData[],
    spec?: TempoConfidenceSpec,
    context?: TempoConfidenceContext,
  ): TempoConfidenceDebug {
    const validResponses = responses.filter(isValidRT);
    const hasEnoughData = validResponses.length >= UPS_MIN_TRIALS_FOR_CONFIDENCE;

    // Get weights from spec or defaults (then disable components that are not measurable)
    const weights = getEffectiveTempoWeights({
      weights: getTempoWeights(spec),
      allResponses: responses,
      validResponses,
      context,
    });
    const pesLookaheadTrials = getPesLookaheadTrials(spec);

    const pressSlot = calculatePressStabilitySlot({ validResponses, context });

    // Calculate all sub-scores
    const components = {
      timingDiscipline: hasEnoughData
        ? calculateTimingDiscipline(validResponses)
        : TEMPO_CONFIDENCE_NEUTRAL,
      rtStability: hasEnoughData ? calculateRTStability(validResponses) : TEMPO_CONFIDENCE_NEUTRAL,
      pressStability: hasEnoughData ? pressSlot.score : TEMPO_CONFIDENCE_NEUTRAL,
      errorAwareness: hasEnoughData
        ? calculateErrorAwareness(responses, pesLookaheadTrials)
        : TEMPO_CONFIDENCE_NEUTRAL,
      focusScore: hasEnoughData
        ? calculateFocusScore(validResponses, responses, context)
        : TEMPO_CONFIDENCE_NEUTRAL,
    };

    // Aggregate with weights
    const score = hasEnoughData
      ? Math.round(
          clamp(
            components.timingDiscipline * weights.timingDiscipline +
              components.rtStability * weights.rtStability +
              components.pressStability * weights.pressStability +
              components.errorAwareness * weights.errorAwareness +
              components.focusScore * weights.focusScore,
            0,
            100,
          ),
        )
      : TEMPO_CONFIDENCE_NEUTRAL;

    // Extract raw debug data
    const rawData = extractRawDebugData(responses, validResponses, pesLookaheadTrials);

    const rawWithContext = {
      ...rawData,
      misfireCount: context?.misfireCount,
      duplicateCount: context?.duplicateCount,
      pressStabilityKind: pressSlot.kind === 'none' ? undefined : pressSlot.kind,
      focusLostCount: context?.focusLostCount,
      focusLostTotalMs: context?.focusLostTotalMs,
    };

    return {
      score,
      hasEnoughData,
      weights,
      components,
      rawData: rawWithContext,
    };
  }
}
