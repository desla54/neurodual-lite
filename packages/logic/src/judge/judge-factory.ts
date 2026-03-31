/**
 * Judge Factory - Creates judges from ModeSpec
 *
 * Central factory for creating the appropriate TrialJudge
 * based on the scoring strategy defined in ModeSpec.
 */

import type { ModeSpec } from '../specs/types';
import { AccuracyJudge } from './accuracy-judge';
import { BrainWorkshopJudge } from './brainworkshop-judge';
import { SDTJudge } from './sdt-judge';
import type { JudgeConfig, TrialJudge } from './trial-judge';

// =============================================================================
// Spec Key for Extensions
// =============================================================================

/**
 * Key for judge extension in ModeSpec.extensions.
 */
export const JUDGE_KEY = 'judge';

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a judge from a JudgeConfig.
 *
 * @param config - Judge configuration
 * @returns TrialJudge instance
 */
export function createJudgeFromConfig(config: JudgeConfig): TrialJudge {
  switch (config.strategy) {
    case 'sdt':
    case 'dualnback-classic':
      // SDT-based strategies use d' for pass/fail
      return new SDTJudge();

    case 'brainworkshop':
      // Brain Workshop v5.0 uses H/(H+M+FA) scoring for pass/fail
      return new BrainWorkshopJudge();

    case 'accuracy':
      // Accuracy judge is simpler (used by Flow, Recall, Label, Trace)
      return new AccuracyJudge();

    default:
      // Default to SDT
      return new SDTJudge();
  }
}

/**
 * Create a judge from a ModeSpec.
 *
 * Extracts scoring configuration from the spec and creates
 * the appropriate judge.
 *
 * @param spec - The mode specification
 * @returns TrialJudge instance
 */
export function createJudge(spec: ModeSpec): TrialJudge {
  const config: JudgeConfig = {
    strategy: spec.scoring.strategy,
    passThreshold: spec.scoring.passThreshold,
    downThreshold: spec.scoring.downThreshold,
  };

  return createJudgeFromConfig(config);
}

/**
 * Get the scoring strategy from a ModeSpec.
 *
 * @param spec - The mode specification
 * @returns The scoring strategy
 */
export function getScoringStrategy(spec: ModeSpec): JudgeConfig['strategy'] {
  return spec.scoring.strategy;
}
