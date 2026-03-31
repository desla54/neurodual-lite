import { describe, expect, it } from 'bun:test';
import {
  resolveOverride,
  chainModalityEvaluators,
  resolvePlugins,
  type PluginConfig,
} from './composition';
import type {
  ResponseProcessor,
  ModalityEvaluator,
  AudioPolicy,
  WritingOrchestrator,
  RhythmController,
  ArithmeticOrchestrator,
  AdaptiveTimingController,
  ModalityEvalInput,
  TraceRunningStats,
} from './types';
import { TRACE_ADAPTIVE_TARGET_ACCURACY } from '../../../specs/thresholds';
import { createEmptyTraceStats } from '../../../types/trace';

// Mock implementations for testing
function createMockResponseProcessor(): ResponseProcessor {
  return {
    isWarmupTrial: () => false,
    getExpectedPosition: () => 3,
    getExpectedSound: () => 'C',
    getExpectedColor: () => 'ink-black',
    // @ts-expect-error test override
    processSwipe: () => ({
      isCorrect: true,
      expectedPosition: 3,
      expectedSound: 'C',
      expectedColor: 'ink-black',
    }),
    // @ts-expect-error test override
    processDoubleTap: () => ({
      isCorrect: true,
      expectedPosition: null,
      expectedSound: null,
      expectedColor: null,
    }),
    // @ts-expect-error test override
    processCenterTap: () => ({
      isCorrect: false,
      expectedPosition: 3,
      expectedSound: 'C',
      expectedColor: null,
    }),
    // @ts-expect-error test override
    processSkip: () => ({
      isCorrect: false,
      expectedPosition: null,
      expectedSound: null,
      expectedColor: null,
    }),
    // @ts-expect-error test override
    processTimeout: () => ({
      isCorrect: false,
      expectedPosition: 3,
      expectedSound: 'C',
      expectedColor: null,
    }),
  };
}

function createMockAudioPolicy(): AudioPolicy {
  return {
    getStimulusSound: () => 'C',
    getFeedbackSound: () => 'correct',
    isAudioEnabled: () => true,
    isSoundEnabled: () => true,
  };
}

function createMockWritingOrchestrator(): WritingOrchestrator {
  return {
    needsWritingPhase: () => false,
    getTimeoutMs: () => 60000,
    // @ts-expect-error test override
    createTimeoutResult: () => ({
      recognizedLetter: null,
      expectedLetter: 'C',
      isCorrect: false,
      confidence: 0,
      writingTimeMs: 60000,
      timedOut: true,
    }),
    isWritingEnabled: () => false,
  };
}

function createMockRhythmController(): RhythmController {
  return {
    getMode: () => 'timed',
    isTimed: () => true,
    isSelfPaced: () => false,
    getStimulusDurationMs: () => 2000,
    getResponseWindowMs: () => 3000,
    getFeedbackDurationMs: () => 500,
    getRuleDisplayMs: () => 1000,
    getIntervalMs: () => 500,
    getTrialCycleDurationMs: () => 7000,
    // @ts-expect-error test override
    calculateWaitingTiming: () => ({ waitingMs: 500, postWaitingMs: 0 }),
  };
}

function createMockModalityEvaluator(
  enabled: boolean,
  modalities: string[] = ['position'],
): ModalityEvaluator {
  return {
    isEnabled: () => enabled,
    getEnabledModalities: () => modalities as any,
    evaluate: (_input: ModalityEvalInput, stats: TraceRunningStats) => ({
      results: { position: 'hit' } as any,
      updatedStats: { ...stats, correctResponses: stats.correctResponses + 1 },
    }),
  };
}

function createMockArithmeticOrchestrator(): ArithmeticOrchestrator {
  return {
    isEnabled: () => true,
    getTimeoutMs: () => 30000,
    // @ts-expect-error test override
    generateProblem: () => ({
      expression: '3 + 4',
      answer: 7,
      operationCount: 1,
      terms: [
        { operator: null, value: 3 },
        { operator: '+', value: 4 },
      ],
    }),
    validateAnswer: () => true as any,
    getMinIntervalMs: () => 1000,
    getMaxIntervalMs: () => 3000,
  };
}

