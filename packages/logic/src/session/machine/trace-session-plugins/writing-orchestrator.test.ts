/**
 * Tests for DefaultWritingOrchestrator
 *
 * Validates writing phase logic in isolation.
 */

import { describe, it, expect } from 'bun:test';
import { createDefaultWritingOrchestrator } from './writing-orchestrator';
import type { TraceSpec } from '../../../specs/trace.spec';

// =============================================================================
// Test Setup
// =============================================================================

function createMockSpec(
  audioEnabled = false,
  colorEnabled = false,
  writingEnabled = true,
  timeoutMs = 5000,
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
    extensions: {
      rhythmMode: 'timed',
      dynamicRules: false,
      dynamicSwipeDirection: false,
      audioEnabled,
      soundEnabled: false,
      colorEnabled,
      writing: {
        enabled: writingEnabled,
        // @ts-expect-error test override
        mode: 'letter',
        minSizePx: 50,
        timeoutMs,
        gridFadeOpacity: 0.3,
        showHint: false,
      },
      ruleDisplayMs: 500,
    },
  };
}

describe('DefaultWritingOrchestrator', () => {
  // ===========================================================================
  // Writing Enabled
  // ===========================================================================

  describe('isWritingEnabled', () => {
    it('should return false when writing is disabled in spec', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, false, false),
        nLevel: 2,
      });
      expect(orchestrator.isWritingEnabled()).toBe(false);
    });

    it('should return false when no audio/color modality', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(false, false, true),
        nLevel: 2,
      });
      expect(orchestrator.isWritingEnabled()).toBe(false);
    });

    it('should return true when writing enabled with audio', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, false, true),
        nLevel: 2,
      });
      expect(orchestrator.isWritingEnabled()).toBe(true);
    });

    it('should return true when writing enabled with color', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(false, true, true),
        nLevel: 2,
      });
      expect(orchestrator.isWritingEnabled()).toBe(true);
    });
  });

  // ===========================================================================
  // Needs Writing Phase
  // ===========================================================================

  describe('needsWritingPhase', () => {
    it('should return false for warmup trials', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, true, true),
        nLevel: 2,
      });
      expect(orchestrator.needsWritingPhase(0, true)).toBe(false);
      expect(orchestrator.needsWritingPhase(1, true)).toBe(false);
    });

    it('should return false when no audio/color enabled', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(false, false, true),
        nLevel: 2,
      });
      expect(orchestrator.needsWritingPhase(2, false)).toBe(false);
    });

    it('should return true when audio enabled and not warmup', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, false, true),
        nLevel: 2,
      });
      expect(orchestrator.needsWritingPhase(2, false)).toBe(true);
    });

    it('should return true when color enabled and not warmup', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(false, true, true),
        nLevel: 2,
      });
      expect(orchestrator.needsWritingPhase(2, false)).toBe(true);
    });

    it('should return false when writing is disabled even with audio/color enabled', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, true, false),
        nLevel: 2,
      });
      expect(orchestrator.needsWritingPhase(2, false)).toBe(false);
    });

    it('should use per-trial activeModalities when provided (dynamic rules)', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, true, true),
        nLevel: 2,
      });

      expect(orchestrator.needsWritingPhase(2, false, ['position'])).toBe(false);
      expect(orchestrator.needsWritingPhase(2, false, ['position', 'audio'])).toBe(true);
      expect(orchestrator.needsWritingPhase(2, false, ['position', 'color'])).toBe(true);
    });
  });

  // ===========================================================================
  // Timeout Configuration
  // ===========================================================================

  describe('getTimeoutMs', () => {
    it('should return timeout from spec', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, false, true, 7000),
        nLevel: 2,
      });
      expect(orchestrator.getTimeoutMs()).toBe(7000);
    });
  });

  // ===========================================================================
  // Timeout Result
  // ===========================================================================

  describe('createTimeoutResult', () => {
    it('should create timeout result with expected values', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, true, true, 5000),
        nLevel: 2,
      });

      const result = orchestrator.createTimeoutResult({
        // @ts-expect-error test override
        expectedSound: 'A',
        // @ts-expect-error test override
        expectedColor: 'red',
        expectedDigit: 7,
        expectedWord: 'word-cat',
        expectedTone: 'C4',
        expectedSpatialDirection: 'left',
      });

      expect(result.timedOut).toBe(true);
      expect(result.isCorrect).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.recognizedLetter).toBe(null);
      expect(result.expectedLetter).toBe('A');
      expect(result.writingTimeMs).toBe(5000);
      expect(result.selectedColor).toBe(null);
      // @ts-expect-error test override
      expect(result.expectedColor).toBe('red');
      expect(result.colorCorrect).toBe(false);
      expect(result.expectedDigit).toBe('7');
      expect(result.digitCorrect).toBe(false);
      expect(result.expectedWord).toBe('word-cat');
      expect(result.wordCorrect).toBe(false);
      expect(result.expectedTone).toBe('C4');
      expect(result.toneCorrect).toBe(false);
      expect(result.expectedDirection).toBe('left');
      expect(result.directionCorrect).toBe(false);
    });

    it('should handle null expected values', () => {
      const orchestrator = createDefaultWritingOrchestrator({
        spec: createMockSpec(true, false, true, 3000),
        nLevel: 2,
      });

      const result = orchestrator.createTimeoutResult({
        expectedSound: null,
        expectedColor: null,
      });

      expect(result.expectedLetter).toBe(null);
      expect(result.expectedColor).toBe(null);
    });
  });
});
