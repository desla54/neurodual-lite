/**
 * Predefined Progression Rulesets
 *
 * Each ruleset is a pure data object describing how a protocol
 * evaluates progression. Adding a new protocol = adding a new
 * constant here. The engine code never changes.
 */

import {
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  BW_STRIKES_TO_DOWN,
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
} from '../../specs/thresholds';
import type { ProgressionRuleset } from './progression-engine';

/**
 * Jaeggi 2008 protocol.
 *
 * - Metric: error count (misses + false alarms) per modality
 * - Up:   ALL modalities < 3 errors  (worst modality < 3)
 * - Down: ANY modality > 5 errors    (worst modality > 5)
 * - Stay: otherwise
 * - No strike system
 */
export const JAEGGI_RULESET: ProgressionRuleset = {
  id: 'jaeggi',
  metric: 'error-count',
  evaluation: 'per-modality-worst',
  zones: {
    up: { op: 'below', value: JAEGGI_MAX_ERRORS_PER_MODALITY },
    down: { op: 'above', value: JAEGGI_ERRORS_DOWN },
  },
  strikes: null,
};

/**
 * Brain Workshop protocol.
 *
 * - Metric: score% = hits / (hits + misses + FA) × 100 (integer, floor)
 * - Up:   score ≥ 80%
 * - Down: score < 50% → strike. 3 strikes → forced down.
 * - Stay: 50–79% (strikes NOT reset — BW original behavior)
 *
 * Strikes reset ONLY on level change (up or down), never on clean sessions.
 */
export const BW_RULESET: ProgressionRuleset = {
  id: 'brainworkshop',
  metric: 'score-percent',
  evaluation: 'global',
  zones: {
    up: { op: 'atOrAbove', value: BW_SCORE_UP_PERCENT },
    down: { op: 'below', value: BW_SCORE_DOWN_PERCENT },
  },
  strikes: {
    triggerZone: 'down',
    count: BW_STRIKES_TO_DOWN,
    resetOn: 'level-change',
  },
};

/**
 * Accuracy-based protocol (Dual Track, Dual Pick, etc.).
 *
 * - Metric: standard accuracy = (hits + CR) / (H + M + FA + CR) × 100
 * - Up:   accuracy ≥ 80%
 * - Down: never (threshold below 0 — accuracy-based modes don't regress)
 * - No strike system
 */
export const ACCURACY_RULESET: ProgressionRuleset = {
  id: 'accuracy',
  metric: 'accuracy',
  evaluation: 'global',
  zones: {
    up: { op: 'atOrAbove', value: ACCURACY_PASS_NORMALIZED * 100 },
    down: { op: 'below', value: 0 },
  },
  strikes: null,
};

/**
 * Trace accuracy protocol (lower threshold).
 *
 * - Metric: standard accuracy
 * - Up:   accuracy ≥ 70%
 * - Down: never
 * - No strike system
 */
export const TRACE_ACCURACY_RULESET: ProgressionRuleset = {
  id: 'trace-accuracy',
  metric: 'accuracy',
  evaluation: 'global',
  zones: {
    up: { op: 'atOrAbove', value: TRACE_ACCURACY_PASS_NORMALIZED * 100 },
    down: { op: 'below', value: 0 },
  },
  strikes: null,
};
