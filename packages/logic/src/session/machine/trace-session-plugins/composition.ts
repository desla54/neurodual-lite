/**
 * TraceSession Plugin Composition
 *
 * Defines how plugins are composed when multiple options affect the same hook.
 * Two composition modes:
 * - override: One implementation wins based on priority
 * - chain: Implementations are composed into a pipeline
 *
 * PRINCIPLES:
 * 1. Explicit priority: Higher number = higher priority
 * 2. Override = atomic: Only one implementation for critical hooks
 * 3. Chain = combinable: Results are merged through pipeline
 */

import type {
  TraceSessionPlugins,
  ResponseProcessor,
  ModalityEvaluator,
  AudioPolicy,
  WritingOrchestrator,
  RhythmController,
  ArithmeticOrchestrator,
  AdaptiveTimingController,
  ModalityEvalResult,
  TraceRunningStats,
  ModalityEvalInput,
} from './types';

// =============================================================================
// Composition Modes
// =============================================================================

export type CompositionMode = 'override' | 'chain';

/**
 * Mapping of hooks to their composition mode.
 * Override = only one impl wins (based on priority).
 * Chain = results are combined through a pipeline.
 */
export const HOOK_COMPOSITION: Record<string, CompositionMode> = {
  // ResponseProcessor - OVERRIDE (one validation logic)
  'response.processSwipe': 'override',
  'response.processDoubleTap': 'override',
  'response.processCenterTap': 'override',
  'response.processSkip': 'override',
  'response.processTimeout': 'override',
  'response.isWarmupTrial': 'override',
  'response.getExpectedPosition': 'override',
  'response.getExpectedSound': 'override',
  'response.getExpectedColor': 'override',

  // ModalityEvaluator - CHAIN (can combine results from multiple evaluators)
  'modality.isEnabled': 'override',
  'modality.getEnabledModalities': 'override',
  'modality.evaluate': 'chain',

  // AudioPolicy - OVERRIDE (one sound decision)
  'audio.getStimulusSound': 'override',
  'audio.getFeedbackSound': 'override',
  'audio.isAudioEnabled': 'override',
  'audio.isSoundEnabled': 'override',

  // WritingOrchestrator - OVERRIDE (one writing config)
  'writing.needsWritingPhase': 'override',
  'writing.getTimeoutMs': 'override',
  'writing.createTimeoutResult': 'override',
  'writing.isWritingEnabled': 'override',

  // RhythmController - OVERRIDE (one timing source)
  'rhythm.getMode': 'override',
  'rhythm.isTimed': 'override',
  'rhythm.isSelfPaced': 'override',
  'rhythm.getStimulusDurationMs': 'override',
  'rhythm.getResponseWindowMs': 'override',
  'rhythm.getFeedbackDurationMs': 'override',
  'rhythm.getRuleDisplayMs': 'override',
  'rhythm.getIntervalMs': 'override',
  'rhythm.getTrialCycleDurationMs': 'override',
  'rhythm.calculateWaitingTiming': 'override',
};

// =============================================================================
// Plugin Configuration with Priority
// =============================================================================

export interface PluginConfig {
  readonly priority: number;
  readonly impl: Partial<TraceSessionPlugins>;
}

// =============================================================================
// Override Resolver
// =============================================================================

/**
 * Resolves plugins in override mode.
 * For each plugin type, takes the implementation with highest priority.
 */
export function resolveOverride<T>(
  configs: readonly PluginConfig[],
  key: keyof TraceSessionPlugins,
): T | undefined {
  // Sort by priority descending
  const sorted = [...configs]
    .filter((c) => c.impl[key] !== undefined)
    .sort((a, b) => b.priority - a.priority);

  return sorted[0]?.impl[key] as T | undefined;
}

// =============================================================================
// Chain Resolvers
// =============================================================================

/**
 * Chains multiple ModalityEvaluators into one.
 * Results are combined: each evaluator adds to the accumulated results.
 */
export function chainModalityEvaluators(
  evaluators: readonly ModalityEvaluator[],
): ModalityEvaluator {
  return {
    isEnabled: () => evaluators.some((e) => e.isEnabled()),

    getEnabledModalities: () => {
      // Combine all enabled modalities (deduplicated)
      const allModalities = evaluators.flatMap((e) =>
        e.isEnabled() ? e.getEnabledModalities() : [],
      );
      return [...new Set(allModalities)];
    },

    evaluate: (input: ModalityEvalInput, stats: TraceRunningStats): ModalityEvalResult => {
      // Chain evaluators: each one receives the updated stats from previous
      return evaluators.reduce(
        (acc, evaluator) => {
          if (!evaluator.isEnabled()) return acc;

          const result = evaluator.evaluate(input, acc.updatedStats);
          return {
            results: { ...acc.results, ...result.results },
            updatedStats: result.updatedStats,
          };
        },
        { results: {}, updatedStats: stats } as ModalityEvalResult,
      );
    },
  };
}

// =============================================================================
// Full Plugin Resolution
// =============================================================================

/**
 * Resolves all plugins from a list of configs.
 * Uses override mode for most hooks, chain mode for modality.evaluate.
 */
export function resolvePlugins(configs: readonly PluginConfig[]): TraceSessionPlugins {
  const response = resolveOverride<ResponseProcessor>(configs, 'response');
  const audio = resolveOverride<AudioPolicy>(configs, 'audio');
  const writing = resolveOverride<WritingOrchestrator>(configs, 'writing');
  const rhythm = resolveOverride<RhythmController>(configs, 'rhythm');
  const arithmetic = resolveOverride<ArithmeticOrchestrator>(configs, 'arithmetic');
  const adaptiveTiming = resolveOverride<AdaptiveTimingController>(configs, 'adaptiveTiming');

  // Modality uses chain mode for evaluate
  const modalityEvaluators = configs
    .filter(
      (c): c is PluginConfig & { impl: { modality: ModalityEvaluator } } =>
        c.impl.modality !== undefined,
    )
    .sort((a, b) => a.priority - b.priority) // Chain in priority order (low to high)
    .map((c) => c.impl.modality);

  const modality =
    modalityEvaluators.length > 0
      ? chainModalityEvaluators(modalityEvaluators)
      : resolveOverride<ModalityEvaluator>(configs, 'modality');

  if (!response) {
    throw new Error('TraceSessionPlugins: ResponseProcessor is required');
  }
  if (!audio) {
    throw new Error('TraceSessionPlugins: AudioPolicy is required');
  }
  if (!writing) {
    throw new Error('TraceSessionPlugins: WritingOrchestrator is required');
  }
  if (!rhythm) {
    throw new Error('TraceSessionPlugins: RhythmController is required');
  }
  if (!modality) {
    throw new Error('TraceSessionPlugins: ModalityEvaluator is required');
  }
  if (!arithmetic) {
    throw new Error('TraceSessionPlugins: ArithmeticOrchestrator is required');
  }
  if (!adaptiveTiming) {
    throw new Error('TraceSessionPlugins: AdaptiveTimingController is required');
  }

  return {
    response,
    modality,
    audio,
    writing,
    rhythm,
    arithmetic,
    adaptiveTiming,
  };
}
