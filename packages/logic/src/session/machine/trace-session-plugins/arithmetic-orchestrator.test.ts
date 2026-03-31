import { describe, expect, it } from 'bun:test';
import {
  createArithmeticOrchestrator,
  createNoopArithmeticOrchestrator,
} from './arithmetic-orchestrator';
import type { TraceSpec } from '../../../specs/trace.spec';

// Helper to create a minimal spec with arithmetic interference config
function createSpec(
  overrides: Partial<{
    enabled: boolean;
    timeoutMs: number;
    variant: 'simple' | 'color-cue-2step' | 'grid-cue-chain';
  }> = {},
): TraceSpec {
  return {
    id: 'dual-trace',
    name: 'Dual Trace',
    modeType: 'trace',
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
      isi: 3000,
    },
    scoring: {
      type: 'sdt',
      passThreshold: 1.5,
    },
    timing: {
      stimulusDurationMs: 500,
      feedbackDurationMs: 1500,
      isi: 3000,
    },
    extensions: {
      dynamicRules: true,
      gestureMode: 'swipe',
      writingPhase: { enabled: false, allowedDigits: [], timeoutMs: 5000, minConfidence: 0.5 },
      arithmeticInterference: {
        enabled: overrides.enabled ?? true,
        variant: overrides.variant ?? 'simple',
        minOperations: 4,
        maxOperations: 5,
        minResult: 1,
        maxResult: 20,
        maxDigit: 9,
        timeoutMs: overrides.timeoutMs ?? 10000,
        cueDisplayMs: 1000,
      },
      warmup: { enabled: false, trials: 3 },
    },
  } as unknown as TraceSpec;
}

function makeSeqRandom(seq: number[]): () => number {
  let i = 0;
  return () => {
    const v = seq[i];
    i++;
    return typeof v === 'number' ? v : 0.5;
  };
}

describe('createArithmeticOrchestrator', () => {
  describe('isEnabled', () => {
    it('should return true when enabled in spec', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec({ enabled: true }) });
      expect(orchestrator.isEnabled()).toBe(true);
    });

    it('should return false when disabled in spec', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec({ enabled: false }) });
      expect(orchestrator.isEnabled()).toBe(false);
    });
  });

  describe('needsArithmeticPhase', () => {
    it('should return true when enabled and not warmup', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec({ enabled: true }) });
      expect(orchestrator.needsArithmeticPhase(5, false)).toBe(true);
    });

    it('should return false during warmup', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec({ enabled: true }) });
      expect(orchestrator.needsArithmeticPhase(0, true)).toBe(false);
    });

    it('should return false when disabled', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec({ enabled: false }) });
      expect(orchestrator.needsArithmeticPhase(5, false)).toBe(false);
    });
  });

  describe('generateProblem', () => {
    it('should generate a valid arithmetic problem', () => {
      const orchestrator = createArithmeticOrchestrator({
        spec: createSpec(),
        random: () => 0.5, // Deterministic
      });

      const problem = orchestrator.generateProblem();

      expect(problem.expression).toBeTruthy();
      expect(typeof problem.answer).toBe('number');
      expect(problem.answer).toBeGreaterThanOrEqual(1);
      expect(problem.answer).toBeLessThanOrEqual(20);
    });

    it('should use injected random generator', () => {
      let callCount = 0;
      const mockRandom = () => {
        callCount++;
        return 0.5;
      };

      const orchestrator = createArithmeticOrchestrator({
        spec: createSpec(),
        random: mockRandom,
      });

      orchestrator.generateProblem();
      expect(callCount).toBeGreaterThan(0);
    });

    it('grid-cue-chain: cue digits come from last and previous positions (same encoding)', () => {
      const random = makeSeqRandom([
        0.1, // greenIsLast = true
        0.1, // leftIsV = true
        0.1, // token = V
      ]);

      const orchestrator = createArithmeticOrchestrator({
        spec: createSpec({ variant: 'grid-cue-chain' }),
        random,
      });

      const problem = orchestrator.generateProblem({
        stimulusPosition: 2, // digit 3
        previousStimulusPosition: 6, // digit 7
      });

      expect(problem.variant).toBe('grid-cue-chain');
      if (problem.variant !== 'grid-cue-chain') return;

      // V is lastDigit (3), N is prevDigit (7), left is V
      expect(problem.cue.leftToken).toBe('V');
      expect(problem.cue.leftDigit).toBe(3);
      expect(problem.cue.rightToken).toBe('N');
      expect(problem.cue.rightDigit).toBe(7);
      expect(problem.expression.startsWith('V')).toBe(true);
      expect(typeof problem.answer).toBe('number');
    });
  });

  describe('getTimeoutMs', () => {
    it('should return timeout from spec', () => {
      const orchestrator = createArithmeticOrchestrator({
        spec: createSpec({ timeoutMs: 15000 }),
      });
      expect(orchestrator.getTimeoutMs()).toBe(15000);
    });
  });

  describe('createTimeoutResult', () => {
    it('should return correct timeout result', () => {
      const orchestrator = createArithmeticOrchestrator({
        spec: createSpec({ timeoutMs: 10000 }),
      });

      const result = orchestrator.createTimeoutResult('3 + 5', 8);

      expect(result.expression).toBe('3 + 5');
      expect(result.correctAnswer).toBe(8);
      expect(result.userAnswer).toBe(null);
      expect(result.isCorrect).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.writingTimeMs).toBe(10000);
      expect(result.timedOut).toBe(true);
    });
  });

  describe('validateAnswer', () => {
    it('should mark correct answer as correct', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec() });

      const result = orchestrator.validateAnswer('3 + 5', 8, 8, 0.95, 2500);

      expect(result.expression).toBe('3 + 5');
      expect(result.correctAnswer).toBe(8);
      expect(result.userAnswer).toBe(8);
      expect(result.isCorrect).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.writingTimeMs).toBe(2500);
      expect(result.timedOut).toBe(false);
    });

    it('should mark incorrect answer as incorrect', () => {
      const orchestrator = createArithmeticOrchestrator({ spec: createSpec() });

      const result = orchestrator.validateAnswer('3 + 5', 8, 9, 0.8, 3000);

      expect(result.isCorrect).toBe(false);
      expect(result.userAnswer).toBe(9);
      expect(result.correctAnswer).toBe(8);
    });
  });
});

describe('createNoopArithmeticOrchestrator', () => {
  it('should always return disabled', () => {
    const orchestrator = createNoopArithmeticOrchestrator();
    expect(orchestrator.isEnabled()).toBe(false);
  });

  it('should never need arithmetic phase', () => {
    const orchestrator = createNoopArithmeticOrchestrator();
    expect(orchestrator.needsArithmeticPhase(5, false)).toBe(false);
  });

  it('should return zero answer for generateProblem', () => {
    const orchestrator = createNoopArithmeticOrchestrator();
    const problem = orchestrator.generateProblem();
    expect(problem.expression).toBe('0');
    expect(problem.answer).toBe(0);
  });

  it('should return zero timeout', () => {
    const orchestrator = createNoopArithmeticOrchestrator();
    expect(orchestrator.getTimeoutMs()).toBe(0);
  });

  it('should still validate answers correctly', () => {
    const orchestrator = createNoopArithmeticOrchestrator();
    const result = orchestrator.validateAnswer('1 + 1', 2, 2, 0.9, 1000);
    expect(result.isCorrect).toBe(true);
  });
});
