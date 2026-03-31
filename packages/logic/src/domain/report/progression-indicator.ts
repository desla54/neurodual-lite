/**
 * Progression Indicator — public API
 *
 * All types and explanation builders live in progression-types.ts.
 * This file re-exports them for backwards compatibility and provides
 * the main computeProgressionIndicatorModel entry point.
 */

import type { SessionEndReportModel } from '../../types/session-report';
import { runIndicatorPipeline } from './indicator-pipeline';

// Re-export everything from progression-types for backwards compatibility
export {
  computeJaeggiExplanation,
  computeBrainWorkshopExplanation,
  computeAccuracyExplanation,
  resolveJourneyCompletion,
} from './progression-types';

export type {
  ProgressionIndicatorScope,
  ProgressionIndicatorTone,
  ProgressionIndicatorHeadline,
  ProgressionMessageKind,
  ProgressionIndicatorAction,
  ModalityErrorInfo,
  ProgressionExplanation,
  JourneyCompletionState,
  HybridJourneyDisplayKind,
  HybridJourneyDisplay,
  DualTrackJourneyDisplay,
  ProgressionIndicatorModel,
} from './progression-types';

import type { ProgressionIndicatorModel } from './progression-types';

// =============================================================================
// Main Computation (delegates to declarative pipeline)
// =============================================================================

/**
 * Compute the progression indicator for the unified session report.
 *
 * Notes:
 * - Scope is derived deterministically from playContext (strict SSOT), with fallbacks for legacy data.
 * - Only supports Dual & Back classic and Brain Workshop (per spec).
 * - Explanation contains protocol-specific metrics (Jaeggi errors or BW score%).
 */
export function computeProgressionIndicatorModel(
  report: SessionEndReportModel,
): ProgressionIndicatorModel | null {
  return runIndicatorPipeline(report);
}
