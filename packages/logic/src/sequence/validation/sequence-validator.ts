/**
 * SequenceValidator - Validation statistique des séquences générées
 *
 * Vérifie :
 * - Proportions de targets/lures dans la plage attendue
 * - Absence de patterns détectables
 * - Respect des contraintes
 * - Diversité des valeurs
 */

import {
  GEN_TARGET_PROBABILITY_DEFAULT,
  SEQUENCE_VALIDATION_TOLERANCE,
  SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME,
  SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS,
  SEQUENCE_VALIDATION_MIN_DIVERSITY_RATIO,
} from '../../specs/thresholds';
import type { Constraint, GeneratedTrial, ModalityId, SequenceSpec } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Statistiques pour une modalité.
 */
export interface ModalityStats {
  readonly modalityId: ModalityId;
  readonly totalTrials: number;
  readonly targetCount: number;
  readonly lureN1Count: number;
  readonly lureN2Count: number;
  readonly neutralCount: number;
  readonly targetRate: number;
  readonly lureN1Rate: number;
  readonly lureN2Rate: number;
  readonly uniqueValues: number;
  readonly maxConsecutiveSameValue: number;
  readonly maxConsecutiveTargets: number;
}

/**
 * Résultat de la validation.
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly stats: Record<ModalityId, ModalityStats>;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Problème détecté lors de la validation.
 */
export interface ValidationIssue {
  readonly severity: 'warning' | 'error';
  readonly type: ValidationIssueType;
  readonly message: string;
  readonly modalityId?: ModalityId;
  readonly details?: Record<string, unknown>;
}

export type ValidationIssueType =
  | 'target-rate-too-low'
  | 'target-rate-too-high'
  | 'lure-rate-out-of-range'
  | 'low-diversity'
  | 'consecutive-same-value'
  | 'consecutive-targets'
  | 'constraint-violation';

// =============================================================================
// Statistics Calculation
// =============================================================================

/**
 * Calcule les statistiques pour une modalité.
 */
