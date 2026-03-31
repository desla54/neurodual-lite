/**
 * Tests for specs/validation.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  safeValidateModeSpec,
  validateSessionConfig,
  isThresholdReasonable,
  ScoringSpecSchema,
  ScoringStrategySchema,
  SessionTypeSchema,
} from './validation';

describe('ScoringStrategySchema', () => {
  it('accepts valid strategies', () => {
    expect(ScoringStrategySchema.safeParse('sdt').success).toBe(true);
    expect(ScoringStrategySchema.safeParse('dualnback-classic').success).toBe(true);
    expect(ScoringStrategySchema.safeParse('brainworkshop').success).toBe(true);
    expect(ScoringStrategySchema.safeParse('accuracy').success).toBe(true);
  });

  it('rejects invalid strategies', () => {
    expect(ScoringStrategySchema.safeParse('invalid').success).toBe(false);
    expect(ScoringStrategySchema.safeParse('').success).toBe(false);
  });
});

describe('ScoringSpecSchema', () => {
  it('validates correct scoring config', () => {
    const result = ScoringSpecSchema.safeParse({
      strategy: 'sdt',
      passThreshold: 1.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing passThreshold', () => {
    const result = ScoringSpecSchema.safeParse({ strategy: 'sdt' });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive passThreshold', () => {
    const result = ScoringSpecSchema.safeParse({
      strategy: 'sdt',
      passThreshold: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional downThreshold', () => {
    const result = ScoringSpecSchema.safeParse({
      strategy: 'sdt',
      passThreshold: 1.5,
      downThreshold: 0.8,
    });
    expect(result.success).toBe(true);
  });
});

describe('SessionTypeSchema', () => {
  it('accepts valid session types', () => {
    expect(SessionTypeSchema.safeParse('GameSession').success).toBe(true);
    expect(SessionTypeSchema.safeParse('PlaceSession').success).toBe(true);
    expect(SessionTypeSchema.safeParse('MemoSession').success).toBe(true);
    expect(SessionTypeSchema.safeParse('DualPickSession').success).toBe(true);
    expect(SessionTypeSchema.safeParse('TraceSession').success).toBe(true);
  });

  it('rejects invalid session types', () => {
    expect(SessionTypeSchema.safeParse('InvalidSession').success).toBe(false);
  });
});

describe('safeValidateModeSpec', () => {
  it('returns error for empty object', () => {
    const result = safeValidateModeSpec({});
    expect(result.success).toBe(false);
  });

  it('returns error for non-object', () => {
    const result = safeValidateModeSpec('not an object');
    expect(result.success).toBe(false);
  });

  it('includes error details on failure', () => {
    const result = safeValidateModeSpec({ metadata: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('validateSessionConfig', () => {
  it('validates correct config', () => {
    const config = {
      nLevel: 2,
      activeModalities: ['position'],
      trialsCount: 20,
    };
    const result = validateSessionConfig(config);
    expect(result.nLevel).toBe(2);
  });

  it('throws on non-positive nLevel', () => {
    expect(() =>
      validateSessionConfig({
        nLevel: 0,
        activeModalities: [],
        trialsCount: 10,
      }),
    ).toThrow();
  });

  it('throws on missing fields', () => {
    expect(() => validateSessionConfig({})).toThrow();
  });
});

describe('isThresholdReasonable', () => {
  it('returns false for invalid spec', () => {
    expect(isThresholdReasonable({})).toBe(false);
    expect(isThresholdReasonable(null)).toBe(false);
    expect(isThresholdReasonable(undefined)).toBe(false);
  });
});

// =============================================================================
// Additional tests for uncovered functions
// =============================================================================

import {
  validateModeSpec,
  validateAllSpecs,
  devValidateSpec,
  validateJudgeMatchesSpec,
} from './validation';

// Minimal valid mode spec for testing (matching ModeSpecSchema requirements)
const createValidSpec = () => ({
  metadata: {
    id: 'test-mode',
    displayName: 'Test Mode',
    description: 'A test mode',
    tags: ['test'],
    difficultyLevel: 3,
    version: '1.0.0',
  },
  sessionType: 'GameSession' as const,
  timing: {
    stimulusDurationMs: 500,
    intervalMs: 3000,
  },
  scoring: {
    strategy: 'sdt' as const,
    passThreshold: 1.5,
  },
  generation: {
    generator: 'Sequence' as const,
    targetProbability: 0.3,
    lureProbability: 0.2,
  },
  defaults: {
    nLevel: 2,
    trialsCount: 40,
    activeModalities: ['position', 'audio'],
  },
  adaptivity: {
    algorithm: 'none' as const,
    nLevelSource: 'profile' as const,
    configurableSettings: [],
  },
  report: {
    sections: ['HERO', 'PERFORMANCE'],
    display: {
      modeScoreKey: 'report.modeScore.dprime',
      modeScoreTooltipKey: 'report.modeScore.tooltip',
      speedStatKey: 'report.speedStat.responseTime',
      colors: {
        bg: '#000000',
        border: '#111111',
        text: '#ffffff',
        accent: '#00ff00',
      },
    },
  },
});

describe('validateModeSpec', () => {
  it('should return parsed spec for valid input', () => {
    const spec = createValidSpec();
    const result = validateModeSpec(spec);
    expect(result.metadata.id).toBe('test-mode');
  });

  it('should throw for invalid spec', () => {
    const invalidSpec = { id: '' };
    expect(() => validateModeSpec(invalidSpec)).toThrow();
  });
});

describe('validateAllSpecs', () => {
  it('should validate all specs without throwing', () => {
    const specs = {
      'mode-a': createValidSpec(),
      'mode-b': { ...createValidSpec(), id: 'mode-b' },
    };
    expect(() => validateAllSpecs(specs)).not.toThrow();
  });

  it('should throw on first invalid spec', () => {
    const specs = {
      'valid-mode': createValidSpec(),
      'invalid-mode': { id: '' },
    };
    expect(() => validateAllSpecs(specs)).toThrow();
  });
});

describe('devValidateSpec', () => {
  it('should not throw (even for invalid specs in test mode)', () => {
    expect(() => devValidateSpec(createValidSpec())).not.toThrow();
    expect(() => devValidateSpec({ id: '' })).not.toThrow();
  });
});

describe('validateJudgeMatchesSpec', () => {
  it('should throw for invalid spec', () => {
    const invalidSpec = { id: '' };
    const judge = {};
    expect(() => validateJudgeMatchesSpec(invalidSpec, judge)).toThrow('Invalid ModeSpec');
  });

  it('should throw for SDT strategy with wrong judge', () => {
    const spec = createValidSpec();
    const judge = { constructor: { name: 'WrongJudge' } };
    expect(() => validateJudgeMatchesSpec(spec, judge)).toThrow('requires SDTJudge');
  });

  it('should accept SDT strategy with SDTJudge', () => {
    const spec = createValidSpec();
    const judge = { constructor: { name: 'SDTJudge' } };
    expect(() => validateJudgeMatchesSpec(spec, judge)).not.toThrow();
  });

  it('should throw for accuracy strategy with wrong judge', () => {
    const spec = {
      ...createValidSpec(),
      scoring: { strategy: 'accuracy', passThreshold: 0.8 },
    };
    const judge = { constructor: { name: 'WrongJudge' } };
    expect(() => validateJudgeMatchesSpec(spec, judge)).toThrow('requires AccuracyJudge');
  });

  it('should accept accuracy strategy with AccuracyJudge', () => {
    const spec = {
      ...createValidSpec(),
      scoring: { strategy: 'accuracy', passThreshold: 0.8 },
    };
    const judge = { constructor: { name: 'AccuracyJudge' } };
    expect(() => validateJudgeMatchesSpec(spec, judge)).not.toThrow();
  });
});

describe('isThresholdReasonable - extended', () => {
  it('should return true for reasonable SDT threshold', () => {
    const spec = createValidSpec();
    expect(isThresholdReasonable(spec)).toBe(true);
  });

  it('should return false for unreasonable SDT threshold (too high)', () => {
    const spec = {
      ...createValidSpec(),
      scoring: { strategy: 'sdt', passThreshold: 100 },
    };
    expect(isThresholdReasonable(spec)).toBe(false);
  });

  it('should return true for reasonable accuracy threshold', () => {
    const spec = {
      ...createValidSpec(),
      scoring: { strategy: 'accuracy', passThreshold: 0.8 },
    };
    expect(isThresholdReasonable(spec)).toBe(true);
  });

  it('should return false for unreasonable accuracy threshold', () => {
    const spec = {
      ...createValidSpec(),
      scoring: { strategy: 'accuracy', passThreshold: 80 },
    };
    expect(isThresholdReasonable(spec)).toBe(false);
  });

  it('should handle brainworkshop and dualnback-classic strategies', () => {
    const bwSpec = {
      ...createValidSpec(),
      scoring: { strategy: 'brainworkshop', passThreshold: 1.5 },
    };
    expect(isThresholdReasonable(bwSpec)).toBe(true);

    const jaeggiSpec = {
      ...createValidSpec(),
      scoring: { strategy: 'dualnback-classic', passThreshold: 1.5 },
    };
    expect(isThresholdReasonable(jaeggiSpec)).toBe(true);
  });
});
