/**
 * Declarative Progression Engine
 *
 * Evaluates session performance against a ProgressionRuleset (data)
 * to produce a zone classification (up/stay/down) with optional
 * strike accumulation.
 *
 * The engine is generic — it doesn't know about Jaeggi, Brain Workshop,
 * or any specific protocol. Adding a new protocol = adding a new ruleset
 * object, not modifying the engine.
 */

// =============================================================================
// Types — Ruleset (the "what")
// =============================================================================

export type MetricKind = 'error-count' | 'score-percent' | 'accuracy';

/**
 * How to aggregate per-modality metrics into a single decisive value.
 * - 'per-modality-worst': use the worst (max errors / min score) across modalities
 * - 'global': aggregate all modalities into one metric
 */
export type EvaluationMode = 'per-modality-worst' | 'global';

export type ThresholdCondition =
  | { readonly op: 'below'; readonly value: number }
  | { readonly op: 'above'; readonly value: number }
  | { readonly op: 'atOrAbove'; readonly value: number }
  | { readonly op: 'atOrBelow'; readonly value: number };

export interface StrikeConfig {
  /** Which raw zone triggers strike accumulation */
  readonly triggerZone: 'down';
  /** Number of consecutive strikes before forced down */
  readonly count: number;
  /**
   * When to reset the strike counter:
   * - 'clean': reset on any non-trigger-zone session (stay or up)
   * - 'level-change': reset ONLY on actual level change (up or down)
   *   This is the Brain Workshop original behavior.
   */
  readonly resetOn: 'clean' | 'level-change';
}

export interface ProgressionRuleset {
  readonly id: string;
  readonly metric: MetricKind;
  readonly evaluation: EvaluationMode;
  readonly zones: {
    readonly up: ThresholdCondition;
    readonly down: ThresholdCondition;
  };
  readonly strikes: StrikeConfig | null;
}

// =============================================================================
// Types — Input / Output
// =============================================================================

export interface ModalityMetrics {
  readonly hits?: number | null;
  readonly misses?: number | null;
  readonly falseAlarms?: number | null;
  readonly correctRejections?: number | null;
}

export interface SessionMetricsInput {
  readonly byModality: Readonly<Record<string, ModalityMetrics>>;
  readonly activeModalities: readonly string[];
}

export interface EngineProgressionState {
  readonly consecutiveStrikes: number;
}

export type ProgressionZone = 'up' | 'stay' | 'down';

export interface ModalityResult {
  readonly modalityId: string;
  readonly value: number;
  readonly zone: ProgressionZone;
}

export interface StrikeResult {
  /** Strikes AFTER this session (0 if triggered or reset) */
  readonly current: number;
  /** Total strikes needed for forced down */
  readonly total: number;
  /** Whether this session triggered the forced down */
  readonly triggered: boolean;
}

export interface ProgressionEngineResult {
  readonly zone: ProgressionZone;
  readonly metricValue: number;
  readonly perModality: readonly ModalityResult[] | null;
  readonly strikes: StrikeResult | null;
  readonly newState: EngineProgressionState;
}

// =============================================================================
// Engine internals
// =============================================================================

const EMPTY_STATE: EngineProgressionState = { consecutiveStrikes: 0 };

export function checkThreshold(value: number, condition: ThresholdCondition): boolean {
  switch (condition.op) {
    case 'below':
      return value < condition.value;
    case 'above':
      return value > condition.value;
    case 'atOrAbove':
      return value >= condition.value;
    case 'atOrBelow':
      return value <= condition.value;
  }
}

function classifyZone(value: number, zones: ProgressionRuleset['zones']): ProgressionZone {
  if (checkThreshold(value, zones.up)) return 'up';
  if (checkThreshold(value, zones.down)) return 'down';
  return 'stay';
}

function extractErrorCount(metrics: SessionMetricsInput): {
  global: number;
  perModality: { id: string; value: number }[];
} {
  const perModality = metrics.activeModalities.map((id) => {
    const stats = metrics.byModality[id];
    const value = stats ? (stats.misses ?? 0) + (stats.falseAlarms ?? 0) : 0;
    return { id, value };
  });
  const global = perModality.reduce((max, m) => Math.max(max, m.value), 0);
  return { global, perModality };
}