function calculateModalityStats(
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
): ModalityStats {
  let targetCount = 0;
  let lureN1Count = 0;
  let lureN2Count = 0;
  let neutralCount = 0;
  const valueSet = new Set<number | string>();
  let maxConsecutiveSameValue = 0;
  let currentConsecutiveSameValue = 0;
  let lastValue: number | string | undefined;
  let maxConsecutiveTargets = 0;
  let currentConsecutiveTargets = 0;

  for (const trial of history) {
    const mv = trial.values[modalityId];
    if (!mv) continue;

    // Count intentions
    switch (mv.intention) {
      case 'target':
        targetCount++;
        currentConsecutiveTargets++;
        maxConsecutiveTargets = Math.max(maxConsecutiveTargets, currentConsecutiveTargets);
        break;
      case 'lure-n-1':
        lureN1Count++;
        currentConsecutiveTargets = 0;
        break;
      case 'lure-n+1':
        lureN2Count++;
        currentConsecutiveTargets = 0;
        break;
      default:
        neutralCount++;
        currentConsecutiveTargets = 0;
    }

    // Track values
    valueSet.add(mv.value);

    // Track consecutive same values
    if (mv.value === lastValue) {
      currentConsecutiveSameValue++;
      maxConsecutiveSameValue = Math.max(maxConsecutiveSameValue, currentConsecutiveSameValue);
    } else {
      currentConsecutiveSameValue = 1;
    }
    lastValue = mv.value;
  }

  const totalTrials = history.length;

  return {
    modalityId,
    totalTrials,
    targetCount,
    lureN1Count,
    lureN2Count,
    neutralCount,
    targetRate: totalTrials > 0 ? targetCount / totalTrials : 0,
    lureN1Rate: totalTrials > 0 ? lureN1Count / totalTrials : 0,
    lureN2Rate: totalTrials > 0 ? lureN2Count / totalTrials : 0,
    uniqueValues: valueSet.size,
    maxConsecutiveSameValue,
    maxConsecutiveTargets,
  };
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidationOptions {
  /** Tolérance pour les taux (ex: 0.05 = ±5%) */
  readonly tolerance?: number;
  /** Nombre max de valeurs consécutives identiques (warning) */
  readonly maxConsecutiveSameValue?: number;
  /** Nombre max de targets consécutifs (warning) */
  readonly maxConsecutiveTargets?: number;
  /** Pourcentage minimum de valeurs uniques utilisées */
  readonly minDiversityRatio?: number;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  tolerance: SEQUENCE_VALIDATION_TOLERANCE,
  maxConsecutiveSameValue: SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME,
  maxConsecutiveTargets: SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS,
  minDiversityRatio: SEQUENCE_VALIDATION_MIN_DIVERSITY_RATIO,
};

/**
 * Valide une séquence générée.
 */
export function validateSequence(
  history: readonly GeneratedTrial[],
  spec: SequenceSpec,
  constraints: readonly Constraint[] = [],
  options: ValidationOptions = {},
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: ValidationIssue[] = [];
  const stats: Record<ModalityId, ModalityStats> = {};

  // Calculate stats for each modality
  for (const modalitySpec of spec.modalities) {
    const modalityId = modalitySpec.id;
    const modalityStats = calculateModalityStats(history, modalityId);
    stats[modalityId] = modalityStats;

    // Check target rate
    const expectedTargetRate =
      spec.targetProbabilities[modalityId] ?? GEN_TARGET_PROBABILITY_DEFAULT;

    if (modalityStats.targetRate < expectedTargetRate - opts.tolerance) {
      issues.push({
        severity: 'warning',
        type: 'target-rate-too-low',
        message: `Target rate for ${modalityId} is ${(modalityStats.targetRate * 100).toFixed(1)}%, expected ~${(expectedTargetRate * 100).toFixed(1)}%`,
        modalityId,
        details: { actual: modalityStats.targetRate, expected: expectedTargetRate },
      });
    }

    if (modalityStats.targetRate > expectedTargetRate + opts.tolerance) {
      issues.push({
        severity: 'warning',
        type: 'target-rate-too-high',
        message: `Target rate for ${modalityId} is ${(modalityStats.targetRate * 100).toFixed(1)}%, expected ~${(expectedTargetRate * 100).toFixed(1)}%`,
        modalityId,
        details: { actual: modalityStats.targetRate, expected: expectedTargetRate },
      });
    }

    // Check lure rates
    const lureSpec = spec.lureProbabilities[modalityId];
    if (lureSpec) {
      for (const [lureType, expectedRate] of Object.entries(lureSpec)) {
        const actualRate = lureType === 'n-1' ? modalityStats.lureN1Rate : modalityStats.lureN2Rate;
        const diff = Math.abs(actualRate - expectedRate);

        if (diff > opts.tolerance && expectedRate > 0) {
          issues.push({
            severity: 'warning',
            type: 'lure-rate-out-of-range',
            message: `Lure ${lureType} rate for ${modalityId} is ${(actualRate * 100).toFixed(1)}%, expected ~${(expectedRate * 100).toFixed(1)}%`,
            modalityId,
            details: { lureType, actual: actualRate, expected: expectedRate },
          });
        }
      }
    }

    // Check consecutive same values
    if (modalityStats.maxConsecutiveSameValue > opts.maxConsecutiveSameValue) {
      issues.push({
        severity: 'warning',
        type: 'consecutive-same-value',
        message: `${modalityId} has ${modalityStats.maxConsecutiveSameValue} consecutive same values (max recommended: ${opts.maxConsecutiveSameValue})`,
        modalityId,
        details: { count: modalityStats.maxConsecutiveSameValue },
      });
    }

    // Check consecutive targets
    if (modalityStats.maxConsecutiveTargets > opts.maxConsecutiveTargets) {
      issues.push({
        severity: 'warning',
        type: 'consecutive-targets',
        message: `${modalityId} has ${modalityStats.maxConsecutiveTargets} consecutive targets (max recommended: ${opts.maxConsecutiveTargets})`,
        modalityId,
        details: { count: modalityStats.maxConsecutiveTargets },
      });
    }

    // Check diversity (if modality has enough possible values)
    const possibleValues =
      typeof modalitySpec.values === 'number' ? modalitySpec.values : modalitySpec.values.length;
    const diversityRatio = modalityStats.uniqueValues / possibleValues;

    if (diversityRatio < opts.minDiversityRatio && modalityStats.totalTrials >= possibleValues) {
      issues.push({
        severity: 'warning',
        type: 'low-diversity',
        message: `${modalityId} uses only ${modalityStats.uniqueValues}/${possibleValues} possible values (${(diversityRatio * 100).toFixed(1)}%)`,
        modalityId,
        details: { uniqueValues: modalityStats.uniqueValues, possibleValues },
      });
    }
  }

  // Check constraint violations
  for (let i = 1; i < history.length; i++) {
    const historyUpToNow = history.slice(0, i);
    const candidate = history[i];
    if (!candidate) continue;

    for (const constraint of constraints) {
      if (!constraint.isSatisfied(historyUpToNow, candidate)) {
        issues.push({
          severity: 'error',
          type: 'constraint-violation',
          message: `Constraint ${constraint.id} violated at trial ${i}`,
          details: { constraintId: constraint.id, trialIndex: i },
        });
      }
    }
  }

  // Determine overall validity (no errors)
  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    isValid: !hasErrors,
    stats,
    issues,
  };
}

/**
 * Génère un rapport textuel de validation.
 */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('=== Sequence Validation Report ===\n');
  lines.push(`Status: ${result.isValid ? '✓ Valid' : '✗ Invalid'}\n`);

  // Stats per modality
  lines.push('\n--- Statistics by Modality ---\n');
  for (const [modalityId, stats] of Object.entries(result.stats)) {
    lines.push(`\n${modalityId}:`);
    lines.push(`  Trials: ${stats.totalTrials}`);
    lines.push(`  Targets: ${stats.targetCount} (${(stats.targetRate * 100).toFixed(1)}%)`);
    lines.push(`  Lures N-1: ${stats.lureN1Count} (${(stats.lureN1Rate * 100).toFixed(1)}%)`);
    lines.push(`  Lures N+1: ${stats.lureN2Count} (${(stats.lureN2Rate * 100).toFixed(1)}%)`);
    lines.push(`  Neutral: ${stats.neutralCount}`);
    lines.push(`  Unique values: ${stats.uniqueValues}`);
    lines.push(`  Max consecutive same value: ${stats.maxConsecutiveSameValue}`);
    lines.push(`  Max consecutive targets: ${stats.maxConsecutiveTargets}`);
  }

  // Issues
  if (result.issues.length > 0) {
    lines.push('\n--- Issues ---\n');
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '✗' : '⚠';
      lines.push(`${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  } else {
    lines.push('\n--- No issues detected ---');
  }

  return lines.join('\n');
}