function createMockAdaptiveTimingController(): AdaptiveTimingController {
  return {
    isEnabled: () => true,
    onTrialCompleted: () => {},
    getEstimatedAccuracy: () => TRACE_ADAPTIVE_TARGET_ACCURACY,
    getCurrentExtinctionRatio: () => 0.65,
    getCurrentStimulusDurationMs: () => 1000,
    getCurrentResponseWindowMs: () => 3000,
    getTrialCount: () => 0,
    serialize: () => ({
      estimatedAccuracy: TRACE_ADAPTIVE_TARGET_ACCURACY,
      recentTrials: [],
      trialCount: 0,
      currentValues: {
        stimulusDurationMs: 1000,
        extinctionRatio: 0.65,
        responseWindowMs: 3000,
      },
    }),
    restore: () => {},
  };
}

describe('composition', () => {
  describe('resolveOverride', () => {
    it('should return undefined when no configs have the key', () => {
      const configs: PluginConfig[] = [
        { priority: 1, impl: {} },
        { priority: 2, impl: {} },
      ];
      const result = resolveOverride<ResponseProcessor>(configs, 'response');
      expect(result).toBeUndefined();
    });

    it('should return the implementation with highest priority', () => {
      const lowPriorityResponse = createMockResponseProcessor();
      const highPriorityResponse = createMockResponseProcessor();
      // Mark the high priority one differently
      (highPriorityResponse as any)._priority = 'high';

      const configs: PluginConfig[] = [
        { priority: 1, impl: { response: lowPriorityResponse } },
        { priority: 10, impl: { response: highPriorityResponse } },
        { priority: 5, impl: {} },
      ];

      const result = resolveOverride<ResponseProcessor>(configs, 'response');
      expect((result as any)._priority).toBe('high');
    });

    it('should handle single config', () => {
      const response = createMockResponseProcessor();
      const configs: PluginConfig[] = [{ priority: 1, impl: { response } }];

      const result = resolveOverride<ResponseProcessor>(configs, 'response');
      expect(result).toBe(response);
    });
  });

  describe('chainModalityEvaluators', () => {
    it('should combine enabled status from all evaluators', () => {
      const evaluators = [createMockModalityEvaluator(false), createMockModalityEvaluator(true)];

      const chained = chainModalityEvaluators(evaluators);
      expect(chained.isEnabled()).toBe(true);
    });

    it('should return false when all evaluators are disabled', () => {
      const evaluators = [createMockModalityEvaluator(false), createMockModalityEvaluator(false)];

      const chained = chainModalityEvaluators(evaluators);
      expect(chained.isEnabled()).toBe(false);
    });

    it('should combine enabled modalities from all evaluators', () => {
      const evaluators = [
        createMockModalityEvaluator(true, ['position']),
        createMockModalityEvaluator(true, ['audio']),
      ];

      const chained = chainModalityEvaluators(evaluators);
      const modalities = chained.getEnabledModalities();
      expect(modalities).toContain('position');
      expect(modalities).toContain('audio');
    });

    it('should deduplicate modalities', () => {
      const evaluators = [
        createMockModalityEvaluator(true, ['position', 'audio']),
        createMockModalityEvaluator(true, ['position', 'color']),
      ];

      const chained = chainModalityEvaluators(evaluators);
      const modalities = chained.getEnabledModalities();
      const positionCount = modalities.filter((m) => m === 'position').length;
      expect(positionCount).toBe(1);
    });

    it('should only include modalities from enabled evaluators', () => {
      const evaluators = [
        createMockModalityEvaluator(true, ['position']),
        createMockModalityEvaluator(false, ['audio']),
      ];

      const chained = chainModalityEvaluators(evaluators);
      const modalities = chained.getEnabledModalities();
      expect(modalities).toContain('position');
      expect(modalities).not.toContain('audio');
    });

    it('should chain evaluate calls through evaluators', () => {
      const evaluator1: ModalityEvaluator = {
        isEnabled: () => true,
        getEnabledModalities: () => ['position'] as any,
        evaluate: (_input, stats) => ({
          results: { position: 'hit' } as any,
          updatedStats: { ...stats, correctResponses: stats.correctResponses + 1 },
        }),
      };

      const evaluator2: ModalityEvaluator = {
        isEnabled: () => true,
        getEnabledModalities: () => ['audio'] as any,
        evaluate: (_input, stats) => ({
          results: { audio: 'miss' } as any,
          updatedStats: { ...stats, incorrectResponses: stats.incorrectResponses + 1 },
        }),
      };

      const chained = chainModalityEvaluators([evaluator1, evaluator2]);
      const input = { trialIndex: 5, response: {} } as any;
      const stats = createEmptyTraceStats();

      const result = chained.evaluate(input, stats);

      expect(result.results.position).toBe('hit');
      expect(result.results.audio).toBe('miss');
      expect(result.updatedStats.correctResponses).toBe(1);
      expect(result.updatedStats.incorrectResponses).toBe(1);
    });

    it('should skip disabled evaluators in evaluate chain', () => {
      const evaluator1: ModalityEvaluator = {
        isEnabled: () => false,
        getEnabledModalities: () => ['position'] as any,
        evaluate: (_input, stats) => ({
          results: { position: 'hit' } as any,
          updatedStats: { ...stats, correctResponses: stats.correctResponses + 100 },
        }),
      };

      const evaluator2: ModalityEvaluator = {
        isEnabled: () => true,
        getEnabledModalities: () => ['audio'] as any,
        evaluate: (_input, stats) => ({
          results: { audio: 'hit' } as any,
          updatedStats: { ...stats, correctResponses: stats.correctResponses + 1 },
        }),
      };

      const chained = chainModalityEvaluators([evaluator1, evaluator2]);
      const result = chained.evaluate({} as any, createEmptyTraceStats());

      // Should not have position (first evaluator disabled)
      expect(result.results.position).toBeUndefined();
      expect(result.results.audio).toBe('hit');
      expect(result.updatedStats.correctResponses).toBe(1); // Not 100+1
    });
  });

  describe('resolvePlugins', () => {
    it('should throw when ResponseProcessor is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true),
            arithmetic: createMockArithmeticOrchestrator(),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('ResponseProcessor is required');
    });

    it('should throw when AudioPolicy is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true),
            arithmetic: createMockArithmeticOrchestrator(),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('AudioPolicy is required');
    });

    it('should throw when WritingOrchestrator is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true),
            arithmetic: createMockArithmeticOrchestrator(),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('WritingOrchestrator is required');
    });

    it('should throw when RhythmController is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            modality: createMockModalityEvaluator(true),
            arithmetic: createMockArithmeticOrchestrator(),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('RhythmController is required');
    });

    it('should throw when ModalityEvaluator is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            arithmetic: createMockArithmeticOrchestrator(),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('ModalityEvaluator is required');
    });

    it('should throw when ArithmeticOrchestrator is missing', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true),
          },
        },
      ];

      expect(() => resolvePlugins(configs)).toThrow('ArithmeticOrchestrator is required');
    });

    it('should resolve all plugins when provided', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true),
            arithmetic: createMockArithmeticOrchestrator(),
            adaptiveTiming: createMockAdaptiveTimingController(),
          },
        },
      ];

      const plugins = resolvePlugins(configs);

      expect(plugins.response).toBeDefined();
      expect(plugins.audio).toBeDefined();
      expect(plugins.writing).toBeDefined();
      expect(plugins.rhythm).toBeDefined();
      expect(plugins.modality).toBeDefined();
      expect(plugins.arithmetic).toBeDefined();
      expect(plugins.adaptiveTiming).toBeDefined();
    });

    it('should chain multiple modality evaluators', () => {
      const configs: PluginConfig[] = [
        {
          priority: 1,
          impl: {
            response: createMockResponseProcessor(),
            audio: createMockAudioPolicy(),
            writing: createMockWritingOrchestrator(),
            rhythm: createMockRhythmController(),
            modality: createMockModalityEvaluator(true, ['position']),
            arithmetic: createMockArithmeticOrchestrator(),
            adaptiveTiming: createMockAdaptiveTimingController(),
          },
        },
        {
          priority: 2,
          impl: {
            modality: createMockModalityEvaluator(true, ['audio']),
          },
        },
      ];

      const plugins = resolvePlugins(configs);
      const modalities = plugins.modality.getEnabledModalities();

      expect(modalities).toContain('position');
      expect(modalities).toContain('audio');
    });
  });
});
