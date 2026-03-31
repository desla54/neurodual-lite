/**
 * Tests for DefaultModalityEvaluator
 *
 * Validates modality evaluation logic in isolation.
 */

import { describe, it, expect } from 'bun:test';
import { createDefaultModalityEvaluator } from './modality-evaluator';
import type { TraceSpec } from '../../../specs/trace.spec';
import type { TraceResponse, TraceModalityStats } from '../../../types/trace';
import type { ModalityEvalInput, TraceRunningStats } from './types';

// =============================================================================
// Test Setup
// =============================================================================

function createMockSpec(
  dynamicRules = false,
  audioEnabled = false,
  colorEnabled = false,
): TraceSpec {
  return {
    modeId: 'trace',
    sessionType: 'TraceSession',
    scoring: { strategy: 'accuracy', passThreshold: 0.7, downThreshold: 0.4 },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 1000,
      responseWindowMs: 2000,
      feedbackDurationMs: 300,
    },
    // @ts-expect-error test override
    generation: { generator: 'trace' },
    defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position'] },
    // @ts-expect-error test override
    report: { sections: [] },
    // @ts-expect-error test override
    extensions: {
      rhythmMode: 'timed',
      dynamicRules,
      dynamicSwipeDirection: false,
      audioEnabled,
      soundEnabled: false,
      colorEnabled,
      writingEnabled: false,
      writingTimeoutMs: 5000,
      ruleDisplayMs: 500,
    },
  };
}

function createMockResponse(isCorrect: boolean, position: number | null = 0): TraceResponse {
  return {
    trialIndex: 2,
    responseType: 'swipe',
    position,
    expectedPosition: 0,
    // @ts-expect-error test override
    expectedSound: 'A',
    expectedColor: null,
    colorResponse: null,
    isCorrect,
    isWarmup: false,
    responseTimeMs: 500,
    responseAtMs: 1000,
  };
}

function createEmptyModalityStats(): TraceModalityStats {
  return {
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
  };
}

function createMockStats(withModalityStats = false): TraceRunningStats {
  return {
    trialsCompleted: 0,
    correctResponses: 0,
    incorrectResponses: 0,
    timeouts: 0,
    warmupTrials: 0,
    accuracy: 0,
    modalityStats: withModalityStats
      ? {
          position: createEmptyModalityStats(),
          audio: createEmptyModalityStats(),
          color: createEmptyModalityStats(),
        }
      : undefined,
  };
}

describe('DefaultModalityEvaluator', () => {
  // ===========================================================================
  // Enabled State
  // ===========================================================================

  describe('isEnabled', () => {
    it('should return false when dynamicRules is false', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(false),
      });
      expect(evaluator.isEnabled()).toBe(false);
    });

    it('should return true when dynamicRules is true', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true),
      });
      expect(evaluator.isEnabled()).toBe(true);
    });
  });

  // ===========================================================================
  // Enabled Modalities
  // ===========================================================================

  describe('getEnabledModalities', () => {
    it('should always include position', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, false, false),
      });
      expect(evaluator.getEnabledModalities()).toContain('position');
    });

    it('should include audio when audioEnabled', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, true, false),
      });
      const modalities = evaluator.getEnabledModalities();
      expect(modalities).toContain('position');
      expect(modalities).toContain('audio');
    });

    it('should include color when colorEnabled', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, false, true),
      });
      const modalities = evaluator.getEnabledModalities();
      expect(modalities).toContain('position');
      expect(modalities).toContain('color');
    });

    it('should include all modalities when both enabled', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, true, true),
      });
      const modalities = evaluator.getEnabledModalities();
      expect(modalities).toContain('position');
      expect(modalities).toContain('audio');
      expect(modalities).toContain('color');
    });
  });

  // ===========================================================================
  // Evaluate
  // ===========================================================================

  describe('evaluate', () => {
    it('should return empty results when dynamicRules is disabled', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(false),
      });

      const input: ModalityEvalInput = {
        response: createMockResponse(true),
        activeModalities: ['position'],
        writingResult: null,
        hadPositionTarget: true,
        hadAudioTarget: false,
        hadColorTarget: false,
      };
      const stats = createMockStats();

      const result = evaluator.evaluate(input, stats);

      expect(Object.keys(result.results)).toHaveLength(0);
      expect(result.updatedStats).toBe(stats);
    });

    it('should compute position modality result for correct response', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, false, false),
      });

      const input: ModalityEvalInput = {
        response: createMockResponse(true, 5),
        activeModalities: ['position'],
        writingResult: null,
        hadPositionTarget: true,
        hadAudioTarget: false,
        hadColorTarget: false,
      };
      const stats = createMockStats(true);

      const result = evaluator.evaluate(input, stats);

      expect(result.results.position).toBeDefined();
      expect(result.results.position).toBe('hit');
    });

    it('should compute position modality result for incorrect response', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, false, false),
      });

      const input: ModalityEvalInput = {
        response: createMockResponse(false, 5), // Wrong position
        activeModalities: ['position'],
        writingResult: null,
        hadPositionTarget: true,
        hadAudioTarget: false,
        hadColorTarget: false,
      };
      const stats = createMockStats(true);

      const result = evaluator.evaluate(input, stats);

      expect(result.results.position).toBeDefined();
      // When there was a target and response was wrong, it's a miss
      expect(result.results.position).toBe('miss');
    });

    it('should update modality stats immutably', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, false, false),
      });

      const input: ModalityEvalInput = {
        response: createMockResponse(true, 5),
        activeModalities: ['position'],
        writingResult: null,
        hadPositionTarget: true,
        hadAudioTarget: false,
        hadColorTarget: false,
      };
      const originalStats = createMockStats(true);

      const result = evaluator.evaluate(input, originalStats);

      // Original stats should be unchanged
      expect(originalStats.modalityStats?.position.hits).toBe(0);

      // Updated stats should have the new value
      expect(result.updatedStats.modalityStats?.position.hits).toBe(1);
      expect(result.updatedStats).not.toBe(originalStats);
    });

    it('should handle audio modality with writing result', () => {
      const evaluator = createDefaultModalityEvaluator({
        spec: createMockSpec(true, true, false),
      });

      const input: ModalityEvalInput = {
        response: createMockResponse(true, 5),
        activeModalities: ['position', 'audio'],
        writingResult: {
          recognizedLetter: 'A',
          expectedLetter: 'A',
          isCorrect: true,
          confidence: 1,
          writingTimeMs: 123,
          timedOut: false,
          selectedColor: null,
          expectedColor: null,
          colorCorrect: null,
        },
        hadPositionTarget: true,
        hadAudioTarget: true,
        hadColorTarget: false,
      };
      const stats = createMockStats(true);

      const result = evaluator.evaluate(input, stats);

      expect(result.results.position).toBeDefined();
      expect(result.results.audio).toBeDefined();
      expect(result.results.audio).toBe('hit');
    });
  });
});