function extractScorePercent(metrics: SessionMetricsInput): {
  global: number;
  perModality: { id: string; value: number }[];
} {
  let totalH = 0;
  let totalM = 0;
  let totalFA = 0;
  for (const stats of Object.values(metrics.byModality)) {
    totalH += stats.hits ?? 0;
    totalM += stats.misses ?? 0;
    totalFA += stats.falseAlarms ?? 0;
  }
  const denom = totalH + totalM + totalFA;
  const score = denom === 0 ? 0 : Math.floor((totalH * 100) / denom);
  return { global: score, perModality: [] };
}

function extractAccuracy(metrics: SessionMetricsInput): {
  global: number;
  perModality: { id: string; value: number }[];
} {
  let totalH = 0;
  let totalM = 0;
  let totalFA = 0;
  let totalCR = 0;
  for (const stats of Object.values(metrics.byModality)) {
    totalH += stats.hits ?? 0;
    totalM += stats.misses ?? 0;
    totalFA += stats.falseAlarms ?? 0;
    totalCR += stats.correctRejections ?? 0;
  }
  const denom = totalH + totalM + totalFA + totalCR;
  const accuracy = denom === 0 ? 0 : Math.floor(((totalH + totalCR) * 100) / denom);
  return { global: accuracy, perModality: [] };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Evaluate a session's performance against a ruleset.
 *
 * @param metrics - Session performance data (hits/misses/FA per modality)
 * @param ruleset - Declarative rules (thresholds, strike config)
 * @param state   - Accumulated state from previous sessions (strikes)
 * @returns Zone classification + explanation data + updated state
 */
export function evaluateProgression(
  metrics: SessionMetricsInput,
  ruleset: ProgressionRuleset,
  state: EngineProgressionState = EMPTY_STATE,
): ProgressionEngineResult {
  // 1. Extract metric
  const extracted =
    ruleset.metric === 'error-count'
      ? extractErrorCount(metrics)
      : ruleset.metric === 'accuracy'
        ? extractAccuracy(metrics)
        : extractScorePercent(metrics);

  // 2. Decisive value
  const metricValue = extracted.global;

  // 3. Raw zone classification
  const rawZone = classifyZone(metricValue, ruleset.zones);

  // 4. Per-modality breakdown (only for per-modality-worst evaluation)
  const perModality =
    ruleset.evaluation === 'per-modality-worst'
      ? extracted.perModality.map((m) => ({
          modalityId: m.id,
          value: m.value,
          zone: classifyZone(m.value, ruleset.zones),
        }))
      : null;

  // 5. Strike accumulation
  if (!ruleset.strikes) {
    return {
      zone: rawZone,
      metricValue,
      perModality,
      strikes: null,
      newState: EMPTY_STATE,
    };
  }

  const strikeCfg = ruleset.strikes;
  let zone: ProgressionZone = rawZone;
  let newStrikes = state.consecutiveStrikes;
  let triggered = false;

  if (rawZone === 'up') {
    // Level change up → always reset strikes
    newStrikes = 0;
  } else if (rawZone === 'down') {
    // In the trigger zone → accumulate
    newStrikes++;
    if (newStrikes >= strikeCfg.count) {
      // Enough strikes → forced down + reset
      zone = 'down';
      triggered = true;
      newStrikes = 0;
    } else {
      // Not enough strikes yet → demote to stay
      zone = 'stay';
    }
  } else {
    // Stay zone
    if (strikeCfg.resetOn === 'clean') {
      newStrikes = 0;
    }
    // 'level-change' → keep strikes as-is (BW original behavior)
  }

  return {
    zone,
    metricValue,
    perModality,
    strikes: {
      current: newStrikes,
      total: strikeCfg.count,
      triggered,
    },
    newState: { consecutiveStrikes: newStrikes },
  };
}
