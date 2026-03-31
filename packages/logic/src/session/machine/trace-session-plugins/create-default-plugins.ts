/**
 * Create Default Plugins Factory
 *
 * Creates the complete set of default plugins for TraceSessionMachine.
 * Plugins are readonly and immutable once created.
 *
 * PRINCIPLES:
 * - Created once at session start
 * - Readonly in context (never modified)
 * - All config comes from spec (no hidden dependencies)
 *
 * HOT-RELOAD:
 * The RhythmController receives a getTimingSource getter to support
 * hot-reload of timing values during a session.
 */

import type { TraceSpec } from '../../../specs/trace.spec';
import type { TraceSessionPlugins, TimingSource } from './types';
import { createDefaultResponseProcessor, type ResponseProcessorConfig } from './response-processor';
import { createDefaultAudioPolicy, type AudioPolicyConfig } from './audio-policy';
import { createDefaultRhythmController, type RhythmControllerConfig } from './rhythm-controller';
import { createDefaultModalityEvaluator, type ModalityEvaluatorConfig } from './modality-evaluator';
import {
  createDefaultWritingOrchestrator,
  type WritingOrchestratorConfig,
} from './writing-orchestrator';
import {
  createArithmeticOrchestrator,
  type ArithmeticOrchestratorConfig,
} from './arithmetic-orchestrator';
import {
  createAdaptiveTimingController,
  createNoopAdaptiveTimingController,
  type AdaptiveTimingControllerConfig,
} from './adaptive-timing-controller';
import { TRACE_EXTINCTION_RATIO } from '../../../specs/thresholds';

// =============================================================================
// Factory
// =============================================================================

export interface CreateDefaultPluginsConfig {
  readonly spec: TraceSpec;
  /**
   * Getter for the mutable TimingSource.
   * Called by RhythmController on each timing read for hot-reload support.
   */
  readonly getTimingSource: () => TimingSource;
}

/**
 * Creates the complete set of default plugins for TraceSessionMachine.
 *
 * @param config - Configuration containing the spec and timingSource getter
 * @returns Readonly plugins object
 *
 * @example
 * ```typescript
 * // Create mutable timing source
 * const timingSource: TimingSource = { ...initialValues };
 *
 * const plugins = createDefaultPlugins({
 *   spec: DualTraceSpec,
 *   getTimingSource: () => timingSource,
 * });
 *
 * // Use in machine input
 * const actor = createActor(traceSessionMachine, {
 *   input: { spec, trials, plugins, timingSource, ... }
 * });
 * ```
 */
export function createDefaultTracePlugins(config: CreateDefaultPluginsConfig): TraceSessionPlugins {
  const { spec, getTimingSource } = config;
  const nLevel = spec.defaults.nLevel;

  // Create all plugins with explicit config
  const response = createDefaultResponseProcessor({
    spec,
  } satisfies ResponseProcessorConfig);

  const audio = createDefaultAudioPolicy({
    spec,
  } satisfies AudioPolicyConfig);

  const rhythm = createDefaultRhythmController({
    rhythmMode: spec.extensions.rhythmMode,
    getTimingSource,
  } satisfies RhythmControllerConfig);

  const modality = createDefaultModalityEvaluator({
    spec,
  } satisfies ModalityEvaluatorConfig);

  const writing = createDefaultWritingOrchestrator({
    spec,
    nLevel,
  } satisfies WritingOrchestratorConfig);

  const arithmetic = createArithmeticOrchestrator({
    spec,
  } satisfies ArithmeticOrchestratorConfig);

  // Create adaptive timing controller
  // Check if adaptive timing is enabled via extension
  const adaptiveTimingEnabled =
    (spec.extensions as { adaptiveTimingEnabled?: boolean }).adaptiveTimingEnabled === true;

  const responseWindowMs = spec.timing.responseWindowMs ?? 3000;

  const adaptiveTiming = adaptiveTimingEnabled
    ? createAdaptiveTimingController({
        enabled: true,
        isTimed: spec.extensions.rhythmMode === 'timed',
        initialStimulusDurationMs: spec.timing.stimulusDurationMs,
        initialExtinctionRatio: TRACE_EXTINCTION_RATIO,
        initialResponseWindowMs: responseWindowMs,
      } satisfies AdaptiveTimingControllerConfig)
    : createNoopAdaptiveTimingController({
        stimulusDurationMs: spec.timing.stimulusDurationMs,
        extinctionRatio: TRACE_EXTINCTION_RATIO,
        responseWindowMs,
      });

  // Return frozen plugins object (immutable)
  return Object.freeze({
    response,
    audio,
    rhythm,
    modality,
    writing,
    arithmetic,
    adaptiveTiming,
  });
}

// =============================================================================
// Re-export individual factories for custom composition
// =============================================================================

export { createDefaultResponseProcessor } from './response-processor';
export { createDefaultAudioPolicy } from './audio-policy';
export { createDefaultRhythmController } from './rhythm-controller';
export { createDefaultModalityEvaluator } from './modality-evaluator';
export { createDefaultWritingOrchestrator } from './writing-orchestrator';
export {
  createArithmeticOrchestrator,
  createNoopArithmeticOrchestrator,
} from './arithmetic-orchestrator';
export {
  createAdaptiveTimingController,
  createNoopAdaptiveTimingController,
} from './adaptive-timing-controller';
